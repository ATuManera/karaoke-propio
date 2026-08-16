import getLogger from '../lib/Log.js'

const log = getLogger('AcquisitionWorker')

export interface YouTubeSearchResult {
  id: string
  title: string
  durationSeconds: number | null
  uploader: string | null
  thumbnail: string | null
  viewCount: number | null
  isVerified: boolean
}

export class AcquisitionWorkerError extends Error {
  constructor (message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'AcquisitionWorkerError'
  }
}

/**
 * HTTP client for the acquisition-worker service (yt-dlp + ffmpeg, runs in
 * its own Debian container so the Alpine karaoke-eternal image never needs
 * Python installed). Search results only tell the user what's available;
 * nothing is downloaded until the user picks one.
 */
export default class AcquisitionWorkerClient {
  constructor (private readonly baseUrl: string) {}

  async search (query: string, limit = 10, karaokeOnly = true): Promise<YouTubeSearchResult[]> {
    let res: Response
    try {
      const url = new URL('/search', this.baseUrl)
      url.searchParams.set('q', query)
      url.searchParams.set('limit', String(limit))
      url.searchParams.set('karaokeOnly', String(karaokeOnly))
      res = await fetch(url)
    } catch (err) {
      throw new AcquisitionWorkerError(`acquisition-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AcquisitionWorkerError(`search failed (${res.status}): ${body.slice(0, 500)}`)
    }

    const json: { results?: YouTubeSearchResult[] } = await res.json()
    return json.results ?? []
  }

  /**
   * A direct progressive media URL for `url`, playable in a plain <video>
   * element. Deliberately NOT the YouTube IFrame Player API: that respects
   * the uploader's "disable embedding on other websites" flag, which many
   * karaoke-relevant uploads (Sing King etc.) set — a raw stream URL doesn't
   * go through YouTube's player at all, so it plays regardless.
   */
  async getPreviewStreamUrl (url: string): Promise<{ streamUrl: string }> {
    let res: Response
    try {
      const reqUrl = new URL('/preview-stream-url', this.baseUrl)
      reqUrl.searchParams.set('url', url)
      res = await fetch(reqUrl)
    } catch (err) {
      throw new AcquisitionWorkerError(`acquisition-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AcquisitionWorkerError(`preview stream URL failed (${res.status}): ${body.slice(0, 500)}`)
    }

    const json: { streamUrl?: string } = await res.json()
    if (!json.streamUrl) throw new AcquisitionWorkerError('acquisition-worker returned no streamUrl')
    return { streamUrl: json.streamUrl }
  }

  async download (url: string, outputPath: string, tmpPath: string): Promise<{ outputPath: string }> {
    let res: Response
    try {
      res = await fetch(new URL('/download', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, outputPath, tmpPath }),
      })
    } catch (err) {
      throw new AcquisitionWorkerError(`acquisition-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AcquisitionWorkerError(`download failed (${res.status}): ${body.slice(0, 500)}`)
    }

    const json = await res.json()
    log.info('downloaded %s -> %s', url, json.outputPath)
    return { outputPath: json.outputPath ?? outputPath }
  }

  /** Used by the UltraStar/USDB acquisition path — CDGSharp only needs audio. */
  async extractAudio (inputPath: string, outputPath: string, tmpPath: string): Promise<{ outputPath: string }> {
    let res: Response
    try {
      res = await fetch(new URL('/extract-audio', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inputPath, outputPath, tmpPath }),
      })
    } catch (err) {
      throw new AcquisitionWorkerError(`acquisition-worker unreachable: ${(err as Error).message}`, err)
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new AcquisitionWorkerError(`extract-audio failed (${res.status}): ${body.slice(0, 500)}`)
    }

    const json = await res.json()
    return { outputPath: json.outputPath ?? outputPath }
  }

  /** Current view count of a YouTube video, or null if it can't be read. */
  async getViewCount (url: string): Promise<number | null> {
    try {
      const reqUrl = new URL('/view-count', this.baseUrl)
      reqUrl.searchParams.set('url', url)
      const res = await fetch(reqUrl)
      if (!res.ok) return null

      const json: { viewCount?: number | null } = await res.json()
      return typeof json.viewCount === 'number' ? json.viewCount : null
    } catch {
      return null
    }
  }

  async health (): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', this.baseUrl))
      return res.ok
    } catch {
      return false
    }
  }
}
