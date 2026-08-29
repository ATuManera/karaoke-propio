import { beforeAll, describe, expect, it, vi } from 'vitest'
import { PITCH_FEEDBACK_RESPOND, _ERROR } from 'shared/actionTypes'
import type { Reducer } from '@reduxjs/toolkit'
import type { UIState } from './ui'

// the module reads window.innerWidth as it loads, and these tests run without
// a DOM; the same trick src/lib/i18n.test.ts uses, and the reason the import
// below is dynamic — a static one would be hoisted above the stub
let uiReducer: Reducer<UIState>
let initial: UIState

beforeAll(async () => {
  vi.stubGlobal('window', { innerWidth: 400, innerHeight: 800 })
  uiReducer = (await import('./ui')).default as Reducer<UIState>
  initial = uiReducer(undefined, { type: '@@INIT' })
})

describe('the global error dialog', () => {
  it('goes up for a failure the singer has to know about', () => {
    const state = uiReducer(initial, { type: 'queue/ADD', error: { message: 'Song not found' } })

    expect(state.isErrored).toBe(true)
    expect(state.errorMessage).toBe('Song not found')
  })

  // it would cover the editor and make the song dialog look closed
  it('stays down for a category that failed to save', () => {
    const state = uiReducer(initial, {
      type: 'categories/ADD_TO_SONG/rejected',
      error: { message: 'nope' },
    })

    expect(state.isErrored).toBe(false)
  })

  /**
   * Pressing X on "How was that pitch?" answers 'unsure', and the server can
   * legitimately no longer hold the question: it lapsed, it was answered on
   * another device, or the server restarted — the question lives in memory
   * only. The singer asked for the sheet to go away and it is going away.
   * Telling them it was already gone puts a dialog over the sheet they were
   * dismissing, which they then have to dismiss too.
   */
  it('stays down when a dismissed pitch question was already gone', () => {
    const state = uiReducer(initial, {
      type: PITCH_FEEDBACK_RESPOND + _ERROR,
      error: 'That question is no longer waiting for an answer',
    })

    expect(state.isErrored).toBe(false)
  })

  it('takes a bare string error as the message', () => {
    expect(uiReducer(initial, { type: 'rooms/JOIN', error: 'Room is closed' }).errorMessage)
      .toBe('Room is closed')
  })
})
