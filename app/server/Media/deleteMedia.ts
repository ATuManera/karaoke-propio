import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import Media from './Media.js'
import Prefs from '../Prefs/Prefs.js'

const log = getLogger('deleteMedia')

export interface DeleteMediaResult {
  mediaId: number
  songId: number
  /** true when that was the song's last version, so the song itself is gone too */
  songRemoved: boolean
  filesDeleted: string[]
  /** queue entries dropped because their song no longer exists */
  queueRemoved: number[]
  /** rooms whose queue changed, so callers know what to push */
  roomsAffected: number[]
}

/**
 * Permanently remove ONE version of a song: the media row, its files on disk,
 * and any pitch-shifted variants cached for it.
 *
 * Deleting the files matters as much as the database row — a library rescan
 * re-adds whatever is still on disk, so a database-only delete reappears on
 * the next scan.
 *
 * When the version being deleted is the song's last one, the song and its
 * (now empty) artist go too, along with any queue entries for it: a queued
 * song with no playable media would otherwise sit there and fail at showtime.
 */
export async function deleteMedia (mediaId: number): Promise<DeleteMediaResult> {
  const res = Media.search({ mediaId })
  const media = res.entities[mediaId]
  if (!media) throw new Error(`mediaId not found: ${mediaId}`)

  const songId = media.songId as number
  const { paths } = Prefs.get()
  const basePath = paths.entities[media.pathId]?.path
  if (!basePath) throw new Error(`invalid pathId on media ${mediaId}`)

  const filesDeleted: string[] = []

  // ---- the media file and anything sharing its basename (.cdg, .jpg, ...) ----
  const fullPath = path.join(basePath, media.relPath)
  const dir = path.dirname(fullPath)
  const base = path.basename(media.relPath).replace(/\.[^.]+$/, '')

  for (const file of await fsPromises.readdir(dir).catch(() => [] as string[])) {
    if (file !== base && !file.startsWith(base + '.')) continue

    await fsPromises.unlink(path.join(dir, file)).catch(() => {})
    filesDeleted.push(file)
  }

  // ---- cached pitch variants, keyed by mediaId (see pitchCache.cacheKey) ----
  const cacheDir = process.env.KES_PITCH_CACHE_DIR
  if (cacheDir) {
    for (const sub of [cacheDir, path.join(cacheDir, '_extracted')]) {
      for (const file of await fsPromises.readdir(sub).catch(() => [] as string[])) {
        if (!file.startsWith(`${mediaId}-`)) continue

        await fsPromises.unlink(path.join(sub, file)).catch(() => {})
        filesDeleted.push(path.join(path.basename(sub) === '_extracted' ? '_extracted' : '', file))
      }
    }
  }

  db.run('DELETE FROM media WHERE mediaId = ?', [mediaId])

  // queue entries that pinned this exact version fall back to another one
  db.run('UPDATE queue SET mediaId = NULL WHERE mediaId = ?', [mediaId])

  const remaining = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM media WHERE songId = ?', [songId])?.c ?? 0
  const queueRemoved: number[] = []
  const roomsAffected: number[] = []

  if (remaining === 0) {
    const rows = db.all<{ queueId: number, roomId: number }>('SELECT queueId, roomId FROM queue WHERE songId = ?', [songId])

    for (const row of rows) {
      queueRemoved.push(row.queueId)
      if (!roomsAffected.includes(row.roomId)) roomsAffected.push(row.roomId)
    }

    if (queueRemoved.length) {
      // keep the queue's linked list intact: stitch each removed item's
      // successor onto its predecessor before deleting it
      for (const queueId of queueRemoved) {
        const prev = db.get<{ prevQueueId: number | null }>('SELECT prevQueueId FROM queue WHERE queueId = ?', [queueId])
        db.run('UPDATE queue SET prevQueueId = ? WHERE prevQueueId = ?', [prev?.prevQueueId ?? null, queueId])
        db.run('DELETE FROM queue WHERE queueId = ?', [queueId])
      }
    }

    db.run('DELETE FROM songStars WHERE songId = ?', [songId])
    db.run('DELETE FROM songs WHERE songId = ?', [songId])
    db.run('DELETE FROM artistStars WHERE artistId NOT IN (SELECT DISTINCT artistId FROM songs)')
    db.run('DELETE FROM artists WHERE artistId NOT IN (SELECT DISTINCT artistId FROM songs)')
  }

  Library.cache.version = null // invalidate

  log.info('deleted media %s (song %s): %s file(s), songRemoved=%s', mediaId, songId, filesDeleted.length, remaining === 0)

  return {
    mediaId,
    songId,
    songRemoved: remaining === 0,
    filesDeleted,
    queueRemoved,
    roomsAffected,
  }
}
