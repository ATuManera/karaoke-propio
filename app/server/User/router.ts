import { promisify } from 'util'
import fs from 'fs'
import { randomUUID } from 'node:crypto'
import { db } from '../lib/Database.js'
import sql from 'sqlate'
import jsonWebToken from 'jsonwebtoken'
import crypto from '../lib/crypto.js'
import KoaRouter from '@koa/router'
import Prefs from '../Prefs/Prefs.js'
import Queue from '../Queue/Queue.js'
import Rooms, { getRoomIdByCode } from '../Rooms/Rooms.js'
import {
  canEnterRoom,
  getAssignedRoomIds,
  getEnterableRooms,
  getPreferredRoomId,
  grantRoom,
  setAssignedRoomIds,
  setPreferredRoomId,
} from '../Rooms/access.js'
import { InviteFailureLimiter, isInviteFor } from '../Rooms/inviteGuard.js'
import User from '../User/User.js'
import parseCookie from '../lib/parseCookie.js'
import { MessageError, rethrowAs } from '../lib/i18n.js'
import { isSupportedLocale, matchLocale } from '../../shared/i18n/index.js'
import { QUEUE_PUSH, SOCKET_AUTH_ERROR } from '../../shared/actionTypes.js'
import {
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  NAME_MIN_LENGTH,
  NAME_MAX_LENGTH,
  IMG_MAX_LENGTH,
} from './User.js'

interface File {
  filepath: string
  size: number
}

interface RequestWithBody {
  body: Record<string, any>
  files?: Record<string, File | File[]>
}

const router = new KoaRouter({ prefix: '/api' })

// Its own allowance, separate from the one on the code-lookup endpoint: a
// guest arriving by QR spends both, and sharing a bucket would have them
// locking each other out halfway through a party.
const joinFailures = new InviteFailureLimiter(10, 60_000)
const readFile = promisify(fs.readFile)
const deleteFile = promisify(fs.unlink)
const { sign: jwtSign } = jsonWebToken

/**
 * Sign a session token.
 *
 * The `jti` is what makes one session distinguishable from another. Without
 * it the payload is the account plus `iat`, which counts whole seconds, so
 * signing the same account into the same room twice in the same second — a
 * host setting up the TV and then their phone — yields two byte-identical
 * tokens. Logout tells sessions apart by their token, and would take both.
 */
const signSession = (userCtx: object, jwtKey: string) => jwtSign(userCtx, jwtKey, { jwtid: randomUUID() })

// Takes the "raw" object returned by the User class and massages it
// into the shape used by the client (state.user) and in server-side
// routers. Should be used to generate the JWT.
const createUserCtx = (user, roomId) => {
  return {
    dateCreated: user.dateCreated,
    dateUpdated: user.dateUpdated,
    isAdmin: user.role === 'admin',
    isGuest: user.role === 'guest',
    // carried in the session so every router can answer in the reader's
    // language without a query per request; re-signed whenever it changes
    locale: user.locale ?? null,
    name: user.name,
    roomId: parseInt(roomId, 10) || null,
    userId: user.userId,
    username: user.username,
  }
}

