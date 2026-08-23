import { createSelector } from '@reduxjs/toolkit'
import { RootState } from 'store/store'

const getIsAdmin = (state: RootState) => state.user.isAdmin
const getIsGuest = (state: RootState) => state.user.isGuest
const getIsPlayerLaunchEnabled = (state: RootState) => state.prefs.isPlayerLaunchEnabled === true

/**
 * Who may open the Player.
 *
 * An admin always may. A standard user may once an admin has turned on
 * `isPlayerLaunchEnabled`: the screen the room watches is usually nowhere near
 * whoever happens to own the library, and needing that one account signed in
 * on the TV is the whole reason parties start late. Guests are left out — they
 * are strangers holding a room code, not people the host picked.
 *
 * This decides what is offered, not what is possible. Every command the Player
 * sends is already accepted from any member of the room, and media is
 * authorized by queueId rather than by role (see server/Media/router.ts), so
 * the old admin-only route hid a button and nothing else.
 */
const getCanLaunchPlayer = createSelector(
  [getIsAdmin, getIsGuest, getIsPlayerLaunchEnabled],
  (isAdmin, isGuest, isEnabled) => isAdmin || (isEnabled && !isGuest),
)

export default getCanLaunchPlayer
