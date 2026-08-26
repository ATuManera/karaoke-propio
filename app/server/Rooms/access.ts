import sql from 'sqlate'
import { db } from '../lib/Database.js'
import Rooms, { STATUSES } from './Rooms.js'
import type { Room } from '../../shared/types.js'

/**
 * Who may enter which room.
 *
 * The rule in one line: an admin may enter any room, and everyone else may
 * enter the rooms an admin assigned them, while those rooms are open.
 *
 * Assignment replaces the room password for people who have an account here
 * (see migration 018). The password did not go away — it still guards the one
 * door where there is no assignment to check, which is somebody arriving on an
 * invite with no account yet.
 */

export interface Enterer {
  userId: number | null
  isAdmin?: boolean
}

/** Raw assignments, whatever their rooms' status — the admin editor's view. */
export function getAssignedRoomIds (userId: number): number[] {
  const query = sql`
    SELECT roomId
    FROM userRooms
    WHERE userId = ${userId}
    ORDER BY roomId
  `
  return db.all<{ roomId: number }>(String(query), query.parameters).map(row => row.roomId)
}

/**
 * Replace someone's assignments with exactly this list.
 *
 * Whole-list rather than add/remove: the admin edits a set of checkboxes and
 * submits what should be true afterwards, and a diff computed on the client
 * would be a diff against whatever that browser last saw.
 *
 * A preference pointing at a room that just left the list is cleared here.
 * Leaving it would be harmless — it is only honoured while assigned — but it
 * would reappear as a silent surprise if that room were ever assigned again.
 */
export function setAssignedRoomIds (userId: number, roomIds: number[]): void {
  const wanted = [...new Set(roomIds.filter(id => Number.isInteger(id)))]

  db.exec('BEGIN IMMEDIATE')

  try {
    const del = sql`DELETE FROM userRooms WHERE userId = ${userId}`
    db.run(String(del), del.parameters)

    for (const roomId of wanted) {
      const ins = sql`
        INSERT OR IGNORE INTO userRooms (userId, roomId)
        VALUES (${userId}, ${roomId})
      `
      db.run(String(ins), ins.parameters)
    }

    const clear = sql`
      UPDATE users
      SET preferredRoomId = NULL
      WHERE userId = ${userId}
        AND preferredRoomId IS NOT NULL
        AND preferredRoomId NOT IN (SELECT roomId FROM userRooms WHERE userId = ${userId})
    `
    db.run(String(clear), clear.parameters)

    db.exec('COMMIT')
  } catch (err) {
    try {
      db.exec('ROLLBACK')
    } catch { /* already rolled back */ }

    throw err
  }
}

/**
 * Add one room to someone's assignments.
 *
 * This is what an accepted invite does. The code was handed out by whoever is
 * hosting that room, so using it is the grant — and making it stick is what
 * lets the same person come back tomorrow without being read the code again.
 */
export function grantRoom (userId: number, roomId: number): void {
  const query = sql`
    INSERT OR IGNORE INTO userRooms (userId, roomId)
    VALUES (${userId}, ${roomId})
  `
  db.run(String(query), query.parameters)
}

/**
 * The rooms this person can actually walk into right now.
 *
 * Closed rooms are included for an admin and for nobody else, which is the
 * rule Rooms.validate has always applied at sign-in.
 */
export function getEnterableRooms (user: Enterer): { result: number[], entities: Record<number, Room> } {
  if (user.isAdmin) return Rooms.get(undefined, { status: STATUSES })
  if (typeof user.userId !== 'number') return { result: [], entities: {} }

  const assigned = new Set(getAssignedRoomIds(user.userId))
  const open = Rooms.get()

  const result = open.result.filter(roomId => assigned.has(roomId))
  const entities = {}

  for (const roomId of result) entities[roomId] = open.entities[roomId]

  return { result, entities }
}

export function canEnterRoom (user: Enterer, roomId: number): boolean {
  return getEnterableRooms(user).result.includes(roomId)
}

/**
 * Where this person lands, given the rooms that are theirs.
 *
 * Their stored choice when it is still one of them, and otherwise the first —
 * so there is always something preselected, which is what the sign-in screen
 * promises. Null only when they have no rooms at all.
 */
export function getPreferredRoomId (user: Enterer): number | null {
  const rooms = getEnterableRooms(user)

  if (!rooms.result.length) return null
  if (typeof user.userId !== 'number') return null

  const query = sql`SELECT preferredRoomId FROM users WHERE userId = ${user.userId}`
  const stored = db.get<{ preferredRoomId: number | null }>(String(query), query.parameters)?.preferredRoomId ?? null

  return stored !== null && rooms.result.includes(stored) ? stored : rooms.result[0]
}

export function setPreferredRoomId (userId: number, roomId: number | null): void {
  const query = sql`
    UPDATE users
    SET preferredRoomId = ${roomId}
    WHERE userId = ${userId}
  `
  db.run(String(query), query.parameters)
}

/** Cleanup after a deleted room, so its id cannot be inherited by a new one. */
export function forgetRoom (roomId: number): void {
  const rows = sql`DELETE FROM userRooms WHERE roomId = ${roomId}`
  db.run(String(rows), rows.parameters)

  const prefs = sql`UPDATE users SET preferredRoomId = NULL WHERE preferredRoomId = ${roomId}`
  db.run(String(prefs), prefs.parameters)
}

/** Cleanup after a deleted account. */
export function forgetUser (userId: number): void {
  const query = sql`DELETE FROM userRooms WHERE userId = ${userId}`
  db.run(String(query), query.parameters)
}