// login
router.post('/login', async (ctx) => {
  const req = ctx.request as unknown as RequestWithBody
  let user

  try {
    user = await User.validate(req.body as any)
  } catch (err) {
    rethrowAs(401, err)
  }

  // Which room is no longer part of signing in. The sign-in screen does not
  // publish the room list any more, so there is nothing there to choose from:
  // a person says who they are, and the rooms an admin gave them are read off
  // their account afterwards.
  const enterer = { userId: user.userId, isAdmin: user.role === 'admin' }
  const roomCode = typeof req.body.roomCode === 'string' ? req.body.roomCode.trim() : ''
  let roomId: number | null = null

  if (roomCode) {
    // An invite in hand names its room, and is what grants it: the code was
    // handed out by whoever is hosting. Somebody who already has an account
    // can arrive on a QR like anyone else, and this is where that becomes a
    // standing assignment rather than one night's exception.
    if (joinFailures.isBlocked(ctx.request.ip)) {
      throw new MessageError(429, 'server.user.tooManyAttempts')
    }

    const invitedRoomId = getRoomIdByCode(roomCode)

    if (invitedRoomId === null) {
      joinFailures.recordFailure(ctx.request.ip)
      throw new MessageError(401, 'server.user.inviteRequired')
    }

    try {
      await Rooms.validate(invitedRoomId, req.body.roomPassword, {
        isOpen: user.role !== 'admin', // admins can sign in to closed rooms
        // The room password is asked for only where there is no assignment to
        // stand in for it — an invite into a room this account was never
        // given. Once an admin has assigned it, that decision is the
        // credential, and demanding a secret the admin never handed over
        // would lock out the very person they let in.
        validatePassword: !canEnterRoom(enterer, invitedRoomId),
      })
    } catch (err) {
      rethrowAs(401, err)
    }

    grantRoom(user.userId, invitedRoomId)
    setPreferredRoomId(user.userId, invitedRoomId)
    roomId = invitedRoomId
  } else {
    // One room is not a question, so it is not asked; more than one is asked
    // on its own screen, once there is a session to ask it in.
    const rooms = getEnterableRooms(enterer)

    if (rooms.result.length === 1) {
      roomId = rooms.result[0]
      setPreferredRoomId(user.userId, roomId)
    }
  }

  if (crypto.isLegacy(user.password)) {
    const newHash = await crypto.hash(req.body.password)
    const query = sql`
      UPDATE users
      SET password = ${newHash}, dateUpdated = ${Math.floor(Date.now() / 1000)}
      WHERE userId = ${user.userId}
    `
    db.run(String(query), query.parameters)
  }

  const userCtx = createUserCtx(user, roomId)

  // create JWT
  const token = signSession(userCtx, ctx.jwtKey)

  // set JWT as an httpOnly cookie
  ctx.cookies.set('keToken', token, {
    httpOnly: true,
    sameSite: 'lax',
  })

  ctx.body = userCtx
})

// logout
router.get('/logout', async (ctx) => {
  const { keToken } = parseCookie(ctx.request.header.cookie)

  ctx.cookies.set('keToken', '')
  ctx.status = 200
  ctx.body = {}

  if (!keToken) return

  // A cookie belongs to the browser, not to the tab that cleared it, so every
  // other tab is signed out too — and the one that matters is a running
  // Player. Its socket was authenticated once, at the handshake, and keeps
  // working: queue pushes still arrive, the current song still plays, and
  // nothing looks wrong until the next song needs bytes. Then the media
  // request goes out with no cookie, is refused, and the browser reports the
  // refusal the only way a <video> can — as a file it cannot decode.
  //
  // So say it out loud instead. Every socket holding this exact token is told
  // its session ended and dropped; the client resets state.user on
  // SOCKET_AUTH_ERROR and the Player lands on the sign-in screen, which is
  // both true and actionable.
  //
  // Matched on the token and never on the userId: the same account signed in
  // on someone's phone is a different session and has no part in this.
  for (const sock of await ctx.io.fetchSockets()) {
    if (parseCookie(sock.handshake.headers.cookie).keToken !== keToken) continue

    sock.emit('action', { type: SOCKET_AUTH_ERROR })
    sock.disconnect()
  }
})

// get own account (helps sync account changes across devices)
router.get('/user', (ctx) => {
  if (typeof ctx.user.userId !== 'number') {
    ctx.throw(401)
  }

  // include credentials since their username may have changed
  const user = User.getById(ctx.user.userId, true)

  if (!user) {
    ctx.throw(404)
  }

  ctx.body = createUserCtx(user, ctx.user.roomId)
})

/**
 * The rooms this person may enter, and which one is preselected.
 *
 * Its own endpoint rather than the room list: /api/rooms answers "what rooms
 * are there", which an admin asks and the Rooms panel renders, while this
 * answers "where may I go", which is the question the screen after sign-in
 * puts to the person holding the phone.
 */
router.get('/user/rooms', (ctx) => {
  if (typeof ctx.user.userId !== 'number') {
    ctx.throw(401)
    return
  }

  const res = getEnterableRooms(ctx.user)

  res.result.forEach((roomId) => {
    const sockets = ctx.io.sockets.adapter.rooms.get(Rooms.prefix(roomId))

    // whether a party is already going in there, never how many people —
    // the same line the room list has always drawn
    res.entities[roomId].isLive = sockets ? sockets.size > 0 : false

    // nothing on this screen reads a room's prefs, and the invite code must
    // never ride along (Rooms.get already withholds it)
    delete res.entities[roomId].prefs
  })

  ctx.body = {
    ...res,
    preferredRoomId: getPreferredRoomId(ctx.user),
  }
})

