import nodeCrypto from 'node:crypto'
import crypto from '../lib/crypto.js'
import sql from 'sqlate'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from '../../shared/roomCode.js'
import { db } from '../lib/Database.js'
import { ValidationError } from '../lib/Errors.js'
import { MessageError } from '../lib/i18n.js'
import { areDedicationsShown } from '../../shared/dedication.js'

const NAME_MIN_LENGTH = 1
const NAME_MAX_LENGTH = 50
const PASSWORD_MIN_LENGTH = 5

export const STATUSES = ['open', 'closed']

/**
 * Every room needs a code before any invite can be made. Called at startup so
 * rooms that predate the column (and any created by older code) get one
 * without an admin having to notice.
 */
export function ensureRoomCodes (): number {
  const rows = db.all<{ roomId: number }>('SELECT roomId FROM rooms WHERE code IS NULL', [])

  for (const row of rows) {
    db.run('UPDATE rooms SET code = ? WHERE roomId = ?', [newUniqueCode(), row.roomId])
  }

  return rows.length
}

/** Retries on the (astronomically unlikely) collision rather than failing a room creation. */
export function newUniqueCode (): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateRoomCode(n => new Uint8Array(nodeCrypto.randomBytes(n)))
    const taken = db.get<{ roomId: number }>('SELECT roomId FROM rooms WHERE code = ?', [code])
    if (!taken) return code
  }

  throw new Error('could not generate a unique room code')
}

/**
 * Resolve an invite code to a room.
 *
 * Lookup is by code alone — deliberately no way to ask "what code does room 3
 * have?" from outside, or the sequential id would be a way back in.
 */
export function getRoomIdByCode (code: string): number | null {
  if (!isValidRoomCode(code)) return null

  const row = db.get<{ roomId: number }>('SELECT roomId FROM rooms WHERE code = ?', [normalizeRoomCode(code)])
  return row?.roomId ?? null
}

// Remember which users have been seen in each room
const roomUsers: Map<number, Set<number>> = new Map()

class Rooms {
  /**
   * Get all rooms
   */
  static get (
    roomId: number | null | undefined = undefined,
    { status = ['open'], includePassword = false, includeCode = false }:
    { status?: string[], includePassword?: boolean, includeCode?: boolean } = {},
  ): { result: number[], entities: Record<number, any> } {
    const result = []
    const entities = {}
    const whereConditions = []
    let whereClause = sql``

    if (typeof roomId === 'number') {
      whereConditions.push(sql`roomId = ${roomId}`)
    }

    if (status && status.length > 0) {
      whereConditions.push(sql`status IN ${sql.tuple(status)}`)
    }

    if (whereConditions.length > 0) {
      whereClause = sql`WHERE ${whereConditions.reduce((acc, curr, index) => {
        if (index > 0) return sql`${acc} AND ${curr}`
        return curr
      })}`
    }

    const query = sql`
      SELECT *
      FROM rooms
      ${whereClause}
      ORDER BY dateCreated DESC
    `
    const res = db.all<{
      roomId: number
      name: string // assuming name exists
      status: string // assuming status exists
      data: string
      password?: string | null
      dateCreated: string | number
      prefs?: any
      hasPassword?: boolean
      code?: string
    }>(String(query), query.parameters)

    res.forEach((row) => {
      const data = JSON.parse(row.data)
      row.prefs = data.prefs ?? {}
      delete row.data

      row.hasPassword = !!row.password
      if (!includePassword) delete row.password

      // The room list is readable without signing in, so the invite code must
      // never ride along: publishing every code would make them as good as the
      // sequential ids they replaced. Callers that legitimately need it (the
      // Player showing the QR, an admin) ask for it explicitly.
      if (!includeCode) delete row.code

      row.dateCreated = parseInt(String(row.dateCreated), 10) // v1.0 schema used 'text' column

      result.push(row.roomId)
      entities[row.roomId] = row
    })

    return { result, entities }
  }

  /**
   * Whether this room shows what people write on its songs.
   *
   * The answer for a room that has never been asked is yes — see
   * areDedicationsShown, which is where that rule lives. A missing room is
   * also yes: nobody is in it to be affected, and guessing "off" here would
   * make a transient read failure look like an admin's decision.
   */
  static areDedicationsEnabled (roomId: number): boolean {
    return areDedicationsShown(Rooms.get(roomId).entities[roomId]?.prefs)
  }

