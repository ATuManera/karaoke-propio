import KoaRouter from '@koa/router'
import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Prefs from '../Prefs/Prefs.js'
import Rooms, { STATUSES, getRoomIdByCode, newUniqueCode } from '../Rooms/Rooms.js'
import { InviteFailureLimiter } from './inviteGuard.js'
import { ValidationError } from '../lib/Errors.js'
import type { Prefs as PrefsType } from '../../shared/types.js'

interface RequestWithBody {
  body: Record<string, unknown>
}

const log = getLogger('Rooms')
const router = new KoaRouter({ prefix: '/api/rooms' })

import { ROOM_PREFS_PUSH } from '../../shared/actionTypes.js'

// list rooms
router.get(['/', '/:roomId'], (ctx) => {
  const roomId = ctx.params.roomId ? parseInt(ctx.params.roomId, 10) : undefined
  const status = ctx.user.isAdmin ? STATUSES : undefined
  const res = Rooms.get(roomId, { status })

  // The QR overlay is part of the Player, so a non-admin running one needs
  // that room's qr prefs — but only ever for the room they are in, and only
  // when an admin has opened the Player to them. The password those prefs
  // carry is already on screen for the whole room the moment any Player shows
  // the invite; a member reading it here learns nothing new.
  const isPlayerLaunchEnabled = !ctx.user.isAdmin
    && typeof roomId === 'number'
    && ctx.user.roomId === roomId
    && (Prefs.get() as unknown as PrefsType).isPlayerLaunchEnabled === true

  res.result.forEach((roomId) => {
    const sockets = ctx.io.sockets.adapter.rooms.get(Rooms.prefix(roomId))
    const numUsers = sockets ? sockets.size : 0

    // Whether anyone is in there, never how many. Someone deciding where to
    // sing needs to know if a party is already going; the size of it is the
    // room's business, and this list is readable without signing in.
    res.entities[roomId].isLive = numUsers > 0

    if (ctx.user.isAdmin) {
      res.entities[roomId].numUsers = numUsers
    } else {
      // only pass the 'roles' prefs key (plus 'qr' for a Player they may run)
      const prefs = res.entities[roomId].prefs
      const passed: Record<string, unknown> = {}

      if (prefs?.roles) passed.roles = prefs.roles
      if (isPlayerLaunchEnabled && prefs?.qr) passed.qr = prefs.qr

      res.entities[roomId].prefs = passed
    }
  })

  ctx.body = res
})

// Resolve an invite code to the room it opens.
//
// Rate limited per IP because this endpoint is, by design, reachable by
// anyone: it is the one place a stranger could grind through codes.
const codeLookupFailures = new InviteFailureLimiter(10, 60_000)

router.get('/code/:code', (ctx) => {
  const ip = ctx.request.ip

  if (codeLookupFailures.isBlocked(ip)) {
    ctx.throw(429, 'Too many attempts; wait a minute and try again')
    return
  }

  const roomId = getRoomIdByCode(ctx.params.code)

  // same answer either way: never reveal whether a code exists but is closed,
  // which would let someone map valid codes
  if (roomId === null) {
    codeLookupFailures.recordFailure(ip)
    ctx.throw(404, 'Invalid or expired invite')
    return
  }

  const res = Rooms.get(roomId)
  const room = res.entities[roomId]

  if (!room) {
    codeLookupFailures.recordFailure(ip)
    ctx.throw(404, 'Invalid or expired invite')
    return
  }

  ctx.body = { roomId, name: room.name, hasPassword: room.hasPassword, status: room.status }
})

// The code for a room the caller is actually in (or any, for an admin).
//
// Guests are refused: the code is what lets someone new in, and a guest was
// let in themselves rather than asked to bring others.
router.get('/:roomId/code', (ctx) => {
  const roomId = parseInt(ctx.params.roomId, 10)
  if (Number.isNaN(roomId)) ctx.throw(422, 'invalid roomId')

  if (!ctx.user.isAdmin && (ctx.user.isGuest || ctx.user.roomId !== roomId)) ctx.throw(401)

  const res = Rooms.get(roomId, { status: STATUSES, includeCode: true })
  const room = res.entities[roomId]
  if (!room) ctx.throw(404)

  ctx.body = { code: room.code }
})

// issue a fresh code, invalidating every invite already handed out
router.post('/:roomId/code', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const roomId = parseInt(ctx.params.roomId, 10)
  if (Number.isNaN(roomId)) ctx.throw(422, 'invalid roomId')

  const code = newUniqueCode()
  db.run('UPDATE rooms SET code = ? WHERE roomId = ?', [code, roomId])
  log.info('room %s invite code regenerated', roomId)

  ctx.body = { code }
})

// create room
router.post('/', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  try {
    const res = await Rooms.set(undefined, (ctx.request as unknown as RequestWithBody).body)
    log.verbose('%s created a room (roomId: %s)', ctx.user.name, res.lastID)
  } catch (err) {
    if (err instanceof ValidationError) ctx.throw(422, err.message)
    throw err
  }

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

// update room
router.put('/:roomId', async (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  try {
    await Rooms.set(roomId, (ctx.request as unknown as RequestWithBody).body)
  } catch (err) {
    if (err instanceof ValidationError) ctx.throw(422, err.message)
    throw err
  }

  log.verbose('%s updated a room (roomId: %s)', ctx.user.name, roomId)

  const sockets = await ctx.io.in(Rooms.prefix(roomId)).fetchSockets()

  for (const s of sockets) {
    if (s?.user.isAdmin) {
      ctx.io.to(s.id).emit('action', {
        type: ROOM_PREFS_PUSH,
        payload: Rooms.get(roomId),
      })
    }
  }

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

// remove room
router.delete('/:roomId', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const roomId = parseInt(ctx.params.roomId, 10)

  if (typeof roomId !== 'number') {
    ctx.throw(422, 'Invalid roomId')
  }

  // remove room's queue first
  const queueQuery = sql`
    DELETE FROM queue
    WHERE roomId = ${roomId}
  `
  db.run(String(queueQuery), queueQuery.parameters)

  // remove room
  const roomQuery = sql`
    DELETE FROM rooms
    WHERE roomId = ${roomId}
  `
  db.run(String(roomQuery), roomQuery.parameters)

  log.verbose('%s deleted roomId %s', ctx.user.name, roomId)

  // send updated room list
  ctx.body = Rooms.get(null, { status: STATUSES })
})

export default router