/**
 * Enter a room, or move to another one.
 *
 * The room rides in the session token, which is signed at sign-in — so
 * changing it means signing a new one, and the client has to reconnect its
 * socket to be let into the new room (see server/socket.ts, where the join
 * happens at the handshake and nowhere else).
 *
 * The choice is remembered as this person's preference. The admin sets the
 * first one when assigning rooms; every one after that is theirs.
 */
router.put('/user/room', async (ctx) => {
  if (typeof ctx.user.userId !== 'number') {
    ctx.throw(401)
    return
  }

  const req = ctx.request as unknown as RequestWithBody
  const roomId = parseInt(req.body.roomId, 10)

  if (Number.isNaN(roomId)) {
    throw new MessageError(422, 'server.room.notFound')
  }

  // Checked here and not only in the picker: the picker is a list of buttons
  // on somebody's phone, and this is the door.
  if (!canEnterRoom(ctx.user, roomId)) {
    throw new MessageError(403, 'server.room.notAssigned')
  }

  const user = User.getById(ctx.user.userId, true)

  if (!user) {
    ctx.throw(404)
    return
  }

  setPreferredRoomId(user.userId, roomId)

  const userCtx = createUserCtx(user, roomId)

  ctx.cookies.set('keToken', signSession(userCtx, ctx.jwtKey), {
    httpOnly: true,
    sameSite: 'lax',
  })

  ctx.body = userCtx
})

/**
 * Choose the language, or hand the choice back to the browser.
 *
 * Its own endpoint rather than a field on the account update, because that
 * one demands the current password before it changes anything — the right
 * price for a new username, an absurd one for reading the screen in Spanish.
 * Nothing here is a credential: the worst a stolen call can do is make
 * someone's own phone speak a language they can change back in one tap.
 */
router.put('/user/locale', async (ctx) => {
  if (typeof ctx.user.userId !== 'number') {
    ctx.throw(401)
    return
  }

  const req = ctx.request as unknown as RequestWithBody
  const raw = req.body?.locale

  // null (or nothing) is a real answer: "stop forcing one, follow the phone"
  const asked = raw === null || raw === undefined || raw === '' ? null : String(raw)

  if (asked !== null && !isSupportedLocale(asked)) {
    throw new MessageError(422, 'server.user.localeUnsupported')
  }

  // stored in the one spelling the whole app compares against: the client
  // checks its copy against the registry exactly, and would quietly ignore an
  // 'ES' that the server was happy to accept
  const locale = asked === null ? null : matchLocale([asked])

  const query = sql`
    UPDATE users
    SET locale = ${locale}
    WHERE userId = ${ctx.user.userId}
  `
  db.run(String(query), query.parameters)

  const user = User.getById(ctx.user.userId, true)

  if (!user) {
    ctx.throw(404)
    return
  }

  // the language rides in the session token, so a changed one has to be
  // re-signed or the server would keep answering in the old language until
  // the next sign-in
  const userCtx = createUserCtx(user, ctx.user.roomId || null)

  ctx.cookies.set('keToken', signSession(userCtx, ctx.jwtKey), {
    httpOnly: true,
    sameSite: 'lax',
  })

  ctx.body = userCtx
})

// list all users (admin only)
router.get('/users', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const userRooms = {} // { userId: [roomId, roomId, ...]}
  const sockets = await ctx.io.fetchSockets()

  for (const s of sockets) {
    if (s.user && typeof s.user.roomId === 'number') {
      if (userRooms[s.user.userId]) {
        userRooms[s.user.userId].push(s.user.roomId)
      } else {
        userRooms[s.user.userId] = [s.user.roomId]
      }
    }
  }

  // get all users
  const users = User.get()

  users.result.forEach((userId) => {
    // where they are right now, which is not the same question as where they
    // are allowed — the filter above this table reads the first, the room
    // assignment editor reads the second
    users.entities[userId].rooms = userRooms[userId] || []
    users.entities[userId].assignedRoomIds = getAssignedRoomIds(userId)
    users.entities[userId].preferredRoomId = getPreferredRoomId({
      userId,
      isAdmin: users.entities[userId].role === 'admin',
    })
  })

  ctx.body = users
})

