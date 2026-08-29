import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import { musicBrainz, TransientLookupError } from './MusicBrainzClient.js'
import CategoryReference from './CategoryReference.js'
import { toCategories, type Category, type CategoryType } from './categoryMap.js'

const log = getLogger('Categories')

/**
 * Which pass put a category on a song, weakest first. See `attach()` for why
 * they are ranked rather than merely distinguished.
 */
export type CategorySource = 'auto' | 'reference' | 'manual'

const RANK_SQL = (expr: string) => `(CASE ${expr} WHEN 'manual' THEN 3 WHEN 'reference' THEN 2 ELSE 1 END)`

export interface CategoryRow {
  categoryId: number
  name: string
  type: CategoryType
  songCount?: number
}

function normalize (name: string): string {
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // fold accents so "Inglés" == "ingles"
}

class Categories {
  private static mb = musicBrainz

  /** All categories that have at least one song, with counts, for the filter UI. */
  static get (): { result: number[], entities: Record<number, CategoryRow> } {
    const rows = db.all<CategoryRow>(`
      SELECT c.categoryId, c.name, c.type, COUNT(sc.songId) AS songCount
      FROM categories c
        INNER JOIN songCategories sc USING(categoryId)
      GROUP BY c.categoryId
      ORDER BY c.type, c.name
    `, [])

    const entities: Record<number, CategoryRow> = {}
    for (const row of rows) entities[row.categoryId] = row

    return { result: rows.map(r => r.categoryId), entities }
  }

  /** categoryIds per songId, so the client can filter without a round trip. */
  static getSongMap (): Record<number, number[]> {
    const rows = db.all<{ songId: number, categoryId: number }>('SELECT songId, categoryId FROM songCategories', [])
    const map: Record<number, number[]> = {}

    for (const row of rows) {
      ;(map[row.songId] ??= []).push(row.categoryId)
    }

    return map
  }

  static getPayload (): {
    categories: { result: number[], entities: Record<number, CategoryRow> }
    songCategories: Record<number, number[]>
  } {
    return { categories: this.get(), songCategories: this.getSongMap() }
  }

  /**
   * Insert a category onto a song, never demoting the row that is already
   * there.
   *
   * Three passes write here — the shipped reference table, an online lookup,
   * and a person — and they can land on the same pair. Plain INSERT OR IGNORE
   * loses that race silently: an admin's correction over an existing 'auto'
   * row became a no-op, the row kept source 'auto', and the next enrichment
   * run deleted it as its own. So a write may only raise the source, and the
   * ladder is manual > reference > auto.
   */
  private static attach (songId: number, categoryId: number, source: CategorySource): void {
    db.run(`
      INSERT INTO songCategories (songId, categoryId, source) VALUES (?, ?, ?)
      ON CONFLICT (songId, categoryId) DO UPDATE SET source = excluded.source
        WHERE ${RANK_SQL('excluded.source')} > ${RANK_SQL('songCategories.source')}
    `, [songId, categoryId, source])
  }

  static findOrCreate (name: string, type: CategoryType): number {
    const nameNorm = normalize(name)
    const existing = db.get<{ categoryId: number }>(
      'SELECT categoryId FROM categories WHERE nameNorm = ? AND type = ?', [nameNorm, type],
    )
    if (existing) return existing.categoryId

    const res = db.run('INSERT INTO categories (name, nameNorm, type) VALUES (?, ?, ?)', [name, nameNorm, type])
    return res.lastID as number
  }

  static setSongCategories (songId: number, categories: Category[], source: CategorySource = 'auto'): void {
    // a re-run must not undo someone's correction, so only rows from the same
    // source are replaced
    db.run('DELETE FROM songCategories WHERE songId = ? AND source = ?', [songId, source])

    for (const category of categories) {
      this.attach(songId, this.findOrCreate(category.name, category.type), source)
    }

    Library.cache.version = null // invalidate
  }

  static addManual (songId: number, name: string, type: CategoryType): void {
    this.attach(songId, this.findOrCreate(name, type), 'manual')
    Library.cache.version = null // invalidate
  }

  /**
   * Apply what the shipped reference table knows about a song, if anything.
   *
   * Synchronous and local, so it can run wherever a song appears — including
   * inside the scanner's IPC handler, where waiting on a rate-limited web
   * service is not an option.
   *
   * A hit supersedes an earlier online guess: the auto rows are dropped once
   * the reference rows are in, since keeping both would leave a song wearing
   * MusicBrainz's "80s" next to the decade a person checked. Manual rows are
   * untouched, as always.
   */
  static applyReference (songId: number, artist: string, title: string): Category[] {
    const categories = CategoryReference.lookup(artist, title)
    if (!categories.length) return []

    this.setSongCategories(songId, categories, 'reference')
    db.run('DELETE FROM songCategories WHERE songId = ? AND source = \'auto\'', [songId])
    db.run('UPDATE songs SET dateCategorized = ? WHERE songId = ?', [Math.floor(Date.now() / 1000), songId])

    return categories
  }

