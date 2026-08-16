import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './roomCode.js'

const randomBytes = (n: number) => new Uint8Array(crypto.randomBytes(n))

describe('generateRoomCode', () => {
  it('produces codes of the agreed shape', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode(randomBytes)
      expect(code).toHaveLength(ROOM_CODE_LENGTH)
      expect(isValidRoomCode(code)).toBe(true)
    }
  })

  it('never emits characters people confuse when reading them aloud', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateRoomCode(randomBytes)).not.toMatch(/[01OIL]/)
    }
  })

  it('does not repeat itself in any practical run', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateRoomCode(randomBytes))
    expect(seen.size).toBe(500)
  })
})

describe('isValidRoomCode', () => {
  it('accepts a code however the user typed it', () => {
    expect(isValidRoomCode('k7m2xp')).toBe(true)
    expect(isValidRoomCode(' K7M2XP ')).toBe(true)
  })

  it('rejects wrong lengths and excluded characters', () => {
    expect(isValidRoomCode('K7M2X')).toBe(false)
    expect(isValidRoomCode('K7M2XPQ')).toBe(false)
    expect(isValidRoomCode('K7M2X0')).toBe(false) // zero is not in the alphabet
    expect(isValidRoomCode('')).toBe(false)
  })

  it('rejects the old numeric room ids outright', () => {
    // the whole point: an invite link can no longer be guessed by counting
    expect(isValidRoomCode('1')).toBe(false)
    expect(isValidRoomCode('000001')).toBe(false)
  })
})

describe('normalizeRoomCode', () => {
  it('upper-cases so lookups are case-insensitive', () => {
    expect(normalizeRoomCode(' k7m2xp ')).toBe('K7M2XP')
  })
})

describe('alphabet', () => {
  it('has no duplicate characters', () => {
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length)
  })
})
