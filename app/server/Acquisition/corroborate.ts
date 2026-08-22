import getLogger from '../lib/Log.js'
import { TransientLookupError, type MusicBrainzClient } from '../Categories/MusicBrainzClient.js'
import { normalizeForMatch, type LibraryMatchIndex, type ResolvedTrackMeta } from '../../shared/playlistMatch.js'

const log = getLogger('corroborate')

/**
 * Settling which half of a YouTube title is the artist when the library
 * cannot say.
 *
 * `resolveTrackMeta` asks the library first, and that is the right first
 * question: it is free, instant, and always right about the artists it knows.
 * But it only knows the artists that are already here. Importing a classic
 * rock playlist into a library of Spanish-language music, it recognised almost
 * nobody, fell back to assuming "Artist - Title", and got half of them
 * backwards — because KaraFun and channels like it write the song first.
 *
 * MusicBrainz knows all of them. Asked both ways round, it answers with no
 * ambiguity at all: over the reversed titles from that real import, the right
 * orientation scored 100 and the wrong one returned nothing, ten times out of
 * ten. Which is why this is a second question and not the first one — it costs
 * a second per lookup and an internet connection, and it is only worth
 * spending on the readings the library could not corroborate.
 */
export async function corroborate (
  meta: ResolvedTrackMeta,
  index: LibraryMatchIndex,
  mb: MusicBrainzClient,
): Promise<ResolvedTrackMeta> {
  // nothing to swap, or the library already answered
  if (!meta.isAmbiguous || !meta.artist || !meta.title) return meta

  let asWritten: Awaited<ReturnType<MusicBrainzClient['findRecording']>>
  let reversed: Awaited<ReturnType<MusicBrainzClient['findRecording']>>

  try {
    asWritten = await mb.findRecording(meta.artist, meta.title)
    reversed = await mb.findRecording(meta.title, meta.artist)
  } catch (err) {
    // rate limited or offline: an unlucky moment must never be recorded as an
    // answer, so the reading stays exactly as uncertain as it was
    if (err instanceof TransientLookupError) {
      log.info('could not reach MusicBrainz for "%s - %s": %s', meta.artist, meta.title, err.message)
      return meta
    }
    throw err
  }

  // both or neither: MusicBrainz has no opinion worth acting on
  if (!!asWritten === !!reversed) return meta

  const winner = (asWritten ?? reversed)!

  return {
    // The library's own spelling if it has one, otherwise MusicBrainz's — the
    // uploader's is never kept, because the point of naming a song correctly
    // is that it lands beside the others by the same performer, and "Doors"
    // does not land beside "Doors, The".
    artist: index.artistNames.get(normalizeForMatch(winner.artist)) ?? winner.artist,
    // the title stays as the uploader wrote it: MusicBrainz's is canonical
    // rather than familiar, and nobody looks for "Fire & Rain" having heard
    // "Fire and Rain"
    title: asWritten ? meta.title : meta.artist,
    isAmbiguous: false,
  }
}