  /**
   * Flip just this room's dedication switch, leaving the rest of its prefs
   * alone.
   *
   * Separate from set() because the two are asked for in different places
   * and mean different things. set() is the Edit Room form: a whole room
   * submitted at once, name and status and prefs together. This is one
   * checkbox in the playback menu during a party, where the caller knows the
   * boolean and nothing else — making it go through set() would mean sending
   * a room name back to the server to change a boolean, and getting that
   * name wrong would rename the room.
   *
   * Read and write in one transaction so a save from the Edit Room form at
   * the same moment cannot land between them and be overwritten.
   */
  static setDedicationsEnabled (roomId: number, isEnabled: boolean): void {
    db.exec('BEGIN IMMEDIATE')

    try {
      const prefs = Rooms.get(roomId).entities[roomId]?.prefs

      if (!prefs) {
        db.exec('ROLLBACK')
        throw new ValidationError('Invalid roomId')
      }

      const query = sql`
        UPDATE rooms
        SET data = json_set(data, '$.prefs', json(${JSON.stringify({ ...prefs, dedications: { isEnabled } })}))
        WHERE roomId = ${roomId}
      `
      db.run(String(query), query.parameters)
      db.exec('COMMIT')
    } catch (err) {
      // a ValidationError above has already rolled back; anything else has not
      try {
        db.exec('ROLLBACK')
      } catch { /* already rolled back */ }

      throw err
    }
  }

  static async set (roomId, room) {
    const { name, password, status, prefs } = room
    let query

    if (!name || !name.trim() || name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
      throw new ValidationError(`Room name must have ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters`)
    }

    if (password && password.length < PASSWORD_MIN_LENGTH) {
      throw new ValidationError(`Room password must have at least ${PASSWORD_MIN_LENGTH} characters`)
    }

    if (!status || !STATUSES.includes(status)) {
      throw new ValidationError('Invalid room status')
    }

    if (typeof roomId === 'number') {
      const passwordSql = typeof password === 'undefined'
        // leave unchanged
        ? sql``
        // empty string unsets password
        : sql`password = ${password === '' ? null : await crypto.hash(password)},`

      query = sql`
        UPDATE rooms
        SET name = ${name},
            ${passwordSql}
            status = ${status},
            data = json_set(data, '$.prefs', json(${JSON.stringify(prefs)}))
        WHERE roomId = ${roomId}
      `
    } else {
      query = sql`
        INSERT INTO rooms (name, password, status, dateCreated, data, code)
        VALUES (
          ${name},
          ${typeof password === 'undefined' ? null : await crypto.hash(password)},
          ${status},
          ${Math.floor(Date.now() / 1000)},
          json_set('{}', '$.prefs', json(${JSON.stringify(prefs)})),
          ${newUniqueCode()}
        )
      `
    }

    return db.run(String(query), query.parameters)
  }

  /**
   * Validate a room against optional criteria
   */
  static async validate (
    roomId: number,
    password: string | undefined,
    {
      isOpen = true,
      validatePassword = true,
      role,
    }: {
      isOpen?: boolean
      validatePassword?: boolean
      role?: any
    } = {},
  ): Promise<boolean> {
    const res = Rooms.get(roomId, { includePassword: true })
    const room = res.entities[roomId]

    if (!room) {
      throw new MessageError(404, 'server.room.notFound')
    }

    if (isOpen && room.status !== 'open') {
      throw new MessageError(403, 'server.room.notOpen')
    }

    if (validatePassword && room.password) {
      if (!password) {
        throw new MessageError(401, 'server.room.passwordRequired')
      }

      if (!(await crypto.compare(password, room.password))) {
        throw new MessageError(401, 'server.room.passwordIncorrect')
      }

      if (crypto.isLegacy(room.password)) {
        const newHash = await crypto.hash(password)
        const query = sql`
          UPDATE rooms
          SET password = ${newHash}
          WHERE roomId = ${roomId}
        `
        db.run(String(query), query.parameters)
      }
    }

    if (role) {
      const query = sql`SELECT roleId FROM roles WHERE name = ${role}`
      const row = db.get<{ roleId: number }>(String(query), query.parameters)
      const roleId = row?.roleId

      if (!roleId) {
        throw new MessageError(404, 'server.room.roleNotFound')
      }

      if (!room.prefs?.roles?.[roleId]?.allowNew) {
        throw new MessageError(403, 'server.room.roleNotAllowed', { role })
      }
    }

    return true
  }

  static prefix (roomId: string | number = '') {
    return `ROOM_ID_${roomId}`
  }

  /**
   * Utility method to list active rooms on a socket.io instance
   */
  static getActive (io: any): { room: string, roomId: number }[] {
    const rooms = []

    for (const room of io.sockets.adapter.rooms.keys()) {
      // ignore auto-generated per-user rooms
      if (room.startsWith(Rooms.prefix())) {
        const roomId = parseInt(room.substring(Rooms.prefix().length), 10)
        rooms.push({ room, roomId })
      }
    }

    return rooms
  }

  /**
   * Utility method to determine if a player is in a room
   */
  static isPlayerPresent (io: any, roomId: number): boolean {
    for (const sock of io.of('/').sockets.values()) {
      if (sock.user && sock.user.roomId === roomId && sock._lastPlayerStatus) {
        return true
      }
    }

    return false
  }

  /**
   * Remember that a user has been in a room
   */
  static trackUser (roomId: number, userId: number) {
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Set())
    }

    roomUsers.get(roomId)!.add(userId)
  }

  /**
   * Check if a user has been in a room (since server start)
   */
  static hasUserBeenInRoom (roomId: number, userId: number): boolean {
    return roomUsers.get(roomId)?.has(userId) ?? false
  }
}

export default Rooms
