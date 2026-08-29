import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import CategoryReference, { parseReference, ReferenceFormatError, REFERENCE_FILE } from './CategoryReference.js'
import Categories from './Categories.js'
import Library from '../Library/Library.js'
import { matchKey } from './categoryMap.js'

// see Queue.test.ts: `db` is a live ES module binding, so the statically
// imported classes follow whichever SQLite file is open at call time

let tmpDir: string

const HEADER = 'artist\ttitle\tgenre\tdecade\tvoice\tlanguage'

function writeReference (lines: string[]): string {
  const file = path.join(tmpDir, 'song-categories.tsv')
  fs.writeFileSync(file, [HEADER, ...lines].join('\n') + '\n')
  return file
}

function addSong (artist: string, title: string): number {
  return Library.matchSong({
    artist,
    artistNorm: artist.toLowerCase(),
    title,
    titleNorm: title.toLowerCase(),
  }).songId as number
}

function categoriesOf (songId: number): { name: string, type: string, source: string }[] {
  return db.db.all(`
    SELECT c.name, c.type, sc.source
    FROM songCategories sc INNER JOIN categories c USING(categoryId)
    WHERE sc.songId = ?
    ORDER BY c.type, c.name
  `, [songId])
}

describe('CategoryReference (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kp-category-reference-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('parseReference', () => {
    it('reads one song per line, splitting multiple genres', () => {
      const entries = parseReference([
        HEADER,
        'ABBA\tDancing Queen\tDisco|Pop\t70\'s\tGroup\tEnglish',
      ].join('\n'))

      expect(entries).toHaveLength(1)
      expect(entries[0].artist).toBe('ABBA')
      expect(entries[0].categories).toEqual([
        { name: 'Disco', type: 'genre' },
        { name: 'Pop', type: 'genre' },
        { name: '70\'s', type: 'decade' },
        { name: 'Group', type: 'voice' },
        { name: 'English', type: 'language' },
      ])
    })

    it('ignores comments and blank lines', () => {
      const entries = parseReference([
        '# a comment before the header',
        '',
        HEADER,
        '# and one after it',
        'Queen\tBohemian Rhapsody\tRock\t70\'s\tGroup\tEnglish',
      ].join('\n'))

      expect(entries).toHaveLength(1)
    })

    it('treats an empty cell as "not known" rather than a category', () => {
      const entries = parseReference([HEADER, 'Queen\tBohemian Rhapsody\tRock\t\t\t'].join('\n'))

      expect(entries[0].categories).toEqual([{ name: 'Rock', type: 'genre' }])
    })

    // one bad line should cost one song its categories, not the whole boot
    it('skips a line with no artist or no title', () => {
      const entries = parseReference([HEADER, '\tOrphan Title\tPop\t\t\t', 'Queen\tRadio Ga Ga\tPop\t\t\t'].join('\n'))

      expect(entries.map(e => e.title)).toEqual(['Radio Ga Ga'])
    })

    // filing genres under "voice" would be worse than refusing to start
    it('refuses a file whose columns are not the ones it expects', () => {
      expect(() => parseReference('artist\ttitle\tvoice\tgenre\tdecade\tlanguage\nx\ty\t\t\t\t\n'))
        .toThrow(ReferenceFormatError)
    })
  })

  describe('load', () => {
    it('keys rows on the folded name, so article order does not matter', () => {
      CategoryReference.load(writeReference(['The Beatles\tThe Long and Winding Road\tBallad\t70\'s\tGroup\tEnglish']))

      // this app files the article at the end; the shipped file need not
      expect(CategoryReference.lookup('Beatles, The', 'Long and Winding Road, The'))
        .toEqual(expect.arrayContaining([{ name: 'Ballad', type: 'genre' }]))
    })

    it('folds case, accents and punctuation', () => {
      CategoryReference.load(writeReference(['Rocío Dúrcal\tAmor Eterno\tRanchera\t80\'s\tFemale\tSpanish']))

      expect(CategoryReference.lookup('rocio durcal', 'amor eterno!')).toHaveLength(4)
    })

    it('is a cache of the file: reloading drops what the file no longer says', () => {
      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))
      expect(CategoryReference.size()).toBe(1)

      CategoryReference.load(writeReference(['ABBA\tFernando\tPop\t70\'s\tGroup\tEnglish']))
      expect(CategoryReference.size()).toBe(1)
      expect(CategoryReference.lookup('Queen', 'Radio Ga Ga')).toEqual([])
    })

    it('treats a missing file as "no reference table" rather than an error', () => {
      expect(() => CategoryReference.load(path.join(tmpDir, 'nope.tsv'))).not.toThrow()
      expect(CategoryReference.size()).toBe(0)
    })

    it('returns nothing for a song it has never heard of', () => {
      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))

      expect(CategoryReference.lookup('Queen', 'Radio Gugu')).toEqual([])
    })
  })

  describe('applying it to a song', () => {
    it('categorizes a newly found song without any online lookup', () => {
      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock|Pop\t80\'s\tGroup\tEnglish']))
      const songId = addSong('Queen', 'Radio Ga Ga')

      expect(Categories.categorizeFromReference(songId)).toBe(true)
      expect(categoriesOf(songId).map(c => `${c.type}:${c.name}`)).toEqual([
        'decade:80\'s', 'genre:Pop', 'genre:Rock', 'language:English', 'voice:Group',
      ])
      expect(categoriesOf(songId).every(c => c.source === 'reference')).toBe(true)
    })

    it('stamps dateCategorized so no online lookup is attempted later', () => {
      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))
      const songId = addSong('Queen', 'Radio Ga Ga')
      Categories.categorizeFromReference(songId)

      const row = db.db.get<{ dateCategorized: number | null }>(
        'SELECT dateCategorized FROM songs WHERE songId = ?', [songId],
      )
      expect(row?.dateCategorized).toBeGreaterThan(0)
    })

    it('reports a miss, so the caller knows the song still needs looking up', () => {
      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))
      const songId = addSong('Nobody', 'Unknown Song')

      expect(Categories.categorizeFromReference(songId)).toBe(false)
      expect(categoriesOf(songId)).toEqual([])
    })

    it('supersedes what an online lookup had guessed', () => {
      const songId = addSong('Queen', 'Radio Ga Ga')
      Categories.setSongCategories(songId, [{ name: 'Metal', type: 'genre' }], 'auto')

      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))
      Categories.categorizeFromReference(songId)

      expect(categoriesOf(songId).map(c => c.name)).not.toContain('Metal')
      expect(categoriesOf(songId).map(c => c.name)).toContain('Rock')
    })

    // the whole point of the source ladder
    it('never overrides what a person set by hand', () => {
      const songId = addSong('Queen', 'Radio Ga Ga')
      Categories.addManual(songId, 'Ballad', 'genre')

      CategoryReference.load(writeReference(['Queen\tRadio Ga Ga\tRock\t80\'s\tGroup\tEnglish']))
      Categories.categorizeFromReference(songId)

      const ballad = categoriesOf(songId).find(c => c.name === 'Ballad')
      expect(ballad).toMatchObject({ source: 'manual' })
    })
  })

  describe('the source ladder', () => {
    // this used to be a silent no-op: INSERT OR IGNORE kept the 'auto' row,
    // and the next enrichment run deleted the admin's correction as its own
    it('promotes an existing auto row when a person sets the same category', () => {
      const songId = addSong('Queen', 'Radio Ga Ga')
      Categories.setSongCategories(songId, [{ name: 'Rock', type: 'genre' }], 'auto')

      Categories.addManual(songId, 'Rock', 'genre')
      expect(categoriesOf(songId)).toEqual([{ name: 'Rock', type: 'genre', source: 'manual' }])

      // and a later auto run must not take it away again
      Categories.setSongCategories(songId, [{ name: 'Metal', type: 'genre' }], 'auto')
      expect(categoriesOf(songId).map(c => c.name)).toContain('Rock')
    })

    it('does not demote a manual row to reference', () => {
      const songId = addSong('Queen', 'Radio Ga Ga')
      Categories.addManual(songId, 'Rock', 'genre')
      Categories.setSongCategories(songId, [{ name: 'Rock', type: 'genre' }], 'reference')

      expect(categoriesOf(songId)).toEqual([{ name: 'Rock', type: 'genre', source: 'manual' }])
    })
  })

  describe('the file that ships with the source', () => {
    it('parses, and every row is reachable by its own name', () => {
      const entries = parseReference(fs.readFileSync(REFERENCE_FILE, 'utf8'))

      expect(entries.length).toBeGreaterThan(500)

      for (const entry of entries) {
        expect(matchKey(entry.artist), `${entry.artist} normalises to nothing`).not.toBe('')
        expect(matchKey(entry.title), `${entry.title} normalises to nothing`).not.toBe('')
      }
    })

    it('names no category type the app does not have', () => {
      const entries = parseReference(fs.readFileSync(REFERENCE_FILE, 'utf8'))
      const types = new Set(entries.flatMap(e => e.categories.map(c => c.type)))

      expect([...types].sort()).toEqual(['decade', 'genre', 'language', 'voice'])
    })

    // a published table that names genres its own mapper cannot produce would
    // leave an online lookup unable to reproduce a categorisation already made
    it('names no genre the category map does not know', async () => {
      const { GENRE_NAMES } = await import('./categoryMap.js')
      const entries = parseReference(fs.readFileSync(REFERENCE_FILE, 'utf8'))

      const unknown = new Set<string>()
      for (const entry of entries) {
        for (const c of entry.categories) {
          if (c.type === 'genre' && !GENRE_NAMES.has(c.name)) unknown.add(c.name)
        }
      }

      expect([...unknown]).toEqual([])
    })

    it('loads into the table it ships for', () => {
      const { songs, rows } = CategoryReference.load()

      expect(songs).toBeGreaterThan(500)
      expect(rows).toBeGreaterThan(songs)
      expect(CategoryReference.size()).toBe(songs)
    })
  })
})
