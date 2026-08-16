import getLogger from '../lib/Log.js'

const log = getLogger('PitchWorker')

export interface TranscodeRequest {
  /** absolute path, readable inside the worker container (shared library volume) */
  inputPath: string
  /** absolute path the worker must produce (shared cache volume); worker writes atomically */
  outputPath: string
  /** absolute tmp path (same volume as outputPath) the worker writes to before renaming */
  tmpPath: string
  mediaKind: 'mp4' | 'audio'
  pitchSemitones: number
}

export interface TranscodeResult {
  outputPath: string
  durationMs: number
}

export class PitchWorkerError extends Error {
  constructor (message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'PitchWorkerError'
  }
}

/**
 * Thin HTTP client for the pitch-worker service. The worker is stateless and
 * does its own atomic tmp-then-rename publish; this client just waits for the
 * result. Retries are NOT attempted here — PitchManager owns job bookkeeping
 * and decides what "error" means for waiters.
 */
export default class PitchWorkerClient {
  constructor (private readonly baseUrl: string) {}

  async transcode (req: TranscodeRequest, signal?: AbortSignal): Promise<TranscodeResult> {
    const startedAt = Date.now()

    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/transcode`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      })
    } catch (err) {
      throw new PitchWorkerError(`pitch-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new PitchWorkerError(`pitch-worker returned ${res.status}: ${body.slice(0, 500)}`)
    }

    const json = await res.json().catch(() => ({}))
    const durationMs = Date.now() - startedAt

    log.info('transcoded %s (%s semitones) in %sms', req.inputPath, req.pitchSemitones, durationMs)

    return { outputPath: json.outputPath ?? req.outputPath, durationMs }
  }

  async health (): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`)
      return res.ok
    } catch {
      return false
    }
  }

  /**
   * Estimated musical key of a recording, straight from the audio.
   *
   * For songs with no note data this is all that can be known — a karaoke
   * track has no lead vocal to extract a melody from, but the accompaniment
   * still establishes a key. Cheap enough (~0.3s) to run on demand rather than
   * store.
   */
  async detectKey (inputPath: string): Promise<{ tonic: string, tonicEs: string, mode: string, confidence: number } | null> {
    const res = await fetch(new URL('/detect-key', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ inputPath }),
    })

    if (!res.ok) return null

    const json = await res.json() as { key?: { tonic: string, tonicEs: string, mode: string, confidence: number } | null }
    return json.key ?? null
  }
}
