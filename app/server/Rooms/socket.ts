import Rooms from './Rooms.js'
import {
  ROOM_DEDICATIONS_PUSH,
  ROOM_DEDICATIONS_SET,
  ROOM_PREFS_PUSH_REQUEST,
  ROOM_PREFS_PUSH,
  _ERROR,
} from '../../shared/actionTypes.js'

/**
 * Tell a room its dedication switch changed.
 *
 * Two audiences, two shapes. Everyone gets the boolean, because it decides
 * whether their phone offers to write a dedication at all. Admins also get
 * the room's prefs, so an Edit Room form open on another screen re-seeds
 * itself instead of saving the value it was opened with back over this one.
 */
export function pushDedications (io, roomId: number): void {
  io.to(Rooms.prefix(roomId)).emit('action', {
    type: ROOM_DEDICATIONS_PUSH,
    payload: { isEnabled: Rooms.areDedicationsEnabled(roomId) },
  })
}

const ACTION_HANDLERS = {
  [ROOM_PREFS_PUSH_REQUEST]: async (sock, { payload }, acknowledge) => {
    const { roomId } = payload

    if (!sock.user.isAdmin || !roomId) {
      acknowledge({
        type: ROOM_PREFS_PUSH_REQUEST + _ERROR,
        error: 'Unauthorized',
      })
    }

    const sockets = await sock.server.in(Rooms.prefix(roomId)).fetchSockets()

    for (const s of sockets) {
      if (s?.user.isAdmin) {
        sock.server.to(s.id).emit('action', {
          type: ROOM_PREFS_PUSH,
          payload,
        })
      }
    }
  },
  /**
   * The same switch as the one in the Edit Room form, in the place an admin
   * actually reaches for mid-party. It writes the same room pref, so the two
   * controls cannot disagree — there is one setting, shown twice.
   */
  [ROOM_DEDICATIONS_SET]: async (sock, { payload }, acknowledge) => {
    const { isEnabled } = payload

    if (!sock.user.isAdmin || typeof sock.user.roomId !== 'number') {
      return acknowledge({
        type: ROOM_DEDICATIONS_SET + _ERROR,
        error: 'Unauthorized',
      })
    }

    if (typeof isEnabled !== 'boolean') {
      return acknowledge({
        type: ROOM_DEDICATIONS_SET + _ERROR,
        error: 'Invalid isEnabled',
      })
    }

    try {
      Rooms.setDedicationsEnabled(sock.user.roomId, isEnabled)
    } catch (err) {
      return acknowledge({
        type: ROOM_DEDICATIONS_SET + _ERROR,
        error: err.message,
      })
    }

    acknowledge({ type: ROOM_DEDICATIONS_SET + '_SUCCESS' })

    pushDedications(sock.server, sock.user.roomId)

    const prefs = Rooms.get(sock.user.roomId).entities[sock.user.roomId]?.prefs
    const sockets = await sock.server.in(Rooms.prefix(sock.user.roomId)).fetchSockets()

    for (const s of sockets) {
      if (s?.user.isAdmin) {
        sock.server.to(s.id).emit('action', {
          type: ROOM_PREFS_PUSH,
          payload: { roomId: sock.user.roomId, prefs },
        })
      }
    }
  },
}

export default ACTION_HANDLERS
