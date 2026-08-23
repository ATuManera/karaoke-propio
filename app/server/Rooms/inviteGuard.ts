import { isValidRoomCode, normalizeRoomCode } from '../../shared/roomCode.js'

/**
 * A room is joined by invitation.
 *
 * The invite code is the whole of it: a room's id is sequential and its name
 * is readable without signing in, so neither says anything about having been
 * asked in. Everyone in a room shares its queue and its photo album, which is
 * why an open room whose prefs allow new guests must not be joinable by
 * whoever happens to find the address.
 *
 * `resolve` is injected so this stays a question about the code rather than a
 * database call, and can be asked in a test.
 */
export function isInviteFor (
  roomId: unknown,
  code: unknown,
  resolve: (code: string) => number | null,
): boolean {
  if (typeof roomId !== 'number' || !Number.isInteger(roomId)) return false
  if (typeof code !== 'string' || !isValidRoomCode(code)) return false

  // normalized here rather than left to the resolver: a code read off a screen
  // arrives in whatever case it was typed
  return resolve(normalizeRoomCode(code)) === roomId
}

/**
 * Rate limiter for wrong invite codes.
 *
 * Six characters give ~1.07e9 possibilities, which only stays out of reach if
 * guessing is slow. Only failures are counted: a party is a burst of people
 * scanning the same QR from what may be a single address once a proxy is in
 * front, and counting their successes would lock out the back of the queue for
 * doing exactly what they were invited to do.
 */
export class InviteFailureLimiter {
  private readonly attempts = new Map<string, { count: number, resetAt: number }>()

  constructor (
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  isBlocked (key: string, now: number = Date.now()): boolean {
    const entry = this.attempts.get(key)

    if (!entry || entry.resetAt < now) return false

    return entry.count >= this.max
  }

  recordFailure (key: string, now: number = Date.now()): void {
    const entry = this.attempts.get(key)

    if (!entry || entry.resetAt < now) {
      this.sweep(now)
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs })
      return
    }

    entry.count++
  }

  /** Nothing else ever removes an entry, and the keys come from outside. */
  private sweep (now: number): void {
    if (this.attempts.size < 1000) return

    for (const [key, entry] of this.attempts) {
      if (entry.resetAt < now) this.attempts.delete(key)
    }
  }
}
