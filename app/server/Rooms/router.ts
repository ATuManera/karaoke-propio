import KoaRouter from '@koa/router'
import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Rooms, { STATUSES, getRoomIdByCode, newUniqueCode } from '../Rooms/Rooms.js'
import { ValidationError } from '../lib/Errors.js'

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

  res.result.forEach((roomId) => {
    if (ctx.user.isAdmin) {
      const room = ctx.io.sockets.adapter.rooms.get(Rooms.prefix(roomId))
      res.entities[roomId].numUsers = room ? room.size : 0
    } else {
      // only pass the 'roles' prefs key
      res.entities[roomId].prefs = res.entities[roomId].prefs?.roles ? { roles: res.entities[roomId].prefs.roles } : {}
    }
  })

  ctx.body = res
})

// Resolve an invite code to the room it opens.
//
// Rate limited per IP because this endpoint is, by design, reachable by
// anyone: it is the one place a stranger could grind through codes. Six
// characters give ~1.07e9 possibilities, which only stays out of reach if
// guessing is slow.
const codeAttempts = new Map<string, { count: number, resetAt: number }>()
const MAX_ATTEMPTS = 10
const WINDOW_MS = 60_000

router.get('/code/:code', (ctx) => {
  const ip = ctx.request.ip
  const now = Date.now()
  const entry = codeAttempts.get(ip)

  if (!entry || entry.resetAt < now) {
    codeAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
  } else if (++entry.count > MAX_ATTEMPTS) {
    ctx.throw(429, 'Too many attempts; wait a minute and try again')
    return
  }

  const roomId = getRoomIdByCode(ctx.params.code)

  // same answer either way: never reveal whether a code exists but is closed,
  // which would let someone map valid codes
  if (roomId === null) {
    ctx.throw(404, 'Invalid or expired invite')
    return
  }

  const res = Rooms.get(roomId)
  const room = res.entities[roomId]

  if (!room) {
    ctx.throw(404, 'Invalid or expired invite')
    return
  }

  ctx.body = { roomId, name: room.name, hasPassword: room.hasPassword, status: room.status }
})

// the code for a room the caller is actually in (or any, for an admin)
router.get('/:roomId/code', (ctx) => {
  const roomId = parseInt(ctx.params.roomId, 10)
  if (Number.isNaN(roomId)) ctx.throw(422, 'invalid roomId')

  if (!ctx.user.isAdmin && ctx.user.roomId !== roomId) ctx.throw(401)

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
