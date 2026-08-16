import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'

import {
  PLAYER_CMD_NEXT,
  PLAYER_CMD_OPTIONS,
  PLAYER_CMD_PAUSE,
  PLAYER_CMD_PLAY,
  PLAYER_CMD_REPLAY,
  PLAYER_CMD_VOLUME,
  PLAYER_REQ_NEXT,
  PLAYER_REQ_OPTIONS,
  PLAYER_REQ_PAUSE,
  PLAYER_REQ_PLAY,
  PLAYER_REQ_REPLAY,
  PLAYER_REQ_SEEK,
  PLAYER_CMD_SEEK,
  PLAYER_REQ_VOLUME,
  PLAYER_EMIT_STATUS,
  PLAYER_EMIT_LEAVE,
  PLAYER_STATUS,
  PLAYER_LEAVE,
} from '../../shared/actionTypes.js'

// ------------------------------------
// Action Handlers
// ------------------------------------
const ACTION_HANDLERS = {
  [PLAYER_REQ_OPTIONS]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_OPTIONS,
      payload,
    })
  },
  [PLAYER_REQ_NEXT]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_NEXT,
    })
  },
  /**
   * Scrub within the song that is playing.
   *
   * Unlike the other player commands this checks who is asking: skipping ahead
   * changes what everyone in the room hears mid-performance, so it is limited
   * to an admin or the person whose turn it is. Everything is verified against
   * the queue row, never taken from the client.
   */
  [PLAYER_REQ_SEEK]: (sock, { payload }, acknowledge) => {
    const { queueId, position } = payload ?? {}

    if (!Number.isInteger(queueId) || typeof position !== 'number' || !Number.isFinite(position) || position < 0) {
      return acknowledge?.({ type: PLAYER_REQ_SEEK + '_ERROR', error: 'Invalid seek request' })
    }

    const row = Queue.getRow(queueId)

    if (!row || row.roomId !== sock.user.roomId) {
      return acknowledge?.({ type: PLAYER_REQ_SEEK + '_ERROR', error: 'Song is not in your room' })
    }

    if (!sock.user.isAdmin && row.userId !== sock.user.userId) {
      return acknowledge?.({ type: PLAYER_REQ_SEEK + '_ERROR', error: 'Only the singer or an admin can seek' })
    }

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_SEEK,
      payload: { queueId, position },
    })
  },
  [PLAYER_REQ_PAUSE]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PAUSE,
    })
  },
  [PLAYER_REQ_PLAY]: (sock) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_PLAY,
    })
  },
  [PLAYER_REQ_REPLAY]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_REPLAY,
      payload,
    })
  },
  [PLAYER_REQ_VOLUME]: (sock, { payload }) => {
    // @todo: emit to players only
    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_CMD_VOLUME,
      payload,
    })
  },
  [PLAYER_EMIT_STATUS]: (sock, { payload }) => {
    // so we can tell the room when players leave and
    // relay last known player status on client join
    sock._lastPlayerStatus = payload

    sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
      type: PLAYER_STATUS,
      payload,
    })
  },
  [PLAYER_EMIT_LEAVE]: (sock) => {
    sock._lastPlayerStatus = null

    // any players left in room?
    if (!Rooms.isPlayerPresent(sock.server, sock.user.roomId)) {
      sock.server.to(Rooms.prefix(sock.user.roomId)).emit('action', {
        type: PLAYER_LEAVE,
        payload: { socketId: sock.id },
      })
    }
  },
}

export default ACTION_HANDLERS
