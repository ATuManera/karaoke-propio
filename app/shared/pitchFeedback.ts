/**
 * Karaoke Propio — "how was that pitch?", asked once a performance ends.
 *
 * The singer answers in plain language ("a little high"). Turning that into a
 * number happens here, on the server, from the pitch actually performed: the
 * point of the feature is that nobody has to understand semitones to end up
 * with the right one (see docs/PERSONAL_PITCH.md §3.3).
 */
import { PITCH_MAX, PITCH_MIN } from './pitch.js'

/**
 * How long a question stays worth answering. Long enough to survive a phone
 * locking itself and a trip to the kitchen; short enough that "how was that
 * pitch?" still refers to something the singer remembers.
 */
export const PITCH_FEEDBACK_TTL_MS = 15 * 60 * 1000

export const PITCH_FEEDBACK_CHOICES = [
  'much_too_high',
  'slightly_high',
  'good',
  'slightly_low',
  'much_too_low',
  'unsure',
] as const

export type PitchFeedbackChoice = typeof PITCH_FEEDBACK_CHOICES[number]

/**
 * Semitones to move the track by, relative to the pitch just sung. The
 * direction is the opposite of the complaint: a song that came out too high is
 * fixed by lowering the track, not raising it.
 *
 * `null` means "don't write anything" — the one answer that declines to answer.
 */
const DELTAS: Record<PitchFeedbackChoice, number | null> = {
  much_too_high: -2,
  slightly_high: -1,
  good: 0,
  slightly_low: 1,
  much_too_low: 2,
  unsure: null,
}

/** Server-side validation helper: the choice arrives over a socket. */
export function isPitchFeedbackChoice (value: unknown): value is PitchFeedbackChoice {
  return typeof value === 'string' && (PITCH_FEEDBACK_CHOICES as readonly string[]).includes(value)
}

export interface PitchFeedbackResolution {
  /** the pitch to save as this singer's own, or null to write nothing */
  pitchSemitones: number | null
  /** set when they asked to go further than transposition can go */
  limit: 'min' | 'max' | null
}

/**
 * What an answer means, given the pitch that was actually performed.
 *
 * Always measured from that pitch and never from a previously saved one: if
 * someone saved -3 but decided to try this one at -1, "a little high" is about
 * the -1 they just heard themselves sing (see §3.9).
 */
export function resolvePitchFeedback (performedPitch: number, choice: PitchFeedbackChoice): PitchFeedbackResolution {
  const delta = DELTAS[choice]

  if (delta === null) return { pitchSemitones: null, limit: null }

  const rawTarget = performedPitch + delta
  const target = Math.min(PITCH_MAX, Math.max(PITCH_MIN, rawTarget))
  const limit = target === rawTarget ? null : (delta < 0 ? 'min' : 'max')

  // A nudge that cannot move is not a confirmation: saving the same number
  // would record "this pitch suits you" for the very pitch they just said does
  // not. The answer still resolves — with a hint to try another version, which
  // is the real fix when a recording sits outside someone's range entirely.
  if (delta !== 0 && target === performedPitch) {
    return { pitchSemitones: null, limit }
  }

  // 'good' does save, including a plain 0: a confirmed 0 is a pitch this
  // singer sings the song in, not the absence of a preference (see §3.3.1).
  return { pitchSemitones: target, limit }
}

/** What the singer's own devices are told to ask about. */
export interface PitchFeedbackPrompt {
  feedbackId: string
  queueId: number
  songId: number
  /** the pitch the performance actually played at */
  pitchSemitones: number
  expiresAt: number
}

/** Sent to every device of the singer once the question is settled. */
export interface PitchFeedbackResolved extends PitchFeedbackResolution {
  feedbackId: string
}
