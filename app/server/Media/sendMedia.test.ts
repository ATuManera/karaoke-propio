import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import Koa from 'koa'
import koaRange from 'koa-range'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sendRanged, servesOwnRanges } from './sendMedia.js'

/**
 * The media route serves its own byte ranges over real HTTP here, behind the
 * same koa-range skip the server installs — the two have to be tested together,
 * because the failure this guards against is koa-range slicing an already
 * sliced body a second time.
 */

const URL_PATH = '/'
const SIZE = 300_000
const CONTENT = crypto.randomBytes(SIZE)

let tmpDir: string
let file: string
let server: http.Server
let origin: string

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-sendmedia-test-'))
  file = path.join(tmpDir, 'song.mp4')
  fs.writeFileSync(file, CONTENT)

  const app = new Koa()

  app.use((ctx, next) => servesOwnRanges(ctx.request.path, URL_PATH) ? next() : koaRange(ctx, next))

  app.use(async (ctx) => {
    ctx.type = 'video/mp4'

    if (ctx.path === '/api/media/1') {
      sendRanged(ctx, { type: 'file', path: file, size: SIZE })
    } else if (ctx.path === '/api/media/2') {
      sendRanged(ctx, { type: 'buffer', buffer: CONTENT })
    } else if (ctx.path === '/elsewhere') {
      // not under /api/media: koa-range still handles this one
      ctx.length = SIZE
      ctx.body = fs.createReadStream(file)
    }
  })

  server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

async function get (url: string, range?: string) {
  const res = await fetch(`${origin}${url}`, range ? { headers: { Range: range } } : undefined)
  return { res, body: Buffer.from(await res.arrayBuffer()) }
}

describe.each([
  ['streamed from a file', '/api/media/1'],
  ['sent from a buffer', '/api/media/2'],
])('a media body %s', (_label, url) => {
  it('sends the whole thing, and advertises ranges, when none is asked for', async () => {
    const { res, body } = await get(url)

    expect(res.status).toBe(200)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe(String(SIZE))
    expect(body.equals(CONTENT)).toBe(true)
  })

  it('answers a mid-file range with exactly those bytes', async () => {
    const { res, body } = await get(url, 'bytes=100000-199999')

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(`bytes 100000-199999/${SIZE}`)
    expect(res.headers.get('content-length')).toBe('100000')
    expect(body.equals(CONTENT.subarray(100000, 200000))).toBe(true)
  })

  it('answers an open-ended range (a seek) with the rest of the file', async () => {
    const { res, body } = await get(url, 'bytes=299000-')

    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(`bytes 299000-299999/${SIZE}`)
    // the last byte is the off-by-one that would make a player retry forever
    expect(body.equals(CONTENT.subarray(299000))).toBe(true)
  })

  it('answers a suffix range with the last bytes', async () => {
    const { res, body } = await get(url, 'bytes=-1000')

    expect(res.status).toBe(206)
    expect(body.equals(CONTENT.subarray(SIZE - 1000))).toBe(true)
  })

  it('refuses a range that starts past the end', async () => {
    const { res } = await get(url, 'bytes=999999-')

    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe(`bytes */${SIZE}`)
  })
})

describe('the koa-range skip', () => {
  it('leaves routes outside /api/media to koa-range', () => {
    expect(servesOwnRanges('/api/media/12', '/')).toBe(true)
    expect(servesOwnRanges('/api/media/12/prefer', '/')).toBe(true)
    expect(servesOwnRanges('/api/photos/1', '/')).toBe(false)
    expect(servesOwnRanges('/ke/api/media/12', '/ke/')).toBe(true)
    expect(servesOwnRanges('/api/media/12', '/ke/')).toBe(false)
  })

  it('still range-slices a route it does handle', async () => {
    const { res, body } = await get('/elsewhere', 'bytes=0-99')

    expect(res.status).toBe(206)
    expect(body.equals(CONTENT.subarray(0, 100))).toBe(true)
  })
})
