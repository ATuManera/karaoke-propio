import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import Media from '../Media/Media.js'
import Library from './Library.js'
import SongReview from './SongReview.js'
import { recheckPending } from './recheckPending.js'
import { retagSong } from '../Media/retagSong.js'
import Categories from '../Categories/Categories.js'
import { getSongNotes, getSongMediaPath } from '../Media/songNotes.js'
import { backfillViewCounts } from '../Media/popularity.js'
import PitchWorkerClient from '../Pitch/PitchWorkerClient.js'

// analysis is fast (~0.3s) but repeated for every viewer, so results are kept
// for the process lifetime; a song's key never changes anyway
const keyCache = new Map<number, unknown>()
let pitchWorker: PitchWorkerClient | null = null
import { LIBRARY_PUSH } from '../../shared/actionTypes.js'
const log = getLogger('LibraryRouter')
const router = new KoaRouter({ prefix: '/api' })

// lists underlying media for a given song
router.get('/song/:songId', async (ctx) => {
  // must be admin
  if (!ctx.user.isAdmin) {
    ctx.throw(401)
  }

  const songId = parseInt(ctx.params.songId, 10)

  if (Number.isNaN(songId)) {
    ctx.throw(401, 'Invalid songId')
  }

  const res = Media.search({ songId })

  if (!res.result.length) {
    ctx.throw(404)
  }

  ctx.body = res
})

// every category in use, plus which songs carry them (the client filters
// locally, so this is fetched once rather than per keystroke)
router.get('/categories', (ctx) => {
  if (ctx.user.userId === null) ctx.throw(401)

  ctx.body = {
    categories: Categories.get(),
    songCategories: Categories.getSongMap(),
  }
})

// kick off an online lookup for songs that have never been categorized.
// Fire-and-forget: MusicBrainz permits ~1 request/second, so a full library
// takes minutes and must not be held open by an HTTP request.
router.post('/categories/scan', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const force = (ctx.request as unknown as { body?: Record<string, unknown> }).body?.force === true

  Categories.categorizeAll({ force })
    .then((res) => {
      ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
      return res
    })
    .catch(() => undefined)

  ctx.status = 202
  ctx.body = { started: true }
})

// manual category edits by an admin; never overwritten by a later auto scan
router.post('/song/:songId/categories', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  const { name, type } = (ctx.request as unknown as { body: Record<string, unknown> }).body ?? {}

  if (Number.isNaN(songId) || typeof name !== 'string' || !name.trim()) {
    ctx.throw(422, 'name is required')
    return
  }
  if (!['genre', 'decade', 'voice', 'language'].includes(type as string)) {
    ctx.throw(422, 'invalid type')
    return
  }

  Categories.addManual(songId, name.trim().slice(0, 60), type as 'genre')
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
  ctx.status = 200
  ctx.body = {}
})

router.delete('/song/:songId/categories/:categoryId', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  const categoryId = parseInt(ctx.params.categoryId, 10)
  if (Number.isNaN(songId) || Number.isNaN(categoryId)) ctx.throw(422, 'invalid id')

  Categories.removeFromSong(songId, categoryId)
  ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
  ctx.status = 200
  ctx.body = {}
})

/**
 * Songs a bulk playlist import brought in that nobody has looked at yet.
 *
 * Admin-only, and not part of LIBRARY_PUSH on purpose: this is a maintenance
 * worklist for one person, not something every phone in the room should be
 * carrying around a copy of.
 */
router.get('/review', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  ctx.body = { pending: SongReview.getPending() }
})

/**
 * Read the names of everything still awaiting review again, and fix what is
 * the wrong way round — see recheckPending.ts for why that happens at all.
 *
 * Fire-and-forget, like the category scan and for the same reason: MusicBrainz
 * permits about one request a second and this needs two per song, so a library
 * full of them takes minutes and must not be held open by an HTTP request.
 */
router.post('/review/recheck', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  recheckPending(ctx.io)
    .catch((err: Error) => log.error('recheck failed: %s', err.message))

  ctx.status = 202
  ctx.body = { started: true }
})

