import { Readable } from 'stream'
import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import Rooms from '../Rooms/Rooms.js'
import AcquisitionManager from './AcquisitionManager.js'
import type { AcquisitionSource } from '../../shared/types.js'
import { MessageError } from '../lib/i18n.js'

const log = getLogger('Acquisition')
const router = new KoaRouter({ prefix: '/api/acquisition' })

const MAX_ATTEMPTS = 3
// googlevideo URLs carry their own `expire` (usually hours out); this is just
// a conservative ceiling so a cached entry can never outlive its signature
const MAX_CACHE_MS = 30 * 60 * 1000

interface CachedStream { url: string, expiresAt: number }
const streamUrlCache = new Map<string, CachedStream>()

/**
 * Resolving is the expensive, rate-limited part — NOT fetching.
 *
 * Verified live 2026-08-14: a freshly resolved URL fetched 9 times in a row
 * succeeded every time (any User-Agent), but resolving the same video 3 times
 * within ~3s made googlevideo start 403ing the resulting URLs. So the failure
 * mode this whole preview kept hitting was self-inflicted — one resolve per
 * retry, plus another resolve for every Range request the browser makes.
 *
 * PiKaraoke never trips this because it resolves once per preview click and
 * the browser reuses that single URL for all its range requests. Caching here
 * reproduces that property while keeping the bytes proxied.
 */
async function getStreamUrl (source: AcquisitionSource, resultId: string, forceFresh = false): Promise<string> {
  const key = `${source}:${resultId}`

  if (!forceFresh) {
    const hit = streamUrlCache.get(key)
    if (hit && hit.expiresAt > Date.now()) return hit.url
  }

  const url = await AcquisitionManager.resolvePreviewStreamUrl(source, resultId)

  // honour the URL's own expiry when it advertises one (seconds since epoch)
  const expireParam = parseInt(new URL(url).searchParams.get('expire') ?? '', 10)
  const signatureExpiry = Number.isFinite(expireParam) ? expireParam * 1000 : Infinity
  streamUrlCache.set(key, {
    url,
    expiresAt: Math.min(Date.now() + MAX_CACHE_MS, signatureExpiry - 60_000),
  })

  return url
}

/**
 * Proxies preview playback bytes rather than handing a resolved stream URL
 * straight to the browser. Keeping the fetch server-side means googlevideo
 * only ever sees this server (one consistent IP), and lets a rejected URL be
 * re-resolved and retried transparently instead of surfacing as a dead
 * <video> element the user can do nothing about.
 */
router.get('/preview-stream', async (ctx) => {
  const { source, resultId } = ctx.query

  if (source !== 'youtube' && source !== 'usdb') {
    ctx.throw(422, `unsupported source: ${String(source)}`)
    return
  }
  if (typeof resultId !== 'string' || !resultId) {
    ctx.throw(422, 'resultId is required')
    return
  }

  // logged unconditionally: without this there is no server-side trace that a
  // preview was even attempted (koa-logger only reports failed requests), which
  // makes "the preview is broken" impossible to tell apart from "the browser
  // is running a stale bundle and never called us"
  log.info('preview-stream requested: %s/%s (range: %s)', source, resultId, ctx.headers.range ?? 'none')

  try {
    await Rooms.validate(ctx.user.roomId, undefined, { validatePassword: false })
  } catch (err) {
    ctx.throw(403, (err as Error).message)
    return
  }

  let upstream: Response | undefined
  let lastError = 'unknown error'

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      // only the first attempt may use a cached URL; a failure means that URL
      // is no good, so every retry forces a fresh resolve
      const streamUrl = await getStreamUrl(source, resultId, attempt > 1)
      const res = await fetch(streamUrl)

      if (res.ok && res.body) {
        upstream = res
        break
      }

      lastError = `video stream returned ${res.status}`
      streamUrlCache.delete(`${source}:${resultId}`)
    } catch (err) {
      lastError = (err as Error).message
    }

    log.info('preview-stream attempt %s/%s failed for %s/%s: %s', attempt, MAX_ATTEMPTS, source, resultId, lastError)
  }

  if (!upstream || !upstream.body) {
    throw new MessageError(502, 'server.acquisition.previewUnavailable', { detail: lastError })
    return
  }

  ctx.type = upstream.headers.get('content-type') ?? 'video/mp4'
  const length = upstream.headers.get('content-length')
  if (length) ctx.length = parseInt(length, 10)
  // koa-range (applied globally in serverWorker.ts) handles any incoming
  // Range header by slicing this full stream itself — same mechanism
  // /api/media uses for local files — so Range is deliberately not
  // forwarded to googlevideo here.
  ctx.body = Readable.fromWeb(upstream.body)
})

export default router
