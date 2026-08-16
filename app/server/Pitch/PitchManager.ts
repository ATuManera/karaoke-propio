import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Server as SocketIOServer } from 'socket.io'
import getLogger from '../lib/Log.js'
import Media from '../Media/Media.js'
import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'
import { resolveMedia, readSource, computeSourceFingerprint } from '../Media/mediaResolver.js'
import { cacheKey, getCachePaths, cacheExists, getExtractedAudioPath, ensureCacheDir } from './pitchCache.js'
import PitchWorkerClient from './PitchWorkerClient.js'
import { setPitchStatusProvider } from './pitchState.js'
import { QUEUE_PUSH } from '../../shared/actionTypes.js'
import type { PitchStatus } from '../../shared/types.js'

const log = getLogger('PitchManager')

interface Waiter {
  queueId: number
  roomId: number
}

interface Job {
  key: string
  mediaId: number
  sourceFingerprint: string
  pitchSemitones: number
  status: PitchStatus
  error?: string
  outputPath: string
  waiters: Map<number, Waiter> // keyed by queueId
}

/**
 * Owns pitch-shifted variant generation: knows what exists, deduplicates
 * concurrent requests for the same (media, pitch) across every room, caps
 * global FFmpeg concurrency, and rebuilds its in-memory state after a
 * restart. Nothing here is persisted beyond queue.pitchSemitones and
 * media.sourceFingerprint — pitchStatus is always derived.
 */
class PitchManager {
  private static io: SocketIOServer
  private static worker: PitchWorkerClient
  private static cacheDir: string
  private static maxConcurrency = 2
  private static jobs = new Map<string, Job>() // keyed by cacheKey
  private static activeCount = 0
  private static pending: string[] = []
  private static isReady = false

  /**
   * Called once, before reconcile(). `io` is attached separately via setIO()
   * once serverWorker creates it — reconcile() only needs to register the
   * status provider and kick off jobs; no client can be connected yet, so
   * there's no race between "job finishes" and "someone needed to be notified".
   */
  static init ({ cacheDir, workerUrl, maxConcurrency }: {
    cacheDir: string
    workerUrl: string
    maxConcurrency: number
  }): void {
    this.cacheDir = cacheDir
    this.worker = new PitchWorkerClient(workerUrl)
    this.maxConcurrency = Math.max(1, maxConcurrency || 2)
    ensureCacheDir(cacheDir)

    setPitchStatusProvider((mediaId, sourceFingerprint, pitchSemitones) => {
      if (!sourceFingerprint) {
        // fingerprint not computed yet (legacy media); treat as preparing
        // until reconcile()/request() compute it lazily
        return { pitchStatus: 'preparing' }
      }

      const job = this.jobs.get(cacheKey(mediaId, sourceFingerprint, pitchSemitones))
      if (!job) return { pitchStatus: 'preparing' }
      return { pitchStatus: job.status, pitchError: job.error }
    })
  }

  static setIO (io: SocketIOServer): void {
    this.io = io
  }

  /**
   * Rebuild in-memory pitch state from disk + queue contents. Must complete
   * before the server accepts connections (see server/main.ts) so no client
   * ever observes a queue row that's neither ready nor being worked on.
   */
  static async reconcile (): Promise<void> {
    const rows = Queue.getPitchRequests()
    log.info('reconciling %s pending pitch request(s)', rows.length)

    for (const row of rows) {
      try {
        await this.request({
          mediaId: row.mediaId,
          pitchSemitones: row.pitchSemitones,
          queueId: row.queueId,
          roomId: row.roomId,
        })
      } catch (err) {
        log.error('reconcile failed for queueId %s: %s', row.queueId, (err as Error).message)
      }
    }

    this.isReady = true
  }

  /**
   * Register (or rejoin) interest in a pitch variant. Safe to call multiple
   * times for the same queueId (e.g. reconcile followed by a live request).
   * Resolves once the job is either already ready, already errored, or has
   * been queued/started — it does NOT wait for the transcode to finish.
   */
  static async request ({ mediaId, pitchSemitones, queueId, roomId }: {
    mediaId: number
    pitchSemitones: number
    queueId: number
    roomId: number
  }): Promise<void> {
    if (pitchSemitones === 0) return // nothing to do; original is always "ready"

    const mediaRes = Media.search({ mediaId })
    const media = mediaRes.entities[mediaId]
    if (!media) throw new Error(`mediaId not found: ${mediaId}`)

    const file = path.join(media.path, media.relPath)
    let sourceFingerprint: string = media.sourceFingerprint

    if (!sourceFingerprint) {
      // legacy media scanned before this feature existed; compute once, lazily
      sourceFingerprint = await computeSourceFingerprint(file)
      Media.update({ mediaId, sourceFingerprint })
      log.info('computed sourceFingerprint for legacy mediaId %s', mediaId)
    }

    const key = cacheKey(mediaId, sourceFingerprint, pitchSemitones)
    const existing = this.jobs.get(key)

    if (existing) {
      existing.waiters.set(queueId, { queueId, roomId })

      if (existing.status === 'error') {
        // give a fresh request a chance — the earlier failure may have been
        // transient, or the underlying file may have since been fixed
        this.startJob(existing)
      }

      return
    }

    const resolved = await resolveMedia(file)
    const outputExt = resolved.mediaType === 'mp4' ? 'mp4' : 'm4a'
    const { outputPath } = getCachePaths(this.cacheDir, mediaId, sourceFingerprint, pitchSemitones, outputExt)

    const job: Job = {
      key,
      mediaId,
      sourceFingerprint,
      pitchSemitones,
      status: 'preparing',
      outputPath,
      waiters: new Map([[queueId, { queueId, roomId }]]),
    }

    this.jobs.set(key, job)

    if (await cacheExists(outputPath)) {
      job.status = 'ready'
      log.verbose('cache hit for %s', key)
      return
    }

    this.startJob(job)
  }