// "I have looked at this one." Deliberately not inferred from an edit: an
// admin may well want a second look at something they just retyped.
router.delete('/review/:songId', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  if (Number.isNaN(songId)) ctx.throw(422, 'Invalid songId')

  SongReview.markReviewed(songId)
  ctx.status = 200
  ctx.body = {}
})

// the melody, for songs that carry note data (UltraStar/USDB only)
router.get('/song/:songId/notes', async (ctx) => {
  if (ctx.user.userId === null) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  if (Number.isNaN(songId)) ctx.throw(422, 'Invalid songId')

  const result = await getSongNotes(songId)

  // 200 with notes: null, not 404: "this song has no note data" is a normal
  // answer the UI shows a message for, not an error
  ctx.body = result ?? { notes: null, range: null }
})

// fetch popularity for media that predates it being recorded. Fire-and-forget:
// each lookup takes ~1.7s and this walks the library.
router.post('/popularity/backfill', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  backfillViewCounts(process.env.KES_ACQUISITION_WORKER_URL ?? 'http://acquisition-worker:4100')
    .then((res) => {
      ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
      return res
    })
    .catch(() => undefined)

  ctx.status = 202
  ctx.body = { started: true }
})

// estimated key of the recording, for songs with no note data
router.get('/song/:songId/key', async (ctx) => {
  if (ctx.user.userId === null) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  if (Number.isNaN(songId)) ctx.throw(422, 'Invalid songId')

  if (keyCache.has(songId)) {
    ctx.body = { key: keyCache.get(songId) }
    return
  }

  const mediaPath = getSongMediaPath(songId)
  if (!mediaPath) {
    ctx.body = { key: null }
    return
  }

  pitchWorker ??= new PitchWorkerClient(process.env.KES_PITCH_WORKER_URL ?? 'http://pitch-worker:4000')
  const key = await pitchWorker.detectKey(mediaPath).catch(() => null)

  if (key) keyCache.set(songId, key)
  ctx.body = { key }
})

// correct a song's artist/title (renames the files too — see retagSong)
router.put('/song/:songId', async (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  if (Number.isNaN(songId)) ctx.throw(422, 'Invalid songId')

  const { artist, title } = (ctx.request as unknown as { body: Record<string, unknown> }).body ?? {}

  if (typeof artist !== 'string' || !artist.trim() || typeof title !== 'string' || !title.trim()) {
    ctx.throw(422, 'artist and title are required')
    return
  }

  try {
    const res = await retagSong(songId, artist.slice(0, 200), title.slice(0, 200))

    // artist/song identities may have merged or disappeared, which
    // LIBRARY_PUSH_SONG cannot express — send the whole library
    ctx.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })

    ctx.body = res
  } catch (err) {
    ctx.throw(400, (err as Error).message)
  }
})

/**
 * The versions of a song a singer can choose between (see the queue's mediaId
 * column). Separate from the admin route above on purpose: that one returns
 * `Media.search()` verbatim, including absolute library paths, which must not
 * reach ordinary room members. This exposes only what the picker renders.
 */
router.get('/song/:songId/versions', (ctx) => {
  if (ctx.user.userId === null) ctx.throw(401)

  const songId = parseInt(ctx.params.songId, 10)
  if (Number.isNaN(songId)) ctx.throw(422, 'Invalid songId')

  const res = Media.search({ songId })
  if (!res.result.length) ctx.throw(404)

  ctx.body = {
    versions: res.result.map((mediaId: number) => {
      const m = res.entities[mediaId]
      // the acquisition suffix doubles as a stable, human-visible way to tell
      // two otherwise identically-named versions apart
      const sourceId = /---([\w-]{11})\.[^.]+$/.exec(m.relPath)?.[1] ?? null

      return {
        mediaId,
        duration: m.duration,
        isPreferred: !!m.isPreferred,
        sourceId,
      }
    }),
  }
})

export default router
