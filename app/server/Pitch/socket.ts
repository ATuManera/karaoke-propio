import Media from '../Media/Media.js'
import PitchPrefs from './PitchPrefs.js'
import { isValidPitch } from '../../shared/pitch.js'
import {
  SET_SONG_PITCH_PREF,
  CLEAR_SONG_PITCH_PREF,
  PITCH_PREFS_PUSH,
  _SUCCESS,
  _ERROR,
} from '../../shared/actionTypes.js'

/**
 * Send a user their own saved pitches, on every device they have open.
 *
 * Deliberately not `sock.server.emit` — the star handlers broadcast because a
 * star count is public by design, but the key someone is comfortable singing
 * in is information about their body, and in a party it is exactly the kind of
 * thing people tease each other with. Only that user's own sockets get it.
 */
export function pushPitchPrefs (sock, userId: number): void {
  const payload = PitchPrefs.get(userId)

  for (const s of sock.server.of('/').sockets.values()) {
    if (s.user?.userId === userId) {
      s.emit('action', { type: PITCH_PREFS_PUSH, payload })
    }
  }
}

const ACTION_HANDLERS = {
  [SET_SONG_PITCH_PREF]: (sock, { payload }, acknowledge) => {
    const { songId, pitchSemitones, mediaId = null } = payload ?? {}

    if (!Number.isInteger(songId)) {
      return acknowledge({ type: SET_SONG_PITCH_PREF + _ERROR, error: 'Invalid songId' })
    }

    // same trust boundary as queueing: the client never decides what a valid
    // pitch is (see shared/pitch.ts)
    if (!isValidPitch(pitchSemitones)) {
      return acknowledge({ type: SET_SONG_PITCH_PREF + _ERROR, error: 'Invalid pitchSemitones' })
    }

    if (mediaId !== null) {
      if (!Number.isInteger(mediaId) || Media.search({ mediaId }).entities[mediaId]?.songId !== songId) {
        return acknowledge({ type: SET_SONG_PITCH_PREF + _ERROR, error: 'Invalid mediaId for this song' })
      }
    }

    // 'manual' rather than 'assistant': this action is the checkbox in the
    // pitch modal. The assistant will pass its own source when it exists.
    PitchPrefs.set({ userId: sock.user.userId, songId, pitchSemitones, source: 'manual', mediaId })

    acknowledge({ type: SET_SONG_PITCH_PREF + _SUCCESS })
    pushPitchPrefs(sock, sock.user.userId)
  },

  [CLEAR_SONG_PITCH_PREF]: (sock, { payload }, acknowledge) => {
    const { songId } = payload ?? {}

    if (!Number.isInteger(songId)) {
      return acknowledge({ type: CLEAR_SONG_PITCH_PREF + _ERROR, error: 'Invalid songId' })
    }

    PitchPrefs.clear(sock.user.userId, songId)

    acknowledge({ type: CLEAR_SONG_PITCH_PREF + _SUCCESS })
    pushPitchPrefs(sock, sock.user.userId)
  },
}

export default ACTION_HANDLERS
