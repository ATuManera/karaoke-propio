import Dedications from './Dedications.js'
import Media from '../Media/Media.js'
import PitchManager from '../Pitch/PitchManager.js'
import PitchPrefs from '../Pitch/PitchPrefs.js'
import { pushPitchPrefs } from '../Pitch/socket.js'
import Queue from './Queue.js'
import Rooms from '../Rooms/Rooms.js'
import { isValidPitch, PITCH_DEFAULT } from '../../shared/pitch.js'
import { sanitizeDedication } from '../../shared/dedication.js'
import {
  QUEUE_ADD,
  QUEUE_MOVE,
  QUEUE_REMOVE,
  QUEUE_PUSH,
  QUEUE_DEDICATION_SET,
  QUEUE_DEDICATION_REMOVE,
} from '../../shared/actionTypes.js'

/**
 * Who may write over a performance.
 *
 * Two rules, and the room check is not decoration: Queue.isOwner() matches on
 * (userId, queueId) alone, so without it an admin of one room could put a
 * message on a song queued in another.
 *
 *   - the singer writes on their own songs, for as long as the row exists
 *   - an admin writes on any song in the room they are actually in
 *
 * The queue screen additionally stops offering the control on songs already
 * sung, which is a courtesy rather than a rule: editing a message nobody will
 * see again is pointless, not dangerous.
 */
