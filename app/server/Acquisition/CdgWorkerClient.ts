import getLogger from '../lib/Log.js'

const log = getLogger('CdgWorker')

export class CdgWorkerError extends Error {
  constructor (message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'CdgWorkerError'
  }
}

/**
 * HTTP client for the cdg-worker service (vendored CDGSharp, see
 * cdg-worker/CDGSharp — MIT). The worker only ever sees already-valid .lrc
 * text; UltraStar song.txt -> .lrc conversion happens in
 * server/Acquisition/UltraStarToLrc.ts, not here.
 */
export default class CdgWorkerClient {
  constructor (private readonly baseUrl: string) {}

  async convertLrc (lrcContent: string, outputPath: string, tmpPath: string): Promise<{ outputPath: string }> {
    let res: Response
    try {
      res = await fetch(`${this.baseUrl}/convert-lrc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lrcContent, outputPath, tmpPath }),
      })
    } catch (err) {
      throw new CdgWorkerError(`cdg-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new CdgWorkerError(`convert-lrc failed (${res.status}): ${body.slice(0, 500)}`)
    }

    const json = await res.json()
    log.info('generated CDG at %s', json.outputPath ?? outputPath)
    return { outputPath: json.outputPath ?? outputPath }
  }

  async health (): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`)
      return res.ok
    } catch {
      return false
    }
  }
}
