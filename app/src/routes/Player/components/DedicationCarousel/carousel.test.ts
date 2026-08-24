import { describe, expect, it } from 'vitest'
import { advance, dwellFor, firstStep, CHANGE_DELAY_MS, FIRST_DELAY_MS, GAP_MS, REST_MS } from './carousel'
import { DEDICATION_MAX_LENGTH } from 'shared/dedication'

describe('dwellFor', () => {
  it('gives a short greeting enough time to be noticed at all', () => {
    expect(dwellFor('¡Feliz cumpleaños!')).toBeGreaterThanOrEqual(5000)
  })

  it('gives a longer message more time', () => {
    expect(dwellFor('a'.repeat(100))).toBeGreaterThan(dwellFor('a'.repeat(10)))
  })

  it('never leaves even the longest message up indefinitely', () => {
    expect(dwellFor('a'.repeat(DEDICATION_MAX_LENGTH))).toBeLessThanOrEqual(12_000)
  })

  it('counts an emoji once, like the limit does', () => {
    expect(dwellFor('\u{1F389}'.repeat(20))).toBe(dwellFor('a'.repeat(20)))
  })
})

describe('the cycle', () => {
  it('starts by waiting for the singer\'s name to leave the screen', () => {
    expect(firstStep()).toEqual({ index: 0, isShown: false, wait: FIRST_DELAY_MS })
  })

  it('shows a message written mid-song almost at once instead', () => {
    expect(firstStep(CHANGE_DELAY_MS).wait).toBe(CHANGE_DELAY_MS)
  })

  it('moves to the next message of the round after a short gap', () => {
    expect(advance({ index: 0, isShown: true, wait: 0 }, 3)).toEqual({ index: 1, isShown: false, wait: GAP_MS })
  })

  it('rests once the round is over rather than looping straight round', () => {
    expect(advance({ index: 2, isShown: true, wait: 0 }, 3)).toEqual({ index: 0, isShown: false, wait: REST_MS })
  })

  it('rests after a lone message too: one showing every so often, not a caption', () => {
    expect(advance({ index: 0, isShown: true, wait: 0 }, 1)).toEqual({ index: 0, isShown: false, wait: REST_MS })
  })

  it('comes back to a sane step when everything was taken down mid-round', () => {
    expect(advance({ index: 4, isShown: true, wait: 0 }, 0)).toEqual(firstStep())
  })
})