// delete a user (admin only)
router.delete('/user/:userId', async (ctx) => {
  const targetId = parseInt(ctx.params.userId, 10)

  if (!ctx.user.isAdmin || targetId === ctx.user.userId) {
    ctx.throw(403)
  }

  User.remove(targetId)

  // disconnect their socket session(s)
  const sockets = await ctx.io.fetchSockets()

  for (const s of sockets) {
    if (s?.user.userId === targetId) {
      s.disconnect()
    }
  }

  // emit (potentially) updated queues to each room
  for (const { room, roomId } of Rooms.getActive(ctx.io)) {
    ctx.io.to(room).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(roomId),
    })
  }

  // success
  ctx.status = 200
  ctx.body = {}
})

// update a user account
router.put('/user/:userId', async (ctx) => {
  const targetId = parseInt(ctx.params.userId, 10)
  const user = User.getById(ctx.user.userId, true)

  // must be admin if updating another user
  if (!user) {
    ctx.throw(401)
    return
  }

  if (targetId !== user.userId && user.role !== 'admin') {
    ctx.throw(401)
    return
  }

  const req = ctx.request as unknown as RequestWithBody
  let { name, username } = req.body
  const { password, newPassword, newPasswordConfirm } = req.body

  // validate current password if updating own account
  if (targetId === user.userId && !ctx.user.isGuest) {
    if (!password) {
      throw new MessageError(422, 'server.user.currentPasswordRequired')
    }

    if (!(await crypto.compare(password, user.password))) {
      throw new MessageError(401, 'server.user.currentPasswordIncorrect')
    }
  }

  // validated
  const fields = new Map()

  // changing username?
  if (username && !ctx.user.isGuest) {
    username = username.trim()

    if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
      throw new MessageError(400, 'server.user.usernameLength', { min: USERNAME_MIN_LENGTH, max: USERNAME_MAX_LENGTH })
    }

    // check for duplicate
    if (User.getByUsername(username)) {
      throw new MessageError(409, 'server.user.usernameTaken')
    }

    fields.set('username', username)
  }

  // changing display name?
  if (name) {
    name = name.trim()

    if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
      throw new MessageError(400, 'server.user.displayNameLength', { min: NAME_MIN_LENGTH, max: NAME_MAX_LENGTH })
    }

    fields.set('name', name)
  }

  // changing password?
  if (newPassword && !ctx.user.isGuest) {
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      throw new MessageError(400, 'server.user.passwordLength', { min: PASSWORD_MIN_LENGTH })
    }

    if (newPassword !== newPasswordConfirm) {
      throw new MessageError(422, 'server.user.passwordsDoNotMatch')
    }

    fields.set('password', await crypto.hash(newPassword))
  }

  // changing user image?
  if (req.files && req.files.image) {
    const imageFile = Array.isArray(req.files.image) ? req.files.image[0] : req.files.image

    if (imageFile.size > IMG_MAX_LENGTH) {
      await deleteFile(imageFile.filepath)
      throw new MessageError(413, 'server.user.imageTooLarge', { max: Math.floor(IMG_MAX_LENGTH / 1024) })
    }

    fields.set('image', await readFile(imageFile.filepath))
    await deleteFile(imageFile.filepath)
  } else if (req.body.image === 'null') {
    fields.set('image', null)
  }

  // changing role?
  if (req.body.role) {
    // @todo since we're not ensuring there'd be at least one admin
    // remaining, changing one's own role is currently disallowed
    if (user.role !== 'admin' || targetId === user.userId) {
      ctx.throw(403)
    }

    fields.set('roleId', sql`(SELECT roleId FROM roles WHERE name = ${req.body.role})`)
  }

  // changing which rooms they may enter? (admin only)
  //
  // Sent whole rather than as a change: the editor submits the set of rooms
  // that should be true afterwards, so an unchecked box is a revocation and
  // not an omission. Assignments are their own table, so they are applied
  // here rather than joining the column list below.
  if (user.role === 'admin' && typeof req.body.roomIds === 'string') {
    let roomIds: number[]

    try {
      const parsed = JSON.parse(req.body.roomIds)
      roomIds = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : []
    } catch {
      throw new MessageError(422, 'server.user.invalidRooms')
    }

    setAssignedRoomIds(targetId, roomIds)

    // The first preselection is the admin's; every one after it is the
    // person's own, so this only ever writes what the admin actually chose.
    const preferred = parseInt(req.body.preferredRoomId, 10)

    if (roomIds.includes(preferred)) {
      setPreferredRoomId(targetId, preferred)
    }
  }

  fields.set('dateUpdated', Math.floor(Date.now() / 1000))

  const query = sql`
    UPDATE users
    SET ${sql.tuple(Array.from(fields.keys()).map(sql.column))} = ${sql.tuple(Array.from(fields.values()))}
    WHERE userId = ${targetId}
  `
  const res = db.run(String(query), query.parameters)

  if (!res.changes) {
    ctx.throw(404, `userId ${targetId} not found`)
  }

  // Somebody whose room was just taken away is still sitting in it: their
  // socket joined at the handshake and nothing since has asked whether they
  // may still be there. So say it out loud and drop them, the way logout
  // does — otherwise an admin revokes access and watches that phone go on
  // queueing songs into the room.
  const targetUser = User.getById(targetId)

  if (user.role === 'admin' && targetUser) {
    const enterer = { userId: targetId, isAdmin: targetUser.role === 'admin' }

    for (const s of await ctx.io.fetchSockets()) {
      if (s.user?.userId !== targetId) continue
      if (typeof s.user.roomId !== 'number') continue
      if (canEnterRoom(enterer, s.user.roomId)) continue

      s.emit('action', { type: SOCKET_AUTH_ERROR })
      s.disconnect()
    }
  }

  // emit (potentially) updated queues to each room
  // @todo: only update rooms the user is in
  for (const { room, roomId } of Rooms.getActive(ctx.io)) {
    ctx.io.to(room).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(roomId),
    })
  }

  // updating another account? we're done
  if (targetId !== user.userId) {
    ctx.status = 200
    ctx.body = {}
    return
  }

  // updating own account: send updated token
  let updatedUser

  if (user.role !== 'guest') {
    try {
      updatedUser = await User.validate({
        username: username || user.username,
        password: newPassword || password,
      })
    } catch (err) {
      rethrowAs(401, err)
    }
  } else {
    updatedUser = {
      ...user,
      name: name || user.name,
    }
  }

  const userCtx = createUserCtx(updatedUser, ctx.user.roomId || null)

  // create JWT
  // @todo: this should not extend the JWT expiry date
  const token = signSession(userCtx, ctx.jwtKey)

  // set JWT as an httpOnly cookie
  ctx.cookies.set('keToken', token, {
    sameSite: 'lax',
    httpOnly: true,
  })

  ctx.body = userCtx
})

