/**
 * The code that identifies a room in an invite link.
 *
 * It replaces the numeric roomId in URLs because that id is sequential: an
 * invite to room 1 tells anyone on the internet that rooms 2, 3, 4 exist and
 * are worth trying. Once the app is reachable from outside, the code is the
 * only thing standing between a stranger and the room, so it is generated
 * randomly and never derived from the id.
 */

// 0/O and 1/I/L are omitted: the code is meant to be readable off a screen and
// dictated out loud, and those are the pairs people get wrong.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

const ROOM_CODE_RE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

/**
 * `randomBytes` is injected so the server can pass a cryptographic source.
 * Math.random() must never be used here — it is predictable, which would
 * undo the whole point of not exposing the sequential id.
 */
export function generateRoomCode (randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(ROOM_CODE_LENGTH)
  let out = ''

  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length]
  }

  return out
}

/** Case-insensitive: people type invite codes in whatever case they like. */
export function normalizeRoomCode (code: string): string {
  return code.trim().toUpperCase()
}

export function isValidRoomCode (code: string): boolean {
  return ROOM_CODE_RE.test(normalizeRoomCode(code))
}
