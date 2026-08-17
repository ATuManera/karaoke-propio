import Media from '../Media/Media.js'
import PitchManager from '../Pitch/PitchManager.js'
import PitchPrefs from '../Pitch/PitchPrefs.js'
import { pushPitchPrefs } from '../Pitch/socket.js'
import Queue from './Queue.js'
import Rooms from '../Rooms/Rooms.js'
import { isValidPitch, PITCH_DEFAULT } from '../../shared/pitch.js'
import { QUEUE_ADD, QUEUE_MOVE, QUEUE_REMOVE, QUEUE_PUSH } from '../../shared/actionTypes.js'

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [QUEUE_ADD]: async (sock, { payload }, acknowledge) => {
    const { songId, pitchSemitones = PITCH_DEFAULT, mediaId = null, rememberPitch = true } = payload

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
}

export default ACTION_HANDLERS
