import { describe, expect, it } from 'vitest'
import { InviteFailureLimiter, isInviteFor } from './inviteGuard.js'

const CODE = 'ABC234'
const resolve = (code: string) => code === CODE ? 7 : null

describe('isInviteFor', () => {
  it('accepts the code that opens the room', () => {
    expect(isInviteFor(7, CODE, resolve)).toBe(true)
  })

  it('accepts a code typed in whatever case it was read in', () => {
    expect(isInviteFor(7, 'abc234', resolve)).toBe(true)
  })

  it('refuses a code that opens a different room', () => {
    expect(isInviteFor(8, CODE, resolve)).toBe(false)
  })

  it('refuses a code that opens nothing', () => {
    expect(isInviteFor(7, 'ZZZZZZ', resolve)).toBe(false)
  })

  it('refuses anything that is not a code, without asking the database', () => {
    const never = () => {
      throw new Error('should not be asked')
    }

    expect(isInviteFor(7, '', never)).toBe(false)
    expect(isInviteFor(7, undefined, never)).toBe(false)
    expect(isInviteFor(7, 'ABC2340', never)).toBe(false)
    expect(isInviteFor(7, 'ABC23O', never)).toBe(false) // O is not in the alphabet
  })

  it('refuses when there is no room to check against', () => {
    expect(isInviteFor(undefined, CODE, resolve)).toBe(false)
    expect(isInviteFor('7', CODE, resolve)).toBe(false)
    expect(isInviteFor(NaN, CODE, resolve)).toBe(false)
  })
})

describe('InviteFailureLimiter', () => {
  it('blocks only once the allowance is spent', () => {
    const limiter = new InviteFailureLimiter(3, 60_000)

    expect(limiter.isBlocked('ip', 0)).toBe(false)

    limiter.recordFailure('ip', 0)
    limiter.recordFailure('ip', 0)
    expect(limiter.isBlocked('ip', 0)).toBe(false)

    limiter.recordFailure('ip', 0)
    expect(limiter.isBlocked('ip', 0)).toBe(true)
  })

  it('forgets a spent allowance once the window passes', () => {
    const limiter = new InviteFailureLimiter(1, 60_000)

    limiter.recordFailure('ip', 0)
    expect(limiter.isBlocked('ip', 59_999)).toBe(true)
    expect(limiter.isBlocked('ip', 60_001)).toBe(false)
  })

  it('counts each caller separately', () => {
    const limiter = new InviteFailureLimiter(1, 60_000)

    limiter.recordFailure('ip', 0)
    expect(limiter.isBlocked('other', 0)).toBe(false)
  })

  it('lets a whole room in on a valid code, since nothing is recorded', () => {
    const limiter = new InviteFailureLimiter(1, 60_000)

    for (let i = 0; i < 50; i++) {
      expect(limiter.isBlocked('proxy', 0)).toBe(false)
    }
  })
})
