import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import KoaRouter from '@koa/router'
import * as Photos from './Photos.js'
import { MessageError } from '../lib/i18n.js'

const router = new KoaRouter({ prefix: '/api/photos' })

// Uploads arrive already resized by the browser (see PhotosView), so anything
// this large is either a bug or an abuse attempt.
const MAX_BYTES = 8 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Everyone in the room shares one album; being in the room is the permission. */
function requireRoom (ctx): number {
  if (ctx.user.userId === null || typeof ctx.user.roomId !== 'number') ctx.throw(401)
  return ctx.user.roomId
}

router.get('/', (ctx) => {
  const roomId = requireRoom(ctx)

  ctx.body = {
    photos: Photos.getByRoom(roomId).map(p => ({
      photoId: p.photoId,
      userId: p.userId,
      userDisplayName: p.userDisplayName ?? null,
      bytes: p.bytes,
      width: p.width,
      height: p.height,
      dateCreated: p.dateCreated,
      // the stored filename is never exposed: it is an implementation detail
      // and guessing one must not be a way to reach another room's album
      originalName: p.originalName,
    })),
  }
})

router.post('/', async (ctx) => {
  const roomId = requireRoom(ctx)

  const files = (ctx.request as unknown as { files?: Record<string, unknown> }).files
  const raw = files?.photo
  const file = Array.isArray(raw) ? raw[0] : raw as { filepath: string, mimetype?: string, size: number, originalFilename?: string } | undefined

  if (!file) {
    throw new MessageError(422, 'server.photos.noneAttached')
  }

  const mimeType = file.mimetype ?? ''

  if (!ALLOWED_TYPES.has(mimeType)) {
    await fsPromises.unlink(file.filepath).catch(() => {})
    throw new MessageError(415, 'server.photos.typeNotAccepted')
  }

  if (file.size > MAX_BYTES) {
    await fsPromises.unlink(file.filepath).catch(() => {})
    throw new MessageError(413, 'server.photos.tooLarge', { max: Math.round(MAX_BYTES / 1024 / 1024) })
  }

  const body = (ctx.request as unknown as { body?: Record<string, string> }).body ?? {}
  const data = await fsPromises.readFile(file.filepath)
  await fsPromises.unlink(file.filepath).catch(() => {})

  const photoId = await Photos.add({
    roomId,
    userId: ctx.user.userId,
    fileName: Photos.generateFileName(mimeType),
    originalName: file.originalFilename?.slice(0, 120) ?? null,
    mimeType,
    bytes: data.length,
    width: parseInt(body.width, 10) || null,
    height: parseInt(body.height, 10) || null,
  }, data)

  ctx.status = 201
  ctx.body = { photoId }
})

router.get('/:photoId', (ctx) => {
  const roomId = requireRoom(ctx)
  const photo = Photos.get(parseInt(ctx.params.photoId, 10))

  // same answer for "doesn't exist" and "belongs to another room", so ids
  // can't be probed to learn what other rooms hold
  if (!photo || photo.roomId !== roomId) {
    ctx.throw(404)
    return
  }

  ctx.type = photo.mimeType
  ctx.length = photo.bytes

  if (ctx.query.download !== undefined) {
    ctx.attachment(photo.originalName ?? photo.fileName)
  }

  ctx.body = fs.createReadStream(Photos.resolvePath(photo))
})

router.delete('/:photoId', async (ctx) => {
  const roomId = requireRoom(ctx)
  const photo = Photos.get(parseInt(ctx.params.photoId, 10))

  if (!photo || photo.roomId !== roomId) {
    ctx.throw(404)
    return
  }

  // your own photo, or an admin cleaning up
  if (!ctx.user.isAdmin && photo.userId !== ctx.user.userId) {
    throw new MessageError(403, 'server.photos.notYours')
  }

  await Photos.remove(photo)
  ctx.status = 200
  ctx.body = {}
})

export default router
