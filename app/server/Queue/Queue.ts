import path from 'path'
import { db } from '../lib/Database.js'
import sql from 'sqlate'
import { QueueItem } from '../../shared/types.js'
import { isValidPitch } from '../../shared/pitch.js'
import { getPitchStatus } from '../Pitch/pitchState.js'

class Queue {
  /**
   * Add a songId to a room's queue
   * @return the queueId of the newly-inserted row
   */
  static add ({ roomId, songId, userId, pitchSemitones = 0, mediaId = null }: {
    roomId: number
    songId: number
    userId: number
    pitchSemitones?: number
    /** specific version the singer picked; null keeps the isPreferred fallback */
    mediaId?: number | null
  }): number {
    if (!isValidPitch(pitchSemitones)) {
      throw new Error(`invalid pitchSemitones: ${pitchSemitones}`)
    }

    const fields = new Map()
    fields.set('roomId', roomId)
    fields.set('songId', songId)
    fields.set('userId', userId)
    fields.set('pitchSemitones', pitchSemitones)
    fields.set('mediaId', mediaId)
    fields.set('prevQueueId', sql`(
      SELECT queueId
      FROM queue
      WHERE roomId = ${roomId} AND queueId NOT IN (
        SELECT prevQueueId
        FROM queue
        WHERE prevQueueId IS NOT NULL
      )
    )`)

    const query = sql`
      INSERT INTO queue ${sql.tuple(Array.from(fields.keys()).map(sql.column))}
      VALUES ${sql.tuple(Array.from(fields.values()))}
    `
    const res = db.run(String(query), query.parameters)

    if (res.changes !== 1) {
      throw new Error('Could not add song to queue')
    }

    // the exact row is needed to attach a pitch request to it; never try to
    // find it afterwards by (songId, userId) since duplicates are legitimate
    if (!Number.isInteger(res.lastID)) {
      throw new Error('invalid lastID from queue insert')
    }

    return res.lastID
  }

  /**
   * Get a single queue row (server-side use; includes columns not sent to clients)
   */
  static getRow (queueId: number): {
    queueId: number
    roomId: number
    songId: number
    userId: number
    pitchSemitones: number
  } | undefined {
    const query = sql`
      SELECT queueId, roomId, songId, userId, pitchSemitones
      FROM queue
      WHERE queueId = ${queueId}
    `
    return db.get(String(query), query.parameters)
  }

  /**
   * All queue rows with a non-zero pitch request, across every room.
   * Used by PitchManager.reconcile() at startup so no row is left "eternally
   * preparing" after a restart.
   */
  static getPitchRequests (): { queueId: number, roomId: number, songId: number, mediaId: number, pitchSemitones: number }[] {
    const query = sql`
      SELECT queue.queueId, queue.roomId, queue.songId, MAX(media.isPreferred) AS isPreferred, media.mediaId, queue.pitchSemitones
      FROM queue
        -- must resolve to the SAME version Queue.get() will play, or pitch
        -- would be prepared for a different media than the one that airs
        INNER JOIN media ON media.songId = queue.songId
          AND (queue.mediaId IS NULL OR media.mediaId = queue.mediaId)
      WHERE queue.pitchSemitones != 0
      GROUP BY queue.queueId
    `
    return db.all(String(query), query.parameters)
  }

