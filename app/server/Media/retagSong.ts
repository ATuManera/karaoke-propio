import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import { stripSourceIdSuffix, withSourceIdSuffix } from '../lib/util.js'
import Library from '../Library/Library.js'
import Media from './Media.js'
import Prefs from '../Prefs/Prefs.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
import getConfig from '../Scanner/FileScanner/getConfig.js'
import { sanitizePathSegment } from './MediaRegistrar.js'
import { MessageError } from '../lib/i18n.js'

const log = getLogger('retagSong')

export interface RetagResult {
  songId: number
  artistId: number
  artist: string
  title: string
  renamed: { from: string, to: string }[]
}

/**
 * Correct the artist/title of a song already in the library.
 *
 * Renames the underlying files as well as updating the database, and that is
 * the whole point: filenames are what FileScanner re-derives metadata from, so
 * a database-only edit silently reverts the next time the library is scanned.
 * The stored values are then read back out of the new filename through
 * MetaParser — the same path the scanner takes — so a rescan is a no-op and
 * article handling stays consistent ("The Beatles" filed under "Beatles, The").
 *
 * Songs merge when the new name matches an existing one, which is normal after
 * fixing a typo: "Mark Anthony" becoming "Marc Anthony" should join that
 * artist rather than sit beside it. Queue entries and stars follow the merge.
 */
export async function retagSong (songId: number, artistInput: string, titleInput: string): Promise<RetagResult> {
  const artist = artistInput.trim()
  const title = titleInput.trim()

  if (!artist || !title) throw new MessageError(422, 'server.library.artistAndTitleRequired')

  const mediaRes = Media.search({ songId })
  if (!mediaRes.result.length) throw new Error(`songId not found: ${songId}`)

  const { paths } = Prefs.get()
  const newBase = `${sanitizePathSegment(artist)} - ${sanitizePathSegment(title)}`
  const renamed: { from: string, to: string }[] = []

  // ---- rename on disk first; the DB is only touched once files are in place ----
  for (const mediaId of mediaRes.result) {
    const m = mediaRes.entities[mediaId]
    const basePath = paths.entities[m.pathId]?.path
    if (!basePath) throw new Error(`invalid pathId on media ${mediaId}`)

    const dir = path.dirname(path.join(basePath, m.relPath))
    const oldBase = path.basename(m.relPath).replace(/\.[^.]+$/, '')

    // keep the "---sourceId" suffix: it is what stops two versions of one song
    // from overwriting each other (see lib/util.ts)
    const sourceId = /---([\w-]{11})$/.exec(oldBase)?.[1]
    const targetBase = sourceId ? withSourceIdSuffix(newBase, sourceId) : newBase

    if (targetBase === oldBase) continue

    // move every sidecar that shares the basename (.cdg, .jpg, .txt...) or the
    // pair would break apart
    for (const file of await fsPromises.readdir(dir)) {
      if (file !== oldBase && !file.startsWith(oldBase + '.')) continue

      const ext = file.slice(oldBase.length)
      const from = path.join(dir, file)
      const to = path.join(dir, targetBase + ext)

      if (fs.existsSync(to)) throw new MessageError(409, 'server.library.renameConflict', { name: targetBase + ext })

      await fsPromises.rename(from, to)
      renamed.push({ from: file, to: targetBase + ext })
    }

    const newRelPath = path.join(path.dirname(m.relPath), targetBase + path.extname(m.relPath))
    db.run('UPDATE media SET relPath = ? WHERE mediaId = ?', [newRelPath === m.relPath ? m.relPath : newRelPath, mediaId])
  }

  // ---- re-derive metadata the way a scan would, from the new filename ----
  const first = mediaRes.entities[mediaRes.result[0]]
  const basePath = paths.entities[first.pathId].path
  const parser = MetaParser(getConfig(path.dirname(path.join(basePath, first.relPath)), basePath))
  const parsed = parser({
    dir: path.dirname(path.join(basePath, first.relPath)),
    dirSep: path.sep,
    name: stripSourceIdSuffix(newBase),
    meta: {},
  })

  const match = Library.matchSong(parsed)
  const targetSongId = match.songId as number

  if (targetSongId !== songId) {
    // the corrected name belongs to an existing song: move everything over and
    // retire the old row rather than leaving a duplicate behind
    db.run('UPDATE media SET songId = ? WHERE songId = ?', [targetSongId, songId])
    db.run('UPDATE queue SET songId = ? WHERE songId = ?', [targetSongId, songId])
    db.run('UPDATE songStars SET songId = ? WHERE songId = ?', [targetSongId, songId])
    db.run('DELETE FROM songs WHERE songId = ?', [songId])
  }

  // drop artists nothing points at anymore (the misspelling that was corrected)
  db.run('DELETE FROM artistStars WHERE artistId NOT IN (SELECT DISTINCT artistId FROM songs)')
  db.run('DELETE FROM artists WHERE artistId NOT IN (SELECT DISTINCT artistId FROM songs)')

  Library.cache.version = null // invalidate

  log.info('retagged song %s -> "%s - %s" (%s file(s) renamed)', songId, parsed.artist, parsed.title, renamed.length)

  return {
    songId: targetSongId,
    artistId: match.artistId as number,
    artist: parsed.artist,
    title: parsed.title,
    renamed,
  }
}
