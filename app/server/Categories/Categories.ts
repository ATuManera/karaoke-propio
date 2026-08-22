import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import { musicBrainz, TransientLookupError } from './MusicBrainzClient.js'
import { toCategories, type Category, type CategoryType } from './categoryMap.js'

const log = getLogger('Categories')

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

  static findOrCreate (name: string, type: CategoryType): number {
    const nameNorm = normalize(name)
    const existing = db.get<{ categoryId: number }>(
      'SELECT categoryId FROM categories WHERE nameNorm = ? AND type = ?', [nameNorm, type],
    )
    if (existing) return existing.categoryId

    const res = db.run('INSERT INTO categories (name, nameNorm, type) VALUES (?, ?, ?)', [name, nameNorm, type])
    return res.lastID as number
  }

  static setSongCategories (songId: number, categories: Category[], source: 'auto' | 'manual' = 'auto'): void {
    // a re-run must not undo someone's correction, so only rows from the same
    // source are replaced
    db.run('DELETE FROM songCategories WHERE songId = ? AND source = ?', [songId, source])

    for (const category of categories) {
      const categoryId = this.findOrCreate(category.name, category.type)
      db.run(
        'INSERT OR IGNORE INTO songCategories (songId, categoryId, source) VALUES (?, ?, ?)',
        [songId, categoryId, source],
      )
    }

    Library.cache.version = null // invalidate
  }

  static addManual (songId: number, name: string, type: CategoryType): void {
    const categoryId = this.findOrCreate(name, type)
    db.run('INSERT OR IGNORE INTO songCategories (songId, categoryId, source) VALUES (?, ?, ?)', [songId, categoryId, 'manual'])
    Library.cache.version = null
  }

  static removeFromSong (songId: number, categoryId: number): void {
    db.run('DELETE FROM songCategories WHERE songId = ? AND categoryId = ?', [songId, categoryId])
    this.pruneEmpty()
    Library.cache.version = null
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
  static async categorizeAll ({ force = false }: { force?: boolean } = {}): Promise<{ processed: number, tagged: number }> {
    const rows = db.all<{ songId: number }>(
      force
        ? 'SELECT songId FROM songs'
        : 'SELECT songId FROM songs WHERE dateCategorized IS NULL',
      [],
    )

    log.info('categorizing %s song(s)%s', rows.length, force ? ' (forced)' : '')

    let tagged = 0
    for (const { songId } of rows) {
      try {
        const categories = await this.categorizeSong(songId)
        if (categories.length) tagged++
      } catch (err) {
        log.warn('could not categorize song %s: %s', songId, (err as Error).message)
      }
    }

    this.pruneEmpty()
    log.info('categorization finished: %s/%s song(s) tagged', tagged, rows.length)

    return { processed: rows.length, tagged }
  }
}

export default Categories
