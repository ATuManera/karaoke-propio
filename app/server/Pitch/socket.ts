import Media from '../Media/Media.js'
import PitchFeedback from './PitchFeedback.js'
import PitchPrefs from './PitchPrefs.js'
import Queue from '../Queue/Queue.js'
import { isValidPitch } from '../../shared/pitch.js'
import {
  SET_SONG_PITCH_PREF,
  CLEAR_SONG_PITCH_PREF,
  PITCH_PREFS_PUSH,
  PITCH_FEEDBACK_PUSH,
  PITCH_FEEDBACK_RESPOND,
  PITCH_FEEDBACK_RESOLVED,
  _SUCCESS,
  _ERROR,
} from '../../shared/actionTypes.js'

/**
 * Emit to every socket of one user, and to nobody else.
 *
 * Deliberately not `server.emit` — the star handlers broadcast because a star
 * count is public by design, but the key someone is comfortable singing in is
 * information about their body, and in a party it is exactly the kind of thing
 * people tease each other with. Their phone and their tablet, nothing else.
 */
function emitToUser (server, userId: number, action: { type: string, payload?: unknown }): void {
  for (const s of server.of('/').sockets.values()) {
    if (s.user?.userId === userId) {
      s.emit('action', action)
    }
  }
}

/** Send a user their own saved pitches, on every device they have open. */
export function pushPitchPrefs (sock, userId: number): void {
  emitToUser(sock.server, userId, { type: PITCH_PREFS_PUSH, payload: PitchPrefs.get(userId) })
}

/**
 * A performance ended on its own: ask the person who sang it how it felt.
 *
 * Everything the answer will be filed against — singer, song, version, and the
 * pitch actually played — is resolved here from the queue row. The Player sends
 * a queueId and nothing more, so a Player cannot attribute a performance to
 * someone who wasn't singing (see §3.4.2).
 */
export function createPitchFeedback (sock, queueId: number): void {
  const performance = Queue.getPerformance(queueId)

  // gone from the queue, or belongs to some other room's Player
  if (!performance || performance.roomId !== sock.user.roomId) return

  const created = PitchFeedback.create(performance)
  if (!created) return

  if (created.replacedFeedbackId) {
    emitToUser(sock.server, performance.userId, {
      type: PITCH_FEEDBACK_RESOLVED,
      payload: { feedbackId: created.replacedFeedbackId, pitchSemitones: null, limit: null },
    })
  }

  emitToUser(sock.server, performance.userId, {
    type: PITCH_FEEDBACK_PUSH,
    payload: PitchFeedback.toPrompt(created.pending),
  })
}

/** Re-offer a still-unanswered question to a device that just (re)connected. */
export function pushPitchFeedback (server, sock): void {
  const pending = PitchFeedback.getPending(sock.user.userId)
  if (!pending) return

  server.to(sock.id).emit('action', {
    type: PITCH_FEEDBACK_PUSH,
    payload: PitchFeedback.toPrompt(pending),
  })
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

  /**
   * "How was that pitch?", answered.
   *
   * The payload is a feedbackId and one of six words. The pitch that gets saved
   * is computed here from the performance the server itself recorded, never
   * sent by the client.
   */
  [PITCH_FEEDBACK_RESPOND]: (sock, { payload }, acknowledge) => {
    const { feedbackId, choice } = payload ?? {}
    const result = PitchFeedback.respond({ userId: sock.user.userId, feedbackId, choice })

    if (result.error) {
      return acknowledge({ type: PITCH_FEEDBACK_RESPOND + _ERROR, error: result.error })
    }

    acknowledge({ type: PITCH_FEEDBACK_RESPOND + _SUCCESS })

    // answering on the phone has to close the same question on the tablet
    emitToUser(sock.server, sock.user.userId, {
      type: PITCH_FEEDBACK_RESOLVED,
      payload: { feedbackId: result.pending.feedbackId, ...result.resolution },
    })

    if (result.resolution.pitchSemitones !== null) {
      pushPitchPrefs(sock, sock.user.userId)
    }
  },
}

export default ACTION_HANDLERS
