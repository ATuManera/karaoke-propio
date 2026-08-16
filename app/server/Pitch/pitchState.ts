import type { PitchStatus } from '../../shared/types.js'

export interface PitchStatusResult {
  pitchStatus: PitchStatus
  pitchError?: string
}

export type PitchStatusProvider = (mediaId: number, sourceFingerprint: string | null, pitchSemitones: number) => PitchStatusResult

/**
 * Default provider used before PitchManager is initialized (and in unit tests).
 *
 * Unknown non-zero pitch is reported as `preparing` on purpose: reporting
 * `ready` would let a player start streaming the *original* media for a request
 * that asked to be transposed.
 */
let provider: PitchStatusProvider = (mediaId, sourceFingerprint, pitchSemitones) => ({
  pitchStatus: pitchSemitones === 0 ? 'ready' : 'preparing',
})

export function setPitchStatusProvider (fn: PitchStatusProvider): void {
  provider = fn
}

export function getPitchStatus (mediaId: number, sourceFingerprint: string | null, pitchSemitones: number): PitchStatusResult {
  if (pitchSemitones === 0) return { pitchStatus: 'ready' }
  return provider(mediaId, sourceFingerprint, pitchSemitones)
}
