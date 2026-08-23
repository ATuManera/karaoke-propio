import { db } from '../lib/Database.js'
import sql from 'sqlate'
import { isValidPitch } from '../../shared/pitch.js'
import type { PitchPrefSource, SongPitchPref, SongPitchPrefs } from '../../shared/types.js'

const SOURCES: PitchPrefSource[] = ['assistant', 'manual', 'inferred']

/**
 * The pitch each singer sings a given song best in.
 *
 * One row per (userId, songId): the comfortable key is a property of a voice,
 * not of a song, so two people asking about the same song legitimately get
 * different answers and neither is more correct.
 *
 * Nothing here affects playback — the queue still carries its own
 * pitchSemitones (see Queue.add). This only remembers, so the singer does not
 * have to.
 */
class PitchPrefs {
  /** Everything one user saved, keyed by songId. Pushed whole on connect. */
  static get (userId: number): SongPitchPrefs {
    const query = sql`
      SELECT songId, pitchSemitones, source, mediaId, dateUpdated
      FROM songPitchPrefs
      WHERE userId = ${userId}
    `
    const rows = db.all<{ songId: number } & SongPitchPref>(String(query), query.parameters)
    const prefs: SongPitchPrefs = {}

    for (const { songId, ...pref } of rows) {
      prefs[songId] = pref
    }

    return prefs
  }

  static getForSong (userId: number, songId: number): SongPitchPref | null {
    const query = sql`
      SELECT pitchSemitones, source, mediaId, dateUpdated
      FROM songPitchPrefs
      WHERE userId = ${userId} AND songId = ${songId}
    `

    return db.get<SongPitchPref>(String(query), query.parameters) ?? null
  }

  /**
   * Save (or update) one singer's pitch for one song.
   *
   * Returns false when the write was deliberately declined, which happens in
   * exactly one case: an 'inferred' write against an existing 'manual' or
   * 'assistant' row. Queueing a song at some pitch is evidence, but a decision
   * the person actually made outranks it, and would otherwise be silently
   * erased by the next performance. Callers treat false as "nothing changed",
   * never as an error.
   */
  static set ({ userId, songId, pitchSemitones, source, mediaId = null, dateUpdated }: {
    userId: number
    songId: number
    pitchSemitones: number
    source: PitchPrefSource
    mediaId?: number | null
    /**
     * When the decision was made, if that is not now. Only an import passes
     * this, and it has to: the file carries the origin's timestamp, and
     * stamping it with the moment it arrived would make every imported row
     * look newer than the corrections it is supposed to lose to.
     */
    dateUpdated?: number
  }): boolean {
    if (!isValidPitch(pitchSemitones)) {
      throw new Error(`invalid pitchSemitones: ${pitchSemitones}`)
    }

    if (!SOURCES.includes(source)) {
      throw new Error(`invalid source: ${source}`)
    }

    // The precedence rule lives in the statement's WHERE rather than in a
    // read-then-write here: two of this singer's devices can be adding songs
    // at once, and a check followed by a separate UPDATE would let the loser
    // overwrite a decision made a moment earlier.
    const query = sql`
      INSERT INTO songPitchPrefs (userId, songId, pitchSemitones, source, mediaId, dateUpdated)
      VALUES (${userId}, ${songId}, ${pitchSemitones}, ${source}, ${mediaId}, ${dateUpdated ?? Math.floor(Date.now() / 1000)})
      ON CONFLICT (userId, songId) DO UPDATE SET
        pitchSemitones = excluded.pitchSemitones,
        source = excluded.source,
        mediaId = excluded.mediaId,
        dateUpdated = excluded.dateUpdated
      WHERE excluded.source != 'inferred' OR songPitchPrefs.source = 'inferred'
    `

    return db.run(String(query), query.parameters).changes > 0
  }

  /** Forget a saved pitch. Returns the number of rows removed (0 or 1). */
  static clear (userId: number, songId: number): number {
    const query = sql`
      DELETE FROM songPitchPrefs
      WHERE userId = ${userId} AND songId = ${songId}
    `

    return db.run(String(query), query.parameters).changes
  }
}

export default PitchPrefs
