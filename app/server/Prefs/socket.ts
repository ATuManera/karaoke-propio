import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import Prefs from './Prefs.js'
import { LIBRARY_PUSH, PREFS_PATH_SET_PRIORITY, PREFS_PUSH, PREFS_SET, _ERROR } from '../../shared/actionTypes.js'
const log = getLogger(`server[${process.pid}]`)

const ACTION_HANDLERS = {
  [PREFS_SET]: (sock, { payload }, acknowledge) => {
    if (!sock.user.isAdmin) {
      acknowledge({
        type: PREFS_SET + _ERROR,
        error: 'Unauthorized',
      })
    }

    Prefs.set(payload.key, payload.data)
    log.info('%s (%s) set pref %s = %s', sock.user.name, sock.id, payload.key, payload.data)

    pushPrefs(sock)
  },
  [PREFS_PATH_SET_PRIORITY]: (sock, { payload }, acknowledge) => {
    if (!sock.user.isAdmin) {
      acknowledge({
        type: PREFS_PATH_SET_PRIORITY + _ERROR,
        error: 'Unauthorized',
      })
    }

    Prefs.setPathPriority(payload)
    log.info('%s re-prioritized media folders; pushing library to all', sock.user.name)

    pushPrefs(sock)

    // invalidate cache
    Library.cache.version = null

    sock.server.emit('action', {
      type: LIBRARY_PUSH,
      payload: Library.get(),
    })
  },
}

/**
 * Push prefs to admins.
 *
 * Addressed one socket at a time. The room-building form of this — collecting
 * ids with `.to(id)` and then calling `.emit()` — reads like it narrows the
 * audience but doesn't: those operators are discarded and the emit goes to
 * everyone. That sent every media path and every setting to every connected
 * client, guests included, each time an admin saved anything.
 *
 * It also decided things it had no business deciding. Prefs now carry whether
 * a singer may open the Player (see Prefs/router.ts), and a Player is a screen
 * a room is watching: pushing that flag to the client showing it means any
 * admin saving any unrelated setting could navigate the TV away mid-song.
 * Whoever was let in stays in until they reload.
 */
const pushPrefs = (sock) => {
  const payload = Prefs.get()

  for (const s of sock.server.sockets.sockets.values()) {
    if (s.user && s.user.isAdmin) {
      sock.server.to(s.id).emit('action', {
        type: PREFS_PUSH,
        payload,
      })
    }
  }
}

export default ACTION_HANDLERS
