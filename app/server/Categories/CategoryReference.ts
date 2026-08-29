import fs from 'node:fs'
import path from 'node:path'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import { matchKey, type Category, type CategoryType } from './categoryMap.js'

const log = getLogger('CategoryReference')

/**
 * The curated table itself, shipped with the source.
 *
 * A plain tab-separated file rather than rows in a migration, because it is
 * meant to be read, diffed and added to by people: a pull request that says
 * "these forty songs are Bolero, not Ballad" should look like forty changed
 * lines, not like a blob of SQL nobody can review.
 *
 * `build:server` copies this directory into the build output, and the
 * Dockerfile copies the build output into the image — a file that ships in git
 * but not in the image is invisible at runtime.
 */
export const REFERENCE_FILE = path.join(import.meta.dirname, 'data', 'song-categories.tsv')

/**
 * Column order in the file. Artist and title are stored as they were written,
 * not normalised: the file is for people, and matchKey() is applied on the way
 * into the table so that the two ends can never drift apart.
 */
const HEADER = ['artist', 'title', 'genre', 'decade', 'voice', 'language'] as const
const VALUE_COLUMNS: CategoryType[] = ['genre', 'decade', 'voice', 'language']

/** a song may sit in several genres at once; one column, values separated */
const MULTI_SEPARATOR = '|'

export interface ReferenceEntry {
  artist: string
  title: string
  categories: Category[]
}

export class ReferenceFormatError extends Error {}

/**
 * Read the shipped table.
 *
 * Strict about its header and lenient about everything else: a malformed line
 * is dropped with a warning rather than aborting the boot, because a broken
 * row in a data file should cost one song its categories, not the whole
 * server. A wrong header, on the other hand, means the columns are not what
 * this code thinks they are, and quietly filing genres under "voice" would be
 * worse than refusing.
 */
export function parseReference (text: string): ReferenceEntry[] {
  const lines = text.split('\n')
  const entries: ReferenceEntry[] = []
  let header: string[] | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')

    // '#' starts a comment: the file carries its own explanation at the top
    if (!line.trim() || line.startsWith('#')) continue

    const fields = line.split('\t')

    if (!header) {
      header = fields.map(f => f.trim().toLowerCase())

      if (header.length !== HEADER.length || HEADER.some((name, idx) => header?.[idx] !== name)) {
        throw new ReferenceFormatError(
          `expected columns ${HEADER.join(', ')} but found ${header.join(', ')}`,
        )
      }
      continue
    }

    const artist = (fields[0] ?? '').trim()
    const title = (fields[1] ?? '').trim()

    if (!artist || !title) {
      log.warn('line %d: missing artist or title; skipped', i + 1)
      continue
    }

    const categories: Category[] = []
    const seen = new Set<string>()

    VALUE_COLUMNS.forEach((type, idx) => {
      const cell = (fields[idx + 2] ?? '').trim()
      if (!cell) return

      for (const raw of cell.split(MULTI_SEPARATOR)) {
        const name = raw.trim()
        if (!name) continue

        const key = `${type}:${name}`
        if (seen.has(key)) continue
        seen.add(key)
        categories.push({ name, type })
      }
    })

    if (!categories.length) {
      log.warn('line %d: "%s - %s" carries no categories; skipped', i + 1, artist, title)
      continue
    }

    entries.push({ artist, title, categories })
  }

  if (!header) throw new ReferenceFormatError('file has no header row')

  return entries
}

class CategoryReference {
  /**
   * Refresh the table from the shipped file.
   *
   * Rewritten wholesale on every boot rather than diffed: the table is a cache
   * of the file and holds nothing anybody typed, a few thousand rows cost
   * milliseconds, and "replace it" cannot go subtly wrong the way "work out
   * what changed" can. One transaction, so a half-written table is never
   * visible.
   *
   * A missing file is not an error. An installation may legitimately delete
   * it, and the categorizer simply falls back to MusicBrainz as it did before
   * this table existed.
   */
  static load (file: string = REFERENCE_FILE): { songs: number, rows: number } {
    let text: string

    try {
      text = fs.readFileSync(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        log.info('no reference table at %s; categorization will rely on MusicBrainz alone', file)
        return { songs: 0, rows: 0 }
      }
      throw err
    }

    const entries = parseReference(text)
    let rows = 0

    db.exec('BEGIN')
    try {
      db.run('DELETE FROM categoryReference')

      for (const entry of entries) {
        const artistKey = matchKey(entry.artist)
        const titleKey = matchKey(entry.title)

        // a name made entirely of punctuation normalises to nothing, and an
        // empty key would match every unnamed song
        if (!artistKey || !titleKey) {
          log.warn('"%s - %s" normalises to an empty key; skipped', entry.artist, entry.title)
          continue
        }

        for (const category of entry.categories) {
          // two spellings of one song ("Beatles, The" and "The Beatles") land
          // on the same key; the first one wins rather than the load failing
          const res = db.run(`
            INSERT OR IGNORE INTO categoryReference (artistKey, titleKey, artist, title, type, name)
            VALUES (?, ?, ?, ?, ?, ?)
          `, [artistKey, titleKey, entry.artist, entry.title, category.type, category.name])

          rows += Number(res.changes)
        }
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    log.info('reference table loaded: %d songs, %d categories', entries.length, rows)
    return { songs: entries.length, rows }
  }

  /**
   * What the reference says about one song, or nothing if it has never heard
   * of it. Matching is exact on the normalised name — a near miss returns
   * nothing, because a wrong category is worse than a missing one.
   */
  static lookup (artist: string, title: string): Category[] {
    const artistKey = matchKey(artist)
    const titleKey = matchKey(title)

    if (!artistKey || !titleKey) return []

    return db.all<Category>(`
      SELECT name, type FROM categoryReference
      WHERE artistKey = ? AND titleKey = ?
      ORDER BY type, name
    `, [artistKey, titleKey])
  }

  /** how many songs the table knows about, for logs and the admin scan report */
  static size (): number {
    const row = db.get<{ n: number }>(
      'SELECT COUNT(DISTINCT artistKey || \'\\t\' || titleKey) AS n FROM categoryReference', [],
    )
    return row?.n ?? 0
  }
}

export default CategoryReference
