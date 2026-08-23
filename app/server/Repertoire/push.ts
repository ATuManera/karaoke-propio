import Library from '../Library/Library.js'
import PitchPrefs from '../Pitch/PitchPrefs.js'
import { PITCH_PREFS_PUSH, STARS_PUSH, STAR_COUNTS_PUSH } from '../../shared/actionTypes.js'

/**
 * Tell a singer's own devices what an import just gave them.
 *
 * Without this the import would appear to have done nothing: saved pitches and
 * stars are pushed once, when the socket connects, and by the time the file is
 * applied that has already happened. A guest who has just joined and brought
 * their repertoire would have to reload the page to see any of it.
 *
 * Their sockets only, for the reason Pitch/socket.ts spells out: a pitch is
 * information about someone's voice, not a public fact about a song. The star
 * COUNTS are the exception and go to everyone, because they always were public.
 */
export function pushImportedRepertoire (io, userId: number, { starsChanged }: { starsChanged: boolean }): void {
  const stars = Library.getUserStars(userId)
  const prefs = PitchPrefs.get(userId)

  for (const sock of io.of('/').sockets.values()) {
    if (sock.user?.userId !== userId) continue

    sock.emit('action', { type: STARS_PUSH, payload: stars })
    sock.emit('action', { type: PITCH_PREFS_PUSH, payload: prefs })
  }

  if (starsChanged) {
    io.emit('action', { type: STAR_COUNTS_PUSH, payload: Library.getStarCounts() })
  }
}
