import crypto from 'node:crypto'
import getLogger from '../lib/Log.js'
import PitchPrefs from './PitchPrefs.js'
import {
  isPitchFeedbackChoice,
  resolvePitchFeedback,
  PITCH_FEEDBACK_TTL_MS,
  type PitchFeedbackChoice,
  type PitchFeedbackPrompt,
  type PitchFeedbackResolution,
} from '../../shared/pitchFeedback.js'

const log = getLogger('PitchFeedback')

/**
 * A browser can fire `ended` twice for the same element. Within this window a
 * repeat is treated as the same performance rather than a new one; a genuine
 * replay later in the night is a new performance and does get asked about.
 */
const DUPLICATE_WINDOW_MS = 10 * 1000

export interface PendingPitchFeedback {
  feedbackId: string
  queueId: number
  roomId: number
  userId: number
  songId: number
  /** the recording that played, so the saved pitch keeps meaning what it meant */
  mediaId: number
  performedPitch: number
  createdAt: number
  expiresAt: number
}

export interface PitchFeedbackResponse {
  /** why the answer was refused; absent when it was recorded */
  error?: string
  /** the question that was answered, once it was */
  pending?: PendingPitchFeedback
  resolution?: PitchFeedbackResolution
}

/**
 * The question waiting to be answered, per singer. Deliberately in memory and
 * nowhere else.
 *
 * What is worth keeping is the answer, which lands in `songPitchPrefs` like any
 * other saved pitch. The question itself is a moment: a restart loses it, and
 * losing it costs nothing — the singer simply isn't asked, exactly as if the
 * song had been skipped. That is the whole reason this phase needs no migration.
 */
class PitchFeedback {
  /** at most one per userId, by design (see docs/PERSONAL_PITCH.md §3.2.4) */
  static #pending = new Map<number, PendingPitchFeedback>()
  /** last time each queueId was reported as ended, for duplicate suppression */
  static #lastEnded = new Map<number, number>()

  /**
   * Ask a singer about a performance that just finished.
   *
   * Returns the new question, plus the id of the one it displaced so the
   * singer's devices can close it. Returns null when this same performance is
   * already being asked about, which is not a failure — just nothing to do.
   */
  static create ({ queueId, roomId, userId, songId, mediaId, pitchSemitones }: {
    queueId: number
    roomId: number
    userId: number
    songId: number
    mediaId: number
    pitchSemitones: number
  }): { pending: PendingPitchFeedback, replacedFeedbackId: string | null } | null {
    const now = Date.now()
    this.#sweep(now)

    const lastEnded = this.#lastEnded.get(queueId)
    if (lastEnded !== undefined && now - lastEnded < DUPLICATE_WINDOW_MS) return null

    const existing = this.#pending.get(userId)
    if (existing?.queueId === queueId) return null

    this.#lastEnded.set(queueId, now)

    const pending: PendingPitchFeedback = {
      feedbackId: crypto.randomUUID(),
      queueId,
      roomId,
      userId,
      songId,
      mediaId,
      performedPitch: pitchSemitones,
      createdAt: now,
      expiresAt: now + PITCH_FEEDBACK_TTL_MS,
    }

    this.#pending.set(userId, pending)

    log.verbose('created feedbackId=%s queueId=%s userId=%s pitch=%s',
      pending.feedbackId, queueId, userId, pitchSemitones)

    // One question at a time: during a party a singer can be up again before
    // getting round to the last one, and a stack of near-identical prompts is
    // the fastest way to make people dismiss all of them unread. The newest
    // performance is also the one they remember best.
    if (existing) {
      log.verbose('replaced feedbackId=%s with feedbackId=%s userId=%s',
        existing.feedbackId, pending.feedbackId, userId)
    }

    return { pending, replacedFeedbackId: existing?.feedbackId ?? null }
  }

  /** The question this singer still owes an answer to, if any is still live. */
  static getPending (userId: number): PendingPitchFeedback | null {
    this.#sweep(Date.now())
    return this.#pending.get(userId) ?? null
  }

  /** The part of a question its owner's devices are allowed to see. */
  static toPrompt ({ feedbackId, queueId, songId, performedPitch, expiresAt }: PendingPitchFeedback): PitchFeedbackPrompt {
    return { feedbackId, queueId, songId, pitchSemitones: performedPitch, expiresAt }
  }

  /**
   * Record an answer.
   *
   * The client sends a feedbackId and a plain-language choice, and nothing
   * else: song, version and the pitch that was actually sung all come from the
   * question this server created. Nobody can shift another singer's saved
   * pitch, or their own for some other song, by editing a payload — and the
   * lookup is keyed by userId, so a stolen feedbackId still answers nothing.
   */
  static respond ({ userId, feedbackId, choice }: {
    userId: number
    feedbackId: unknown
    choice: unknown
  }): PitchFeedbackResponse {
    if (typeof feedbackId !== 'string' || !feedbackId) {
      return { error: 'Invalid feedbackId' }
    }

    if (!isPitchFeedbackChoice(choice)) {
      return { error: 'Invalid choice' }
    }

    const pending = this.getPending(userId)

    if (!pending || pending.feedbackId !== feedbackId) {
      return { error: 'That question is no longer waiting for an answer' }
    }

    const resolution = resolvePitchFeedback(pending.performedPitch, choice)
    this.#pending.delete(userId)

    if (resolution.pitchSemitones === null) {
      log.verbose('dismissed feedbackId=%s choice=%s limit=%s', feedbackId, choice, resolution.limit)
      return { pending, resolution }
    }

    // 'assistant': answered on purpose, in response to being asked, so it
    // outranks anything merely inferred from a queue add and can replace an
    // earlier decision the same way a manual edit does (see PitchPrefs.set)
    PitchPrefs.set({
      userId,
      songId: pending.songId,
      pitchSemitones: resolution.pitchSemitones,
      source: 'assistant',
      mediaId: pending.mediaId,
    })

    log.verbose('responded feedbackId=%s choice=%s target=%s', feedbackId, choice, resolution.pitchSemitones)

    return { pending, resolution }
  }

  /** Drop everything expired, and duplicate-suppression entries past their use. */
  static #sweep (now: number): void {
    for (const [userId, pending] of this.#pending) {
      if (pending.expiresAt <= now) {
        this.#pending.delete(userId)
        log.verbose('expired feedbackId=%s userId=%s', pending.feedbackId, userId)
      }
    }

    for (const [queueId, endedAt] of this.#lastEnded) {
      if (now - endedAt >= DUPLICATE_WINDOW_MS) this.#lastEnded.delete(queueId)
    }
  }

  /** Tests only: this state is per-process and otherwise never reset. */
  static _reset (): void {
    this.#pending.clear()
    this.#lastEnded.clear()
  }
}

export default PitchFeedback
export type { PitchFeedbackChoice }