// create account
router.post('/user', async (ctx) => {
  const req = ctx.request as unknown as RequestWithBody
  const invitedRoomId = parseInt(req.body.roomId, 10)
  let image

  if (!ctx.user.isAdmin) {
    // already signed in?
    if (ctx.user.userId !== null) {
      throw new MessageError(401, 'server.user.alreadySignedIn')
    }

    // only possible roles; further validated per-room below
    if (!['guest', 'standard'].includes(req.body.role)) {
      throw new MessageError(401, 'server.user.invalidRole')
    }

    // An invite is what says this person was asked in, and — since migration
    // 018 — what assigns them the room afterwards.
    //
    // Room prefs allowing new guests cannot carry that weight on their own:
    // they have to be on for any QR to work at all, so with only that check a
    // stranger who found the address could sign in as a guest and be handed
    // the room's queue and its photo album. The code they scanned is the
    // permission, and it is checked here rather than only in the form.
    if (joinFailures.isBlocked(ctx.request.ip)) {
      throw new MessageError(429, 'server.user.tooManyAttempts')
    }

    if (!isInviteFor(invitedRoomId, req.body.roomCode, getRoomIdByCode)) {
      joinFailures.recordFailure(ctx.request.ip)
      throw new MessageError(401, 'server.user.inviteRequired')
    }

    // new users arrive with the room their invite names
    try {
      await Rooms.validate(
        invitedRoomId,
        req.body.roomPassword,
        { role: req.body.role },
      )
    } catch (err) {
      rethrowAs(401, err)
    }
  }

  if (req.files && req.files.image) {
    const imageFile = Array.isArray(req.files.image) ? req.files.image[0] : req.files.image

    if (imageFile.size > IMG_MAX_LENGTH) {
      await deleteFile(imageFile.filepath)
      throw new MessageError(413, 'server.user.imageTooLarge', { max: Math.floor(IMG_MAX_LENGTH / 1024) })
    }

    image = await readFile(imageFile.filepath)
    await deleteFile(imageFile.filepath)
  }

  // create user
  try {
    const userId = await User.create({ ...req.body, image } as any, req.body.role)

    // if admin creating another user, we're done — bar the rooms they were
    // given on the way in, which is the whole point of creating them
    if (ctx.user.isAdmin) {
      if (typeof req.body.roomIds === 'string') {
        let roomIds: number[]

        try {
          const parsed = JSON.parse(req.body.roomIds)
          roomIds = Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : []
        } catch {
          throw new MessageError(422, 'server.user.invalidRooms')
        }

        setAssignedRoomIds(userId, roomIds)

        const preferred = parseInt(req.body.preferredRoomId, 10)

        if (roomIds.includes(preferred)) {
          setPreferredRoomId(userId, preferred)
        }
      }

      ctx.status = 200
      ctx.body = {}
      return
    }

    // The invite that let them in is also what assigns them the room, so
    // tomorrow they sign in and land back in it without being read a code
    // again.
    grantRoom(userId, invitedRoomId)
    setPreferredRoomId(userId, invitedRoomId)

    const user = User.getById(userId, true)

    if (!user) {
      throw new Error('User not found')
    }

    const userCtx = createUserCtx(user, invitedRoomId || null)

    // create JWT
    const token = signSession(userCtx, ctx.jwtKey)

    // set JWT as an httpOnly cookie
    ctx.cookies.set('keToken', token, {
      sameSite: 'lax',
      httpOnly: true,
    })

    ctx.body = userCtx
  } catch (err) {
    rethrowAs(403, err)
  }
})

