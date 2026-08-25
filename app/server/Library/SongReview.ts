import { db } from '../lib/Database.js'

/**
 * The worklist of songs added without anyone looking at their metadata: by a
 * bulk playlist import or by a media-folder scan.
 *
 * A row means pending; reviewing removes it. See migration 013 for why the
 * list exists at all — briefly: the one-at-a-time flow's correctness comes
 * from the singer confirming artist and title in the preview, and a bulk
 * import has no such moment, so the confirmation is deferred instead of
 * skipped.
 *
 * The song's own artist/title are corrected through the existing admin retag
 * route (PUT /api/song/:songId), which renames the files too. That is
 * deliberately separate: an admin may want a second look at something they
 * just retyped, so being edited is not the same as being reviewed.
 */
export interface PendingSong {
  songId: number
  sourceTitle: string
  playlistId: string | null
  isAmbiguous: number
  dateCreated: number
  origin: 'bulk' | 'scan'
}

class SongReview {
  /** every song still waiting, worst-understood first */
  static getPending (): PendingSong[] {
    return db.all<PendingSong>(`
      SELECT songId, sourceTitle, playlistId, isAmbiguous, dateCreated, origin
      FROM songsPendingReview
      ORDER BY isAmbiguous DESC, dateCreated DESC
    `, [])
  }

  static markPending (songId: number, { sourceTitle, playlistId, isAmbiguous, origin = 'bulk' }: {
    sourceTitle: string
    playlistId?: string | null
    isAmbiguous: boolean
    origin?: 'bulk' | 'scan'
  }): void {
    // A bulk import can land on a song that already exists — a second version
    // of one the library has. The newest arrival's source title is the one
    // worth showing, since it is the one nobody has looked at.
    db.run(`
      INSERT INTO songsPendingReview (songId, sourceTitle, playlistId, isAmbiguous, dateCreated, origin)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (songId) DO UPDATE SET
        sourceTitle = excluded.sourceTitle,
        playlistId = excluded.playlistId,
        isAmbiguous = excluded.isAmbiguous,
        dateCreated = excluded.dateCreated,
        origin = excluded.origin
    `, [songId, sourceTitle.slice(0, 300), playlistId ?? null, isAmbiguous ? 1 : 0, Math.floor(Date.now() / 1000), origin])
  }

  static markReviewed (songId: number): void {
    db.run('DELETE FROM songsPendingReview WHERE songId = ?', [songId])
  }
}

export default SongReview
