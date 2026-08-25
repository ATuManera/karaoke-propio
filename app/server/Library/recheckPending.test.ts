import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite' // eslint-disable-line n/no-unsupported-features/node-builtins
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * Renaming a song gives it a new songId, and the review row does not follow.
 *
 * This is not a quirk worth a unit test on its own — it is the reason every
 * song the automatic re-read corrected silently left the worklist on the first
 * real run. The behaviour lives in SQLite, not in our code, so the test asks
 * SQLite.
 */
describe('what a rename does to a review row', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'))
  const db = new DatabaseSync(path.join(dir, 'test.sqlite3'))

  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE songs (songId INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL);
    CREATE TABLE songsPendingReview (
      songId INTEGER PRIMARY KEY REFERENCES songs(songId) ON DELETE CASCADE,
      sourceTitle TEXT NOT NULL,
      playlistId TEXT,
      isAmbiguous INTEGER NOT NULL DEFAULT 0,
      dateCreated INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'bulk'
    );
  `)

  it('takes the flag with it unless the flag is written again', () => {
    db.prepare('INSERT INTO songs (title) VALUES (?)').run('Free')
    const old = db.prepare('SELECT songId FROM songs WHERE title = ?').get('Free') as { songId: number }
    db.prepare('INSERT INTO songsPendingReview (songId, sourceTitle) VALUES (?, ?)').run(old.songId, 'All Right Now - Free (Karaoke Version)')

    // what retagSong does: the corrected name becomes its own row and the old
    // one is retired
    db.prepare('INSERT INTO songs (title) VALUES (?)').run('All Right Now')
    const fresh = db.prepare('SELECT songId FROM songs WHERE title = ?').get('All Right Now') as { songId: number }
    db.prepare('DELETE FROM songs WHERE songId = ?').run(old.songId)

    expect(db.prepare('SELECT COUNT(*) c FROM songsPendingReview').get()).toEqual({ c: 0 })

    // so recheckPending writes it again against the new id
    db.prepare('INSERT INTO songsPendingReview (songId, sourceTitle) VALUES (?, ?)').run(fresh.songId, 'All Right Now - Free (Karaoke Version)')
    expect(db.prepare('SELECT songId FROM songsPendingReview').get()).toEqual({ songId: fresh.songId })
  })
})
