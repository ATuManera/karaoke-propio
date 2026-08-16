import fsPromises from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'

const log = getLogger('Photos')

export interface Photo {
  photoId: number
  roomId: number
  userId: number | null
  fileName: string
  originalName: string | null
  mimeType: string
  bytes: number
  width: number | null
  height: number | null
  dateCreated: number
  userDisplayName?: string
}

/** Lives beside the database, so it is covered by whatever backs /config up. */
export function getPhotosDir (): string {
  return path.join(process.env.KES_PATH_DATA ?? '/config', 'photos')
}

function photoPath (roomId: number, fileName: string): string {
  return path.join(getPhotosDir(), String(roomId), fileName)
}

/**
 * Names are generated rather than taken from the upload: a browser-supplied
 * filename is attacker-controlled, and one containing "../" would write
 * outside the album. The original is kept in the database purely so a
 * download arrives with a recognisable name.
 */
export function generateFileName (mimeType: string): string {
  const ext = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg'
  return crypto.randomBytes(16).toString('hex') + ext
}

export async function add (photo: Omit<Photo, 'photoId' | 'dateCreated'>, data: Buffer): Promise<number> {
  const dir = path.join(getPhotosDir(), String(photo.roomId))
  await fsPromises.mkdir(dir, { recursive: true })
  await fsPromises.writeFile(path.join(dir, photo.fileName), data)

  const res = db.run(
    `INSERT INTO photos (roomId, userId, fileName, originalName, mimeType, bytes, width, height, dateCreated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [photo.roomId, photo.userId, photo.fileName, photo.originalName, photo.mimeType,
      photo.bytes, photo.width, photo.height, Math.floor(Date.now() / 1000)],
  )

  log.info('photo %s added to room %s (%sKB)', res.lastID, photo.roomId, Math.round(photo.bytes / 1024))
  return res.lastID as number
}

/** Newest first: at a party the interesting photo is the one just taken. */
export function getByRoom (roomId: number): Photo[] {
  return db.all<Photo>(
    `SELECT photos.*, users.name AS userDisplayName
     FROM photos LEFT JOIN users USING(userId)
     WHERE roomId = ? ORDER BY dateCreated DESC, photoId DESC`,
    [roomId],
  )
}

export function get (photoId: number): Photo | undefined {
  return db.get<Photo>('SELECT * FROM photos WHERE photoId = ?', [photoId])
}

export function resolvePath (photo: Photo): string {
  return photoPath(photo.roomId, photo.fileName)
}

export async function remove (photo: Photo): Promise<void> {
  await fsPromises.unlink(photoPath(photo.roomId, photo.fileName)).catch(() => {})
  db.run('DELETE FROM photos WHERE photoId = ?', [photo.photoId])
  log.info('photo %s removed from room %s', photo.photoId, photo.roomId)
}
