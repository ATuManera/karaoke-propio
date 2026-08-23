import fs from 'fs'
import fsPromises from 'node:fs/promises'
import { Readable } from 'stream'
import path from 'path'
import getLogger from '../lib/Log.js'
import KoaRouter from '@koa/router'
import Library from '../Library/Library.js'
import Media from './Media.js'
import PitchManager from '../Pitch/PitchManager.js'
import Prefs from '../Prefs/Prefs.js'
import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'
import fileTypes from './fileTypes.js'
import { resolveMedia, readSource } from './mediaResolver.js'
import { deleteMedia } from './deleteMedia.js'
import { LIBRARY_PUSH, LIBRARY_PUSH_SONG, QUEUE_PUSH } from '../../shared/actionTypes.js'
import { MessageError } from '../lib/i18n.js'
const log = getLogger('Media')
const router = new KoaRouter({ prefix: '/api/media' })

interface StreamableMedia {
  pathId: number
  relPath: string
  songId: number
  sourceFingerprint: string | null
}

/**
 * Authorize + resolve a room member's request to stream a queued song.
 *
 * The queueId is what grants access — never the mediaId or roomId sent by the
 * client. This is the ONLY thing that lets a non-admin reach a media file at
 * all: it must reference a queue row that belongs to the requester's own
 * (JWT-signed) room, and that row's songId must match the requested mediaId.
 * pitch is *always* read from that same row, never from the query string.
 */
function authorizeQueueAccess (ctx, mediaId: number, queueId: number) {
  const row = Queue.getRow(queueId)
  if (!row) ctx.throw(404, 'queueId not found')

  if (row.roomId !== ctx.user.roomId) {
    ctx.throw(403, 'queueId does not belong to your room')
  }

  const mediaRes = Media.search({ mediaId })
  const media = mediaRes.entities[mediaId]
  if (!media) ctx.throw(404, 'mediaId not found')

  if (media.songId !== row.songId) {
    ctx.throw(403, 'mediaId does not match the queued song')
  }

  return { media, pitchSemitones: row.pitchSemitones as number }
}

// stream a media file
router.get('/:mediaId', async (ctx) => {
  const { type } = ctx.query
  const mediaId = parseInt(ctx.params.mediaId, 10)
  const queueIdRaw = ctx.query.queueId
  const queueId = typeof queueIdRaw === 'string' ? parseInt(queueIdRaw, 10) : NaN

  if (Number.isNaN(mediaId) || !type) {
    ctx.throw(422, 'invalid mediaId or type')
  }

  let media: StreamableMedia
  let pitchSemitones = 0

  if (Number.isInteger(queueId)) {
    // room playback: queueId is the authorization; roomId/pitch are derived
    // server-side, never trusted from the client
    ;({ media, pitchSemitones } = authorizeQueueAccess(ctx, mediaId, queueId))
  } else if (ctx.user.isAdmin) {
    // admin/back-office access without a queue context (e.g. library tools);
    // always the original, pitch does not apply here
    const res = Media.search({ mediaId })
    if (!res.result.length) ctx.throw(404, 'mediaId not found')
    media = res.entities[mediaId]
  } else {
    ctx.throw(401, 'queueId required')
  }

  // get base path
  const { paths } = Prefs.get()
  const basePath = paths.entities[media.pathId].path
  const file = path.join(basePath, media.relPath)

  const resolved = await resolveMedia(file)

  let streamPath: string | null = null
  let buffer: Buffer | undefined
  let mimeType: string | undefined

  if (type === 'cdg') {
    // CD+G graphics are never regenerated per pitch; always the original
    if (!resolved.cdg) throw new MessageError(404, 'server.media.cdgNotFound')

    if (resolved.cdg.type === 'file') {
      streamPath = resolved.cdg.path
    } else {
      buffer = await readSource(resolved.cdg)
    }
    mimeType = resolved.cdg.mimeType
  } else {
    // type === 'audio' | 'video'
    if (pitchSemitones === 0) {
      if (resolved.audio.type === 'file') {
        streamPath = resolved.audio.path
      } else {
        buffer = await readSource(resolved.audio)
      }
      mimeType = resolved.audio.mimeType
    } else {
      const variantPath = PitchManager.getVariantPath(mediaId, media.sourceFingerprint, pitchSemitones)

      if (!variantPath) {
        // shouldn't normally happen: the Player is gated on pitchStatus and
        // shouldn't mount until 'ready'. Treat as a transient race, not a bug.
        throw new MessageError(409, 'server.media.pitchNotReady')
      }

      streamPath = variantPath
      mimeType = resolved.mediaType === 'mp4' ? fileTypes['.mp4'].mimeType : fileTypes['.m4a'].mimeType
    }
  }

  if (!mimeType) ctx.throw(404, `Unknown MIME type: ${file}`)
  ctx.type = mimeType

  if (buffer) {
    ctx.length = buffer.length
    ctx.body = Readable.from(buffer)
  } else {
    const stats = await fsPromises.stat(streamPath)
    ctx.length = stats.size
    ctx.body = fs.createReadStream(streamPath)
  }

  log.verbose('streaming %s (%sMB): %s', ctx.type, (ctx.length / 1000000).toFixed(2), streamPath ?? `${file} (in archive)`)
})

// permanently delete one version of a song (files included — see deleteMedia)
router.delete('/:mediaId', async (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const mediaId = parseInt(ctx.params.mediaId, 10)
  if (Number.isNaN(mediaId)) ctx.throw(422, 'invalid mediaId')

  let result
  try {
    result = await deleteMedia(mediaId)
  } catch (err) {
    ctx.throw(400, (err as Error).message)
    return
  }

  // a removed song/artist can't be expressed by LIBRARY_PUSH_SONG
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })

  for (const roomId of result.roomsAffected) {
    ctx.io.to(Rooms.prefix(roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(roomId),
    })
  }

  ctx.body = result
})

// set isPreferred flag
router.all('/:mediaId/prefer', (ctx) => {
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const mediaId = parseInt(ctx.params.mediaId, 10)

  if (Number.isNaN(mediaId) || (ctx.request.method !== 'PUT' && ctx.request.method !== 'DELETE')) {
    ctx.throw(422)
  }

  const songId = Media.setPreferred(mediaId, ctx.request.method === 'PUT')
  ctx.status = 200

  // emit (potentially) updated queues to each room
  for (const { room, roomId } of Rooms.getActive(ctx.io)) {
    ctx.io.to(room).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(roomId),
    })
  }

  // emit (potentially) new duration
  ctx.io.emit('action', {
    type: LIBRARY_PUSH_SONG,
    payload: Library.getSong(songId),
  })
})

export default router
