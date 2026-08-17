import { describe, expect, it } from 'vitest'
import { isPitchFeedbackChoice, resolvePitchFeedback } from './pitchFeedback.js'
import { PITCH_MAX, PITCH_MIN } from './pitch.js'

describe('resolvePitchFeedback', () => {
  it('lowers the track when the song came out high', () => {
    expect(resolvePitchFeedback(-3, 'slightly_high')).toEqual({ pitchSemitones: -4, limit: null })
    expect(resolvePitchFeedback(-3, 'much_too_high')).toEqual({ pitchSemitones: -5, limit: null })
  })

  it('raises the track when the song came out low', () => {
    expect(resolvePitchFeedback(-3, 'slightly_low')).toEqual({ pitchSemitones: -2, limit: null })
    expect(resolvePitchFeedback(-3, 'much_too_low')).toEqual({ pitchSemitones: -1, limit: null })
  })

  it('confirms the pitch that was sung', () => {
    expect(resolvePitchFeedback(-3, 'good')).toEqual({ pitchSemitones: -3, limit: null })
  })

  // 0 is a real answer here, unlike at queue time where it is merely the
  // default nobody chose (see Queue/socket.ts)
  it('saves a confirmed 0 rather than treating it as "no preference"', () => {
    expect(resolvePitchFeedback(0, 'good')).toEqual({ pitchSemitones: 0, limit: null })
  })

  it('saves the furthest reachable pitch when the nudge overshoots the limit', () => {
    expect(resolvePitchFeedback(PITCH_MIN + 1, 'much_too_high')).toEqual({ pitchSemitones: PITCH_MIN, limit: 'min' })
    expect(resolvePitchFeedback(PITCH_MAX - 1, 'much_too_low')).toEqual({ pitchSemitones: PITCH_MAX, limit: 'max' })
  })

  // the singer is out of room, and recording the pitch they just complained
  // about as the one that suits them would be worse than recording nothing
  it('writes nothing when already at the limit', () => {
    expect(resolvePitchFeedback(PITCH_MIN, 'slightly_high')).toEqual({ pitchSemitones: null, limit: 'min' })
    expect(resolvePitchFeedback(PITCH_MIN, 'much_too_high')).toEqual({ pitchSemitones: null, limit: 'min' })
    expect(resolvePitchFeedback(PITCH_MAX, 'slightly_low')).toEqual({ pitchSemitones: null, limit: 'max' })
    expect(resolvePitchFeedback(PITCH_MAX, 'much_too_low')).toEqual({ pitchSemitones: null, limit: 'max' })
  })

  // still a confirmation: the extremes are perfectly good pitches to sing in
  it('confirms a pitch that happens to be at a limit', () => {
    expect(resolvePitchFeedback(PITCH_MIN, 'good')).toEqual({ pitchSemitones: PITCH_MIN, limit: null })
    expect(resolvePitchFeedback(PITCH_MAX, 'good')).toEqual({ pitchSemitones: PITCH_MAX, limit: null })
  })

  it('writes nothing for "not sure"', () => {
    expect(resolvePitchFeedback(-3, 'unsure')).toEqual({ pitchSemitones: null, limit: null })
    expect(resolvePitchFeedback(0, 'unsure')).toEqual({ pitchSemitones: null, limit: null })
  })
})

describe('isPitchFeedbackChoice', () => {
  it('accepts every offered answer', () => {
    expect(isPitchFeedbackChoice('much_too_high')).toBe(true)
    expect(isPitchFeedbackChoice('slightly_high')).toBe(true)
    expect(isPitchFeedbackChoice('good')).toBe(true)
    expect(isPitchFeedbackChoice('slightly_low')).toBe(true)
    expect(isPitchFeedbackChoice('much_too_low')).toBe(true)
    expect(isPitchFeedbackChoice('unsure')).toBe(true)
  })

  it('rejects anything else (never trust the client)', () => {
    expect(isPitchFeedbackChoice('perfect')).toBe(false)
    expect(isPitchFeedbackChoice('')).toBe(false)
    expect(isPitchFeedbackChoice(-1)).toBe(false)
    expect(isPitchFeedbackChoice(null)).toBe(false)
    expect(isPitchFeedbackChoice(undefined)).toBe(false)
    expect(isPitchFeedbackChoice({})).toBe(false)
  })
})
