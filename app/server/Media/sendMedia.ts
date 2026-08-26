import fs from 'node:fs'
import { parseRangeHeader, type ByteRange } from './range.js'

/**
 * Karaoke Propio — send a media body, honouring `Range` without ever holding
 * the file in memory.
 *
 * See `range.ts` for why this is not left to `koa-range`.
 */

export type MediaBody
  = { type: 'file', path: string, size: number }
    | { type: 'buffer', buffer: Buffer }

/**
 * Requests under this path answer their own `Range` requests, so `koa-range`
 * must not run for them: it would slice an already-sliced body a second time.
 * Exported so `serverWorker` and the tests agree on one rule.
 */
export function servesOwnRanges (path: string, urlPath: string): boolean {
  return path.startsWith(`${urlPath}api/media/`)
}

/**
 * Sets status, `Content-Range`/`Content-Length` and the body. Returns the range
 * actually served, or `null` when the whole body was sent (for logging).
 */
export function sendRanged (ctx, body: MediaBody): ByteRange | null {
  const size = body.type === 'file' ? body.size : body.buffer.length

  ctx.set('Accept-Ranges', 'bytes')

  const range = parseRangeHeader(ctx.headers.range, size)

  if (range === 'unsatisfiable') {
    ctx.set('Content-Range', `bytes */${size}`)
    ctx.status = 416
    return null
  }

  if (size === 0) {
    // a zero-byte file is a broken library entry, not something to stream
    ctx.length = 0
    ctx.body = Buffer.alloc(0)
    return null
  }

  const { start, end } = range ?? { start: 0, end: size - 1 }

  if (range) {
    ctx.status = 206
    ctx.set('Content-Range', `bytes ${start}-${end}/${size}`)
  }

  ctx.length = end - start + 1
  ctx.body = body.type === 'file'
    ? fs.createReadStream(body.path, { start, end }) // `end` is inclusive here too
    : body.buffer.subarray(start, end + 1)

  return range
}
