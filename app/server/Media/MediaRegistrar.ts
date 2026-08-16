import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import Media from './Media.js'
import Prefs from '../Prefs/Prefs.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
import getConfig from '../Scanner/FileScanner/getConfig.js'
import { stripSourceIdSuffix } from '../lib/util.js'
import { probeMedia } from './mediaResolver.js'
import { buildMediaFields, diffMediaFields, toRelPath } from './mediaRecord.js'

const log = getLogger('MediaRegistrar')

export interface RegisterResult {
  mediaId: number
  songId: number
  artistId: number
  isNewMedia: boolean
  isNewSong: boolean
  isNewArtist: boolean
}

export interface MetadataOverride {
  artist: string
  title: string
}

/**
 * Register ONE freshly-published library file without a full
 * FileScanner.scan() pass (see prompt_de_implementacion.md #37 — point
 * registration). A full scan touches removeInvalid()/cleanup() and can take
 * a long time on a large library; acquisition needs an immediate, precise
 * answer for the exact file it just published.
 *
 * Runs in the main process (unlike FileScanner, which runs in a child
 * process and talks to the DB over IPC) — this can call Media/Library
 * directly since the main process already holds the writable connection.
 *
 * `metadataOverride`: when the caller already knows the correct
 * artist/title (e.g. UltraStar acquisition reads them straight from
 * song.txt's #ARTIST/#TITLE), skip MetaParser's filename-based guessing
 * entirely. Guessing from a constructed filename like
 * "Artist - Title---videoId" is unreliable: MetaParser's delimiter search
 * can tie between the intended "Artist - Title" separator and the
 * "---videoId" uniqueness suffix, leaking the video id into the title.
 */
export async function registerMedia (file: string, pathId: number, metadataOverride?: MetadataOverride): Promise<RegisterResult> {
  const { paths } = Prefs.get()
  const pathEntry = paths.entities[pathId]

  if (!pathEntry) {
    throw new Error(`invalid pathId: ${pathId}`)
  }

  // never trust a caller-supplied path: resolve symlinks and verify the real
  // file still lives inside the configured library path (no ../ traversal,
  // no symlink escape)
  const basePath = pathEntry.path
  const realBase = await fsPromises.realpath(basePath)
  const realFile = await fsPromises.realpath(file)

  if (realFile !== realBase && !realFile.startsWith(realBase + path.sep)) {
    throw new Error(`refusing to register a file outside its library path: ${file}`)
  }

  const stats = await fsPromises.stat(realFile)
  if (!stats.isFile()) {
    throw new Error(`not a regular file: ${file}`)
  }

  const probed = await probeMedia(realFile)

  let parsed: { artist: string, artistNorm: string, title: string, titleNorm: string }

  if (metadataOverride) {
    parsed = {
      artist: metadataOverride.artist,
      artistNorm: metadataOverride.artist,
      title: metadataOverride.title,
      titleNorm: metadataOverride.title,
    }
  } else {
    const pathInfo = path.parse(realFile)
    const cfg = getConfig(pathInfo.dir, basePath)
    const parser = MetaParser(cfg)
    parsed = parser({
      dir: pathInfo.dir,
      dirSep: path.sep,
      // drop the acquisition uniqueness suffix first: it is not part of the
      // song's name and would otherwise surface to users as a title like
      // "Soy Rebelde (Versión Karaoke)---5qZJ7FHVoak"
      name: stripSourceIdSuffix(pathInfo.name),
      meta: probed.meta,
    })
  }

  const match = Library.matchSong(parsed)
  const relPath = toRelPath(realFile, basePath)
  const mediaFields = buildMediaFields(probed, match.songId, pathId, relPath)

  const existing = Media.search({ pathId, relPath: mediaFields.relPath })

  if (existing.result.length) {
    const row = existing.entities[existing.result[0]]
    const diff = diffMediaFields(mediaFields, row)

    if (Object.keys(diff).length) {
      Media.update({
        mediaId: row.mediaId,
        dateUpdated: Math.round(Date.now() / 1000),
        ...diff,
      })
      log.info('point-registered (updated): %s', relPath)
    } else {
      log.info('point-registered (unchanged): %s', relPath)
    }

    return {
      mediaId: row.mediaId,
      songId: match.songId,
      artistId: match.artistId,
      isNewMedia: false,
      isNewSong: !!match.isNewSong,
      isNewArtist: !!match.isNewArtist,
    }
  }

  const mediaId = Media.add({
    ...mediaFields,
    dateAdded: Math.round(Date.now() / 1000),
  })

  log.info('point-registered (new media): %s', relPath)

  return {
    mediaId,
    songId: match.songId,
    artistId: match.artistId,
    isNewMedia: true,
    isNewSong: !!match.isNewSong,
    isNewArtist: !!match.isNewArtist,
  }
}

/**
 * Move a fully-validated staged file into its final library location,
 * atomically (rename, not copy). Caller must have already verified every
 * file that belongs to this acquisition is complete and valid — this never
 * partially publishes.
 */
export async function publishAtomically (stagedFile: string, pathId: number, destRelPath: string): Promise<string> {
  const { paths } = Prefs.get()
  const pathEntry = paths.entities[pathId]
  if (!pathEntry) throw new Error(`invalid pathId: ${pathId}`)

  const destPath = path.join(pathEntry.path, destRelPath)
  const realBase = await fsPromises.realpath(pathEntry.path)

  if (!(destPath === realBase || destPath.startsWith(realBase + path.sep))) {
    throw new Error('refusing to publish outside the configured library path')
  }

  await fsPromises.mkdir(path.dirname(destPath), { recursive: true })

  // rename() is atomic when source and destination are on the same
  // filesystem, which is guaranteed here: staging lives inside the same
  // library path tree (see AcquisitionManager)
  await fsPromises.rename(stagedFile, destPath)

  return destPath
}

/** Sanitize a title/artist string into a safe path segment. */
const FS_HOSTILE_CHARS = new RegExp(
  // filesystem-hostile punctuation + ASCII control characters (0x00-0x1f)
  '[/\\\\:*?"<>|' + Array.from({ length: 0x20 }, (_, i) => String.fromCharCode(i)).join('') + ']',
  'g',
)

export function sanitizePathSegment (name: string): string {
  return name
    .replace(FS_HOSTILE_CHARS, ' ')
    .replace(/^\.+/, '') // no leading dots (hidden files / '.' '..')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'untitled'
}

export function fileExistsSync (p: string): boolean {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}