  /**
   * Get queued items for a given room
   */
  static get (roomId: number): { result: number[], entities: Record<number, QueueItem> } {
    const result: number[] = []
    const entities: Record<number, any> = {}
    const map = new Map()
    const pathData = new Map()
    let curQueueId = null

    const query = sql`
      SELECT queueId, queue.songId AS songId, userId, prevQueueId, pitchSemitones,
        media.mediaId, media.relPath, media.sourceFingerprint, media.rgTrackGain, media.rgTrackPeak,
        users.name AS userDisplayName, users.dateUpdated AS userDateUpdated,
        paths.pathId, paths.data AS pathData,
        MAX(isPreferred) AS isPreferred
      FROM queue
        INNER JOIN users USING(userId)
        -- when the singer picked a version, that is the ONLY candidate;
        -- otherwise every version of the song competes and MAX(isPreferred)
        -- below settles it, exactly as before this column existed
        INNER JOIN media ON media.songId = queue.songId
          AND (queue.mediaId IS NULL OR media.mediaId = queue.mediaId)
        INNER JOIN paths USING(pathId)
      WHERE roomId = ${roomId}
      GROUP BY queueId
      ORDER BY queueId, paths.priority ASC
    `
    const rows = db.all<{
      queueId: number
      songId: number
      userId: number
      prevQueueId: number
      pitchSemitones: number
      mediaId: number
      relPath: string
      sourceFingerprint: string | null
      rgTrackGain: number
      rgTrackPeak: number
      userDisplayName: string
      userDateUpdated: number
      pathId: number
      pathData: string
      isPreferred: number
    }>(String(query), query.parameters)

    for (const row of rows) {
      if (!pathData.has(row.pathId)) {
        pathData.set(row.pathId, JSON.parse(row.pathData))
      }

      const pathPrefs = pathData.get(row.pathId)?.prefs

      entities[row.queueId] = row
      entities[row.queueId].mediaType = this.getType(row.relPath)
      entities[row.queueId].isVideoKeyingEnabled = !!pathPrefs?.isVideoKeyingEnabled

      // operational (non-durable) pitch state, owned by PitchManager
      const { pitchStatus, pitchError } = getPitchStatus(row.mediaId, row.sourceFingerprint, row.pitchSemitones)
      entities[row.queueId].pitchStatus = pitchStatus
      if (pitchError) entities[row.queueId].pitchError = pitchError

      // don't send over the wire
      delete entities[row.queueId].relPath
      delete entities[row.queueId].isPreferred
      delete entities[row.queueId].pathData
      delete entities[row.queueId].sourceFingerprint

      if (row.prevQueueId === null) {
        // found the first item
        result.push(row.queueId)
        curQueueId = row.queueId
      } else {
        // map indexed by prevQueueId
        map.set(row.prevQueueId, row.queueId)
      }
    }

    while (result.length < rows.length) {
      // get the item whose prevQueueId references the current one
      const nextQueueId = entities[map.get(curQueueId)].queueId
      result.push(nextQueueId)
      curQueueId = nextQueueId
    }

    return { result, entities }
  }

  /**
   * Move a queue item
   */
  static move ({ prevQueueId, queueId, roomId }: { prevQueueId: number | null, queueId: number, roomId: number }): void {
    if (queueId === prevQueueId) {
      throw new Error('Invalid prevQueueId')
    }

    if (prevQueueId === -1) prevQueueId = null

    const query = sql`
      UPDATE queue
      SET prevQueueId = CASE
        WHEN queueId = newChild THEN ${queueId}
        WHEN queueId = curChild AND curParent IS NOT NULL AND newChild IS NOT NULL THEN curParent
        WHEN queueId = ${queueId} THEN ${prevQueueId}
        ELSE queue.prevQueueId
      END
      FROM (SELECT
        (
          SELECT prevQueueId
          FROM queue
          WHERE queueId = ${queueId}
        ) AS curParent,
        (
          SELECT queueId
          FROM queue
          WHERE prevQueueId = ${queueId}
        ) AS curChild,
        (
          SELECT queueId
          FROM queue
          WHERE queueId != ${queueId}
            AND prevQueueId ${prevQueueId === null ? sql`IS NULL` : sql`= ${prevQueueId}`}
            AND roomId = ${roomId}
        ) AS newChild
      )
      WHERE roomId = ${roomId}
    `
    db.run(String(query), query.parameters)
  }

  /**
   * Delete a queue item
   */
  static remove (queueId: number): void {
    db.exec('BEGIN IMMEDIATE')
    db.exec('PRAGMA defer_foreign_keys = ON') // v0.9 betas didn't have prevQueueId DEFERRABLE

    try {
      const deleteQuery = sql`
        DELETE FROM queue
        WHERE queueId = ${queueId}
        RETURNING prevQueueId
      `
      const deletedRow = db.get<{ prevQueueId: number | null }>(String(deleteQuery), deleteQuery.parameters)

      if (deletedRow === undefined) {
        throw new Error(`Could not remove queueId: ${queueId}`)
      }

      // close the gap
      const updateQuery = sql`
        UPDATE queue
        SET prevQueueId = ${deletedRow.prevQueueId}
        WHERE prevQueueId = ${queueId}
      `
      db.run(String(updateQuery), updateQuery.parameters)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  /**
   * Check if user owns queue item(s)
   */
  static isOwner (userId: number, queueId: number | number[]): boolean {
    const ids = Array.isArray(queueId) ? queueId : [queueId]
    if (ids.length === 0) return false

    const query = sql`
      SELECT COUNT(*) AS count
      FROM queue
      WHERE userId = ${userId} AND queueId IN ${sql.tuple(ids)}
    `
    const res = db.get<{ count: number }>(String(query), query.parameters)
    return res.count === ids.length
  }

  /**
   * Get media type from file extension
   */
  static getType (file: string): string {
    return /\.mp4/i.test(path.extname(file)) ? 'mp4' : 'cdg'
  }
}

export default Queue
