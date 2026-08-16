import { describe, expect, it } from 'vitest'
import { formatPitch, isValidPitch, PITCH_MAX, PITCH_MIN } from './pitch.js'

describe('isValidPitch', () => {
  it('accepts integers within [-12, 12]', () => {
    expect(isValidPitch(0)).toBe(true)
    expect(isValidPitch(-12)).toBe(true)
    expect(isValidPitch(12)).toBe(true)
    expect(isValidPitch(-3)).toBe(true)
    expect(isValidPitch(7)).toBe(true)
  })

  it('rejects out-of-range values', () => {
    expect(isValidPitch(PITCH_MIN - 1)).toBe(false)
    expect(isValidPitch(PITCH_MAX + 1)).toBe(false)
    expect(isValidPitch(13)).toBe(false)
    expect(isValidPitch(-13)).toBe(false)
  })

  it('rejects non-integers and non-numbers (never trust the client)', () => {
    expect(isValidPitch(1.5)).toBe(false)
    expect(isValidPitch('3')).toBe(false)
    expect(isValidPitch(null)).toBe(false)
    expect(isValidPitch(undefined)).toBe(false)
    expect(isValidPitch(NaN)).toBe(false)
    expect(isValidPitch({})).toBe(false)
  })
})

describe('formatPitch', () => {
  it('always shows an explicit sign for non-zero values', () => {
    expect(formatPitch(3)).toBe('+3')
    expect(formatPitch(-3)).toBe('-3')
    expect(formatPitch(0)).toBe('0')
    expect(formatPitch(12)).toBe('+12')
    expect(formatPitch(-12)).toBe('-12')
  })
})
