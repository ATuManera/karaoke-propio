import fsPromises from 'node:fs/promises'
import path from 'node:path'
import Media from './Media.js'
import Prefs from '../Prefs/Prefs.js'
import { ultraStarToNotes } from '../Acquisition/UltraStarToLrc.js'
import { getNoteRange, type SongNote } from '../../shared/notes.js'

export interface SongNotesResult {
  notes: SongNote[]
  range: ReturnType<typeof getNoteRange>
}

/**
 * The melody of a song, when it is known.
 *
 * Only UltraStar/USDB acquisitions have this: their song.txt states the pitch
 * of every syllable. A YouTube karaoke track cannot be analysed for it — the
 * lead vocal is exactly what those recordings leave out, so there is no melody
 * in the audio to detect. Callers get null rather than a guess.
 */
export async function getSongNotes (songId: number): Promise<SongNotesResult | null> {
  const res = Media.search({ songId })
  const { paths } = Prefs.get()

  for (const mediaId of res.result) {
    const media = res.entities[mediaId]
    const basePath = paths.entities[media.pathId]?.path
    if (!basePath) continue

    const full = path.join(basePath, media.relPath)
    const sidecar = full.replace(/\.[^.]+$/, '') + '.song.txt'

    let songTxt: string
    try {
      songTxt = await fsPromises.readFile(sidecar, 'utf8')
    } catch {
      continue // this version has no note data; another might
    }

    const notes = ultraStarToNotes(songTxt)
    if (!notes.length) continue

    return { notes, range: getNoteRange(notes) }
  }

  return null
}

/**
 * Absolute path of a song's audio, for analysis. Prefers the version playback
 * would pick, so the reported key matches what people actually hear.
 */
export function getSongMediaPath (songId: number): string | null {
  const res = Media.search({ songId })
  const { paths } = Prefs.get()

  const ordered = [...res.result].sort((a, b) =>
    Number(!!res.entities[b].isPreferred) - Number(!!res.entities[a].isPreferred))

  for (const mediaId of ordered) {
    const media = res.entities[mediaId]
    const basePath = paths.entities[media.pathId]?.path
    if (basePath) return path.join(basePath, media.relPath)
  }

  return null
}