function canWrite (sock, { queueId, authorId }: { queueId: number, authorId?: number }): boolean {
  const row = Queue.getRow(queueId)
  if (!row || row.roomId !== sock.user.roomId) return false
  if (sock.user.isAdmin) return true

  // their own song, or — when editing an existing message — their own words
  return authorId === undefined ? row.userId === sock.user.userId : authorId === sock.user.userId
}

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [QUEUE_ADD]: async (sock, { payload }, acknowledge) => {
    const { songId, pitchSemitones = PITCH_DEFAULT, mediaId = null, rememberPitch = true, dedication = '' } = payload

    if (!Number.isInteger(songId)) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: 'Invalid songId',
      })
    }

    // the client is never trusted with pitch: validate range/type server-side
    if (!isValidPitch(pitchSemitones)) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: 'Invalid pitchSemitones',
      })
    }

    // never trust the client's version choice either: it must be a real media
    // row belonging to THIS song, or a singer could queue arbitrary media
    if (mediaId !== null) {
      if (!Number.isInteger(mediaId) || Media.search({ mediaId }).entities[mediaId]?.songId !== songId) {
        return acknowledge({
          type: QUEUE_ADD + '_ERROR',
          error: 'Invalid mediaId for this song',
        })
      }
    }

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: err.message,
      })
    }

    let queueId
    try {
      queueId = Queue.add({
        roomId: sock.user.roomId,
        songId,
        userId: sock.user.userId,
        pitchSemitones,
        mediaId,
      })
    } catch (err) {
      return acknowledge({
        type: QUEUE_ADD + '_ERROR',
        error: err.message,
      })
    }

    // The dedication written in the same breath as the request (see
    // PitchModal). Attached to the row that was just created, never to
    // "the song this person queued" — the same person may queue the same
    // song twice tonight and mean something different each time.
    const clean = sanitizeDedication(dedication)

    if (clean !== '') {
      try {
        Dedications.set({ queueId, userId: sock.user.userId, text: clean })
      } catch (err) {
        // the song is already queued; losing the words is not worth failing
        // the add over, and they can be written again from the queue screen
        sock.server.log?.error?.(err)
      }
    }

    // register the pitch need immediately (cache lookup / job kickoff) but
    // NEVER hold the socket ack open waiting for the actual FFmpeg transcode
    if (pitchSemitones !== 0) {
      // the chosen version wins; only fall back when none was picked
      const pitchMediaId = mediaId ?? Media.getPreferredMediaId(songId)

      if (pitchMediaId !== null) {
        try {
          await PitchManager.request({
            mediaId: pitchMediaId,
            pitchSemitones,
            queueId,
            roomId: sock.user.roomId,
          })
        } catch (err) {
          // don't fail the queue add over a pitch registration issue; it'll
          // surface as pitchStatus='error' on the queue item instead
          sock.server.log?.error?.(err)
        }
      }
    }

    // Remember the pitch for next time, without being asked to. Only non-zero:
    // 0 is the default nobody chose, and recording it would put a meaningless
    // "0" reminder on every song anyone ever queued.
    //
    // Written as 'inferred', so it can never overwrite a pitch this singer
    // actually decided on (see PitchPrefs.set). Skipped entirely when the
    // singer just asked to be forgotten: recording the very performance they
    // opted out of would make the request look ignored.
    if (pitchSemitones !== 0 && rememberPitch !== false) {
      try {
        if (PitchPrefs.set({
          userId: sock.user.userId,
          songId,
          pitchSemitones,
          source: 'inferred',
          mediaId,
        })) {
          pushPitchPrefs(sock, sock.user.userId)
        }
      } catch (err) {
        // a remembered pitch is a convenience; never fail an add over it
        sock.server.log?.error?.(err)
      }
    }

    // success
    acknowledge({ type: QUEUE_ADD + '_SUCCESS' })

    // to all in room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  [QUEUE_MOVE]: async (sock, { payload }, acknowledge) => {
    const { queueId, prevQueueId } = payload

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: err.message,
      })
    }

    if (!sock.user.isAdmin && !(Queue.isOwner(sock.user.userId, queueId))) {
      return acknowledge({
        type: QUEUE_MOVE + '_ERROR',
        error: 'Cannot move another user\'s song',
      })
    }

    Queue.move({
      prevQueueId,
      queueId,
      roomId: sock.user.roomId,
    })

    // success
    acknowledge({ type: QUEUE_MOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  [QUEUE_REMOVE]: (sock, { payload }, acknowledge) => {
    const { queueId } = payload
    const ids = Array.isArray(queueId) ? queueId : [queueId]

    if (!sock.user.isAdmin && !(Queue.isOwner(sock.user.userId, ids))) {
      return acknowledge({
        type: QUEUE_REMOVE + '_ERROR',
        error: 'Cannot remove another user\'s song',
      })
    }

    for (const id of ids) {
      Queue.remove(id)
      // an in-flight pitch job is NEVER canceled (it may still be reused by
      // another waiter or cached for a future request); just stop tracking
      // this queueId as one of its waiters
      PitchManager.releaseQueueId(id)
    }

    // success
    acknowledge({ type: QUEUE_REMOVE + '_SUCCESS' })

    // tell room
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  /**
   * Write a message over a performance.
   *
   * With a dedicationId, an existing message is rewritten in place and keeps
   * its author: an admin fixing a name in someone's dedication is correcting
   * what that singer said, not signing it. Without one, the sender writes
   * their own message on that song, replacing whatever they said before —
   * which is the whole of "a singer may edit their dedication while the song
   * is queued", with no separate edit action to keep in step.
   *
   * An empty message removes it. Clearing the box and saving is the obvious
   * gesture for taking something down, and refusing it would only teach
   * people to type a space.
   */
  [QUEUE_DEDICATION_SET]: async (sock, { payload }, acknowledge) => {
    const { queueId, dedicationId = null, text = '' } = payload

    if (!Number.isInteger(queueId)) {
      return acknowledge({
        type: QUEUE_DEDICATION_SET + '_ERROR',
        error: 'Invalid queueId',
      })
    }

    // the client's text is never trusted: length, line breaks and the bidi
    // overrides that would flip the rest of the banner are settled here
    const clean = sanitizeDedication(text)

    let existing
    if (dedicationId !== null) {
      if (!Number.isInteger(dedicationId)) {
        return acknowledge({
          type: QUEUE_DEDICATION_SET + '_ERROR',
          error: 'Invalid dedicationId',
        })
      }

      existing = Dedications.getRow(dedicationId)

      // a message that is already gone, or one being addressed through the
      // wrong song, is not something to guess about
      if (!existing || existing.queueId !== queueId) {
        return acknowledge({
          type: QUEUE_DEDICATION_SET + '_ERROR',
          error: 'Dedication not found',
        })
      }
    }

    if (!canWrite(sock, { queueId, authorId: existing?.userId })) {
      return acknowledge({
        type: QUEUE_DEDICATION_SET + '_ERROR',
        error: 'Cannot write on this song',
      })
    }

    try {
      if (existing) Dedications.update({ dedicationId: existing.dedicationId, text: clean })
      else Dedications.set({ queueId, userId: sock.user.userId, text: clean })
    } catch (err) {
      return acknowledge({
        type: QUEUE_DEDICATION_SET + '_ERROR',
        error: err.message,
      })
    }

    acknowledge({ type: QUEUE_DEDICATION_SET + '_SUCCESS' })

    // the queue push is what carries this to the television
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
  [QUEUE_DEDICATION_REMOVE]: async (sock, { payload }, acknowledge) => {
    const { dedicationId } = payload

    if (!Number.isInteger(dedicationId)) {
      return acknowledge({
        type: QUEUE_DEDICATION_REMOVE + '_ERROR',
        error: 'Invalid dedicationId',
      })
    }

    const existing = Dedications.getRow(dedicationId)

    // already gone: the room is in the state the caller asked for
    if (!existing) {
      return acknowledge({ type: QUEUE_DEDICATION_REMOVE + '_SUCCESS' })
    }

    if (!canWrite(sock, { queueId: existing.queueId, authorId: existing.userId })) {
      return acknowledge({
        type: QUEUE_DEDICATION_REMOVE + '_ERROR',
        error: 'Cannot remove this message',
      })
    }

    Dedications.remove(dedicationId)

    acknowledge({ type: QUEUE_DEDICATION_REMOVE + '_SUCCESS' })

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(sock.user.roomId),
    })
  },
}

export default ACTION_HANDLERS