  /**
   * The reference pass for a song that has just been discovered, looking its
   * names up itself.
   *
   * Returns false when the table has nothing, which is the caller's signal
   * that this song still needs an online lookup.
   */
  static categorizeFromReference (songId: number): boolean {
    const row = db.get<{ title: string, artist: string }>(`
      SELECT songs.title, artists.name AS artist
      FROM songs INNER JOIN artists USING(artistId)
      WHERE songId = ?
    `, [songId])

    if (!row) return false

    const categories = this.applyReference(songId, row.artist, row.title)

    if (categories.length) {
      log.info('categorized "%s - %s" from the reference table: %s',
        row.artist, row.title, categories.map(c => c.name).join(', '))
    }

    return categories.length > 0
  }

  static removeFromSong (songId: number, categoryId: number): void {
    db.run('DELETE FROM songCategories WHERE songId = ? AND categoryId = ?', [songId, categoryId])
    this.pruneEmpty()
  }

  /** Categories nothing points at anymore would otherwise linger in the filter bar. */
  static pruneEmpty (): void {
    db.run('DELETE FROM categories WHERE categoryId NOT IN (SELECT DISTINCT categoryId FROM songCategories)')
  }

  /**
   * Look one song up online and store what comes back.
   *
   * `dateCategorized` is stamped even when nothing is found, so a library full
   * of obscure karaoke uploads doesn't re-query the same dead ends on every
   * run against a rate-limited service.
   */
  static async categorizeSong (songId: number): Promise<Category[]> {
    const row = db.get<{ title: string, artist: string }>(`
      SELECT songs.title, artists.name AS artist
      FROM songs INNER JOIN artists USING(artistId)
      WHERE songId = ?
    `, [songId])

    if (!row) throw new Error(`songId not found: ${songId}`)

    // The hand-checked table first, and if it answers, that is the answer:
    // MusicBrainz is not asked at all. Not just to save a rate-limited request
    // — a second opinion that disagrees with a person who looked at the song
    // is not worth having.
    const fromReference = this.applyReference(songId, row.artist, row.title)

    if (fromReference.length) {
      log.info('categorized "%s - %s" from the reference table: %s',
        row.artist, row.title, fromReference.map(c => c.name).join(', '))
      return fromReference
    }

    let raw
    try {
      raw = await this.mb.lookup(row.artist, row.title)
    } catch (err) {
      if (err instanceof TransientLookupError) {
        // leave dateCategorized unset so the next scan picks this song up again
        log.warn('lookup unavailable for "%s - %s" (%s); will retry on a later scan', row.artist, row.title, err.message)
        return []
      }
      throw err
    }

    const categories = raw ? toCategories(raw) : []

    if (categories.length) this.setSongCategories(songId, categories, 'auto')

    db.run('UPDATE songs SET dateCategorized = ? WHERE songId = ?', [Math.floor(Date.now() / 1000), songId])
    log.info('categorized "%s - %s": %s', row.artist, row.title, categories.map(c => c.name).join(', ') || '(nothing found)')

    return categories
  }

  /**
   * Categorize the whole library. Sequential by design — MusicBrainz allows
   * about one request per second, and this walks every song, so it is slow by
   * nature and must never be awaited by an HTTP handler.
   */
  static async categorizeAll ({ force = false }: { force?: boolean } = {}): Promise<{ processed: number, tagged: number, fromReference: number }> {
    const rows = db.all<{ songId: number }>(
      force
        ? 'SELECT songId FROM songs'
        : 'SELECT songId FROM songs WHERE dateCategorized IS NULL',
      [],
    )

    log.info('categorizing %s song(s)%s against a reference table of %s song(s)',
      rows.length, force ? ' (forced)' : '', CategoryReference.size())

    // The reference pass first, for every song, before a single request goes
    // out. It is local, so it costs nothing; doing it song-by-song inside the
    // online loop would mean a library that is 90% covered still crawling at
    // MusicBrainz's one request a second for the songs in between.
    let fromReference = 0
    const needLookup: number[] = []

    for (const { songId } of rows) {
      if (this.categorizeFromReference(songId)) fromReference++
      else needLookup.push(songId)
    }

    log.info('%s song(s) answered by the reference table; %s to look up online',
      fromReference, needLookup.length)

    let tagged = fromReference
    for (const songId of needLookup) {
      try {
        const categories = await this.categorizeSong(songId)
        if (categories.length) tagged++
      } catch (err) {
        log.warn('could not categorize song %s: %s', songId, (err as Error).message)
      }
    }

    this.pruneEmpty()
    log.info('categorization finished: %s/%s song(s) tagged (%s from the reference table)',
      tagged, rows.length, fromReference)

    return { processed: rows.length, tagged, fromReference }
  }
}

export default Categories
