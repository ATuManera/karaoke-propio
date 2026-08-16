import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import Media from './Media.js'
import AcquisitionWorkerClient from '../Acquisition/AcquisitionWorkerClient.js'

const log = getLogger('popularity')

export function setViewCount (mediaId: number, viewCount: number | null): void {
  db.run('UPDATE media SET viewCount = ? WHERE mediaId = ?', [viewCount, mediaId])
  Library.cache.version = null
}

/**
 * Fill in view counts for media acquired before they were recorded.
 *
 * The source video id survives in the filename ("---<id>"), which is what makes
 * a backfill possible at all — nothing else links a stored file back to where
 * it came from. Media without that suffix is skipped rather than guessed at.
 */
export async function backfillViewCounts (workerUrl: string): Promise<{ updated: number, skipped: number }> {
  const worker = new AcquisitionWorkerClient(workerUrl)
  const rows = db.all<{ mediaId: number, relPath: string }>(
    'SELECT mediaId, relPath FROM media WHERE viewCount IS NULL', [],
  )

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const videoId = /---([\w-]{11})\.[^.]+$/.exec(row.relPath)?.[1]

    if (!videoId) {
      skipped++
      continue
    }

    try {
      const views = await worker.getViewCount(`https://www.youtube.com/watch?v=${videoId}`)
      if (views !== null) {
        setViewCount(row.mediaId, views)
        updated++
      } else {
        skipped++
      }
    } catch (err) {
      log.warn('view count lookup failed for media %s: %s', row.mediaId, (err as Error).message)
      skipped++
    }
  }

  log.info('view count backfill: %s updated, %s skipped', updated, skipped)
  return { updated, skipped }
}

export { Media }
