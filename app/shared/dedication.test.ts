import { describe, expect, it } from 'vitest'
import { DEDICATION_MAX_LENGTH, areDedicationsShown, dedicationLength, sanitizeDedication } from './dedication.js'

describe('sanitizeDedication', () => {
  it('keeps an ordinary message as written', () => {
    expect(sanitizeDedication('Para Ana, con todo mi cariño')).toBe('Para Ana, con todo mi cariño')
  })

  it('trims and collapses whitespace onto one line', () => {
    expect(sanitizeDedication('  Feliz   cumpleaños  ')).toBe('Feliz cumpleaños')
  })

  it('turns the newlines a textarea produces into spaces', () => {
    expect(sanitizeDedication('Para Ana\ny para Luis')).toBe('Para Ana y para Luis')
  })

  it('drops characters that would reverse the rest of the banner', () => {
    // U+202E flips everything after it; on a TV nobody can undo that
    expect(sanitizeDedication('Para Ana‮ y Luis')).toBe('Para Ana y Luis')
  })

  it('drops zero-width padding but keeps emoji intact', () => {
    expect(sanitizeDedication('Va​mos')).toBe('Vamos')
    // a multi-person emoji is held together by U+200D, which must survive
    expect(sanitizeDedication('\u{1F468}‍\u{1F469}‍\u{1F467}')).toBe('\u{1F468}‍\u{1F469}‍\u{1F467}')
  })

  it('counts an emoji as one character, not two', () => {
    const emoji = '\u{1F389}'.repeat(DEDICATION_MAX_LENGTH)
    expect(dedicationLength(sanitizeDedication(emoji))).toBe(DEDICATION_MAX_LENGTH)
  })

  it('cuts anything longer than the limit', () => {
    expect(sanitizeDedication('a'.repeat(DEDICATION_MAX_LENGTH + 50))).toHaveLength(DEDICATION_MAX_LENGTH)
  })

  it('reads a message that is only whitespace as no message at all', () => {
    expect(sanitizeDedication('   \n\t ')).toBe('')
  })

  it('reads anything that is not a string as no message at all', () => {
    expect(sanitizeDedication(undefined)).toBe('')
    expect(sanitizeDedication(null)).toBe('')
    expect(sanitizeDedication(42)).toBe('')
    expect(sanitizeDedication({ text: 'hi' })).toBe('')
  })

  it('is idempotent: sanitizing what it returned changes nothing', () => {
    const once = sanitizeDedication('  ¡Feliz\ncumpleaños,​ Ana!  ')
    expect(sanitizeDedication(once)).toBe(once)
  })
})

describe('areDedicationsShown', () => {
  it('shows them in a room that has never been asked', () => {
    // every room that existed before the switch did is one where they were
    // already appearing; reading its silence as "off" would take the feature
    // away from it on the next deploy
    expect(areDedicationsShown(undefined)).toBe(true)
    expect(areDedicationsShown(null)).toBe(true)
    expect(areDedicationsShown({})).toBe(true)
    expect(areDedicationsShown({ dedications: {} })).toBe(true)
  })

  it('hides them only when an admin actually turned them off', () => {
    expect(areDedicationsShown({ dedications: { isEnabled: false } })).toBe(false)
    expect(areDedicationsShown({ dedications: { isEnabled: true } })).toBe(true)
  })
})
