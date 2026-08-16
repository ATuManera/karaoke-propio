/**
 * Karaoke Propio — pitch (transposition) constants shared by client and server.
 *
 * Pitch belongs to an individual queue request, not to a room: two singers may
 * request the same song in different keys and each gets its own queueId.
 */
export const PITCH_MIN = -12
export const PITCH_MAX = 12
export const PITCH_STEP = 1
export const PITCH_DEFAULT = 0

/**
 * Server-side validation helper. The client is never trusted.
 */
export function isValidPitch (value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= PITCH_MIN && (value as number) <= PITCH_MAX
}

/**
 * Human-readable semitone offset, always with an explicit sign for non-zero
 * values (e.g. "-3", "0", "+4").
 */
export function formatPitch (semitones: number): string {
  return semitones > 0 ? `+${semitones}` : String(semitones)
}
