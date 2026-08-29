#!/usr/bin/env node
/**
 * Regenerate server/Categories/data/song-categories.tsv from a library whose
 * categories have been corrected by hand.
 *
 * Deliberately dependency-free and run with plain `node`: node 24 ships
 * `node:sqlite`, so this works against a copy of a database file without
 * installing anything, on a machine that has never built the app.
 *
 *   node scripts/export-category-reference.mjs /path/to/database.sqlite3
 *
 * WHAT COUNTS AS HAND-VALIDATED
 *
 * A song qualifies when at least one of its categories has source 'manual' —
 * somebody opened that song and typed something. All of its categories are
 * then exported, including the ones an online lookup supplied: a person who
 * corrected the decade and left the genre alone was agreeing with the genre.
 *
 * Songs nobody ever touched are left out even though they are categorised,
 * because their categories came from MusicBrainz — and seeding a table that is
 * declared authoritative *over* MusicBrainz with MusicBrainz's own output is
 * circular, and would freeze its known mistakes into a published file.
 *
 * The output is sorted and stable, so regenerating it after correcting a
 * handful of songs produces a diff of a handful of lines.
 */
import { DatabaseSync } from 'node:sqlite' // eslint-disable-line n/no-unsupported-features/node-builtins
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'server', 'Categories', 'data', 'song-categories.tsv')
const TYPES = ['genre', 'decade', 'voice', 'language']

const dbFile = process.argv[2]

if (!dbFile) {
  // a usage error, not a crash: the stack trace is noise, so say it and stop
  console.error('usage: node scripts/export-category-reference.mjs <database.sqlite3> [output.tsv]')
  process.exit(1) // eslint-disable-line n/no-process-exit
}

const outFile = process.argv[3] || OUT
const db = new DatabaseSync(dbFile, { readOnly: true })

const rows = db.prepare(`
  SELECT a.name AS artist, s.title AS title, c.type AS type, c.name AS name
  FROM songCategories sc
    INNER JOIN songs s USING(songId)
    INNER JOIN artists a USING(artistId)
    INNER JOIN categories c USING(categoryId)
  WHERE sc.songId IN (SELECT songId FROM songCategories WHERE source = 'manual')
  ORDER BY a.name, s.title, c.type, c.name
`).all()

// a tab or a newline inside a name would break the row it sits in
const clean = s => String(s).replace(/[\t\r\n]+/g, ' ').trim()

const songs = new Map()

for (const row of rows) {
  const artist = clean(row.artist)
  const title = clean(row.title)
  if (!artist || !title) continue

  const key = `${artist}\t${title}`
  let song = songs.get(key)

  if (!song) {
    song = { artist, title, values: Object.fromEntries(TYPES.map(t => [t, new Set()])) }
    songs.set(key, song)
  }

  if (song.values[row.type]) song.values[row.type].add(clean(row.name))
}

// byte-wise, so the order does not depend on the exporting machine's locale
const sorted = [...songs.values()].sort((a, b) => {
  const ka = `${a.artist}\t${a.title}`
  const kb = `${b.artist}\t${b.title}`
  return ka < kb ? -1 : ka > kb ? 1 : 0
})

const lines = [
  '# Karaoke Propio — hand-checked song categories.',
  '#',
  '# The primary source of truth for categorisation, consulted before',
  '# MusicBrainz: every song here was categorised by a person looking at it,',
  '# and an online lookup is only asked about songs this file does not name.',
  '#',
  '# Columns are tab-separated. Artist and title are written the way the',
  '# library stores them; matching folds case, accents, punctuation and a',
  '# leading or trailing article, so "The Beatles" and "Beatles, The" are the',
  '# same song. Several genres are separated by "|". Empty means "not known",',
  '# never "none".',
  '#',
  '# Regenerate with: node scripts/export-category-reference.mjs <database.sqlite3>',
  '# Corrections are welcome as ordinary pull requests against this file.',
  ['artist', 'title', ...TYPES].join('\t'),
]

for (const song of sorted) {
  const cells = TYPES.map(type => [...song.values[type]].sort().join('|'))
  if (cells.every(c => !c)) continue
  lines.push([song.artist, song.title, ...cells].join('\t'))
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, lines.join('\n') + '\n')

const counts = Object.fromEntries(TYPES.map(t => [t, 0]))
for (const song of sorted) for (const t of TYPES) counts[t] += song.values[t].size

console.log(`wrote ${outFile}`)
console.log(`  ${sorted.length} songs`)
for (const t of TYPES) console.log(`  ${counts[t]} ${t}`)

db.close()