  /** Absolute path to a ready cached variant, or null if not ready yet. */
  static getVariantPath (mediaId: number, sourceFingerprint: string, pitchSemitones: number): string | null {
    if (pitchSemitones === 0) return null // caller should serve the original
    const job = this.jobs.get(cacheKey(mediaId, sourceFingerprint, pitchSemitones))
    return job?.status === 'ready' ? job.outputPath : null
  }

  /** Drop a queueId from job bookkeeping (e.g. QUEUE_REMOVE). Never cancels an in-flight job. */
  static releaseQueueId (queueId: number): void {
    for (const job of this.jobs.values()) {
      job.waiters.delete(queueId)
    }
  }

  private static startJob (job: Job): void {
    job.status = 'preparing'
    job.error = undefined

    if (this.pending.includes(job.key)) return // already queued to run

    if (this.activeCount >= this.maxConcurrency) {
      this.pending.push(job.key)
      return
    }

    this.runJob(job)
  }

  private static async runJob (job: Job): Promise<void> {
    this.activeCount++

    try {
      const mediaRes = Media.search({ mediaId: job.mediaId })
      const media = mediaRes.entities[job.mediaId]

      if (!media) throw new Error(`mediaId no longer exists: ${job.mediaId}`)

      const file = path.join(media.path, media.relPath)
      const resolved = await resolveMedia(file)
      const inputPath = await this.resolveWorkerInputPath(job, resolved)

      const { outputPath, tmpPath } = getCachePaths(
        this.cacheDir, job.mediaId, job.sourceFingerprint, job.pitchSemitones,
        resolved.mediaType === 'mp4' ? 'mp4' : 'm4a',
      )

      await this.worker.transcode({
        inputPath,
        outputPath,
        tmpPath,
        mediaKind: resolved.mediaType === 'mp4' ? 'mp4' : 'audio',
        pitchSemitones: job.pitchSemitones,
      })

      job.status = 'ready'
      job.outputPath = outputPath
      log.info('ready: %s', job.key)
    } catch (err) {
      job.status = 'error'
      job.error = (err as Error).message
      log.error('failed: %s (%s)', job.key, job.error)
    } finally {
      this.activeCount--
      this.notifyWaiters(job)
      this.drainPending()
    }
  }

  /**
   * The worker needs a plain filesystem path it can hand to ffmpeg. Loose
   * files already qualify; zip-contained audio is extracted once into the
   * shared cache volume and reused by every subsequent pitch request for
   * that (mediaId, fingerprint).
   */
  private static async resolveWorkerInputPath (job: Job, resolved: Awaited<ReturnType<typeof resolveMedia>>): Promise<string> {
    if (resolved.audio.type === 'file') return resolved.audio.path

    const extractedPath = getExtractedAudioPath(this.cacheDir, job.mediaId, job.sourceFingerprint, resolved.audio.ext)

    if (await cacheExists(extractedPath)) return extractedPath

    const buffer = await readSource(resolved.audio)
    const tmpPath = `${extractedPath}.tmp-${process.pid}-${Date.now()}`
    await fsPromises.writeFile(tmpPath, buffer)
    await fsPromises.rename(tmpPath, extractedPath) // atomic publish
    return extractedPath
  }

  private static drainPending (): void {
    while (this.pending.length && this.activeCount < this.maxConcurrency) {
      const key = this.pending.shift()
      const job = this.jobs.get(key)
      if (job && job.status === 'preparing') this.runJob(job)
    }
  }

  /**
   * Notify only the rooms that actually have a queueId waiting on this job —
   * never the pushQueuesAndLibrary() broadcast-everything helper, which would
   * be excessive for a single finished transcode. Waiters whose queueId was
   * since removed are silently ignored (never an error): a job may legitimately
   * outlive the queue rows that originally requested it.
   */
  private static notifyWaiters (job: Job): void {
    if (!this.io) return

    const roomIds = new Set<number>()
    for (const waiter of job.waiters.values()) roomIds.add(waiter.roomId)

    for (const roomId of roomIds) {
      this.io.to(Rooms.prefix(roomId)).emit('action', {
        type: QUEUE_PUSH,
        payload: Queue.get(roomId),
      })
    }
  }
}

export default PitchManager