// first-time setup
router.post('/setup', async (ctx) => {
  const prefs: any = Prefs.get()
  let image

  // must be first run
  if (prefs.isFirstRun !== true) {
    ctx.throw(403)
  }

  try {
    // create admin user
    const req = ctx.request as unknown as RequestWithBody
    const userId = await User.create({ ...req.body, image } as any, 'admin')
    const user = User.getById(userId, true)

    if (!user) {
      throw new Error('User not found')
    }

    // create default room
    const fields = new Map()
    fields.set('name', 'Room 1')
    fields.set('status', 'open')
    fields.set('dateCreated', Math.floor(Date.now() / 1000))

    const roomQuery = sql`
      INSERT INTO rooms ${sql.tuple(Array.from(fields.keys()).map(sql.column))}
      VALUES ${sql.tuple(Array.from(fields.values()))}
    `
    const roomRes = db.run(String(roomQuery), roomQuery.parameters)

    if (typeof roomRes.lastID !== 'number') {
      ctx.throw(500, 'Invalid default room lastID')
    }

    // The admin lands in the room this setup just made, rather than in
    // whichever room sorts first once they have created a few more.
    setPreferredRoomId(userId, roomRes.lastID)

    // create JWT
    const userCtx = createUserCtx(user, roomRes.lastID)
    const token = signSession(userCtx, ctx.jwtKey)

    // set JWT as an httpOnly cookie
    ctx.cookies.set('keToken', token, {
      sameSite: 'lax',
      httpOnly: true,
    })

    // unset isFirstRun
    const query = sql`
      UPDATE prefs
      SET data = 'false'
      WHERE key = 'isFirstRun'
    `
    db.run(String(query))

    // success
    ctx.body = userCtx
  } catch (err) {
    rethrowAs(403, err)
  }
})

// get a user's image
router.get('/user/:userId/image', (ctx) => {
  const targetId = parseInt(ctx.params.userId, 10)

  if (ctx.user.userId !== targetId && !ctx.user.isAdmin) {
    // ensure target user has been in the same room
    if (!Rooms.hasUserBeenInRoom(ctx.user.roomId, targetId)) {
      ctx.throw(403)
    }
  }

  const user = User.getById(targetId)

  if (!user || !user.image) {
    ctx.throw(404)
    return
  }

  if (typeof ctx.query.v !== 'undefined') {
    // client can cache a versioned image forever
    ctx.set('Cache-Control', 'max-age=31536000') // 1 year
  }

  ctx.type = 'image/jpeg'
  ctx.body = Buffer.from(user.image)
})

export default router
