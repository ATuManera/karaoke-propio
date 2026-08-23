import { describe, expect, it } from 'vitest'
import getCanLaunchPlayer from './getCanLaunchPlayer'
import type { RootState } from 'store/store'

const state = (
  user: { isAdmin?: boolean, isGuest?: boolean } = {},
  prefs: { isPlayerLaunchEnabled?: boolean } = {},
) => ({
  user: { isAdmin: false, isGuest: false, ...user },
  prefs,
} as unknown as RootState)

describe('getCanLaunchPlayer', () => {
  it('lets an admin open the player whatever the pref says', () => {
    expect(getCanLaunchPlayer(state({ isAdmin: true }))).toBe(true)
    expect(getCanLaunchPlayer(state({ isAdmin: true }, { isPlayerLaunchEnabled: false }))).toBe(true)
  })

  it('keeps a standard user out until an admin opens it up', () => {
    expect(getCanLaunchPlayer(state())).toBe(false)
    expect(getCanLaunchPlayer(state({}, { isPlayerLaunchEnabled: true }))).toBe(true)
  })

  it('never counts a guest as a standard user', () => {
    expect(getCanLaunchPlayer(state({ isGuest: true }, { isPlayerLaunchEnabled: true }))).toBe(false)
  })

  it('says no while prefs are still unknown', () => {
    // the route waits on state.prefs.isFetched rather than on this answer;
    // an unanswered server must never read as permission
    expect(getCanLaunchPlayer(state({}, {}))).toBe(false)
  })
})
