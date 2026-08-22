import getLogger from '../lib/Log.js'
import Library from './Library.js'
import SongReview from './SongReview.js'
import { retagSong } from '../Media/retagSong.js'
import { musicBrainz } from '../Categories/MusicBrainzClient.js'
import { corroborate } from '../Acquisition/corroborate.js'
import { buildLibraryMatchIndex } from '../../shared/playlistMatch.js'
import { LIBRARY_PUSH } from '../../shared/actionTypes.js'
import type { Server as SocketIOServer } from 'socket.io'

const log = getLogger('recheckPending')

export interface RecheckResult {
  checked: number
  corrected: number
  failed: number
}

/**
 * Read every song still awaiting review again, and fix the ones that are the
 * wrong way round.
 *
 * This exists because the first bulk import into a library happens before the
 * library knows anybody. `resolveTrackMeta` asks the library which side of the
 * dash is the artist, and a library of Spanish-language music asked about
 * "Layla - Derek and the Dominos" has nothing to say — so it assumed the
 * conventional order and filed the song under "Layla". Sixty-two of
 * seventy-nine came out flagged, and about half of those were reversed.
 *
 * Everything needed to fix them was already on disk: the songs, the flag that
 * says nobody has checked them, and a MusicBrainz lookup that answers the
 * question outright. So they are re-read rather than re-downloaded, and
 * corrected through `retagSong`, which renames the files — a database-only fix
 * would revert on the next scan.
 *
 * A corrected song stays pending. Being fixed automatically is not the same as
 * having been looked at, and the whole point of the flag is that a person
 * looks.
 */
export async function recheckPending (io: SocketIOServer): Promise<RecheckResult> {
  const pending = SongReview.getPending()
  const result: RecheckResult = { checked: 0, corrected: 0, failed: 0 }

  log.info('re-reading %d songs awaiting review', pending.length)

  for (const row of pending) {
    const { songs, artists } = Library.get()
    const song = songs.entities[row.songId]
    if (!song) continue

    const artist = artists.entities[song.artistId]?.name ?? ''
    result.checked++

    // "Unknown Artist" has no second name to swap with, so MusicBrainz has
    // nothing to be asked about; those are the ones only a person can fix
    if (!artist || artist === 'Unknown Artist') continue

    const index = buildLibraryMatchIndex(songs.result.map((songId: number) => ({
      songId,
      title: songs.entities[songId].title,
      artist: artists.entities[songs.entities[songId].artistId]?.name ?? '',
    })))

    try {
      const meta = await corroborate({ artist, title: song.title, isAmbiguous: true }, index, musicBrainz)
      if (meta.artist === artist && meta.title === song.title) continue

      await retagSong(row.songId, meta.artist, meta.title)
      result.corrected++
      log.info('corrected %s: "%s - %s" -> "%s - %s"', row.songId, artist, song.title, meta.artist, meta.title)

      // pushed as each one lands, so a three-minute job visibly moves rather
      // than sitting silent and then jumping
      io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
    } catch (err) {
      result.failed++
      log.warn('could not re-read %s ("%s - %s"): %s', row.songId, artist, song.title, (err as Error).message)
    }
  }

  log.info('re-read %d songs: %d corrected, %d failed', result.checked, result.corrected, result.failed)
  io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })

  return result
}
