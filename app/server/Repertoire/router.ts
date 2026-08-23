import fs from 'node:fs/promises'
import KoaRouter from '@koa/router'
import getLogger from '../lib/Log.js'
import AcquisitionManager from '../Acquisition/AcquisitionManager.js'
import Prefs from '../Prefs/Prefs.js'
import User from '../User/User.js'
import { exportForUser, exportLibrary, importForUser } from './Repertoire.js'
import { fetchRepertoire } from './fetchRemote.js'
import { pushImportedRepertoire } from './push.js'
import { MAX_BYTES, parseRepertoire, repertoireFileName } from '../../shared/repertoire.js'
import { MessageError } from '../lib/i18n.js'

const log = getLogger('Repertoire')
const router = new KoaRouter({ prefix: '/api/repertoire' })

interface UploadedFile {
  filepath: string
  size: number
}

interface RequestWithBody {
  body: Record<string, unknown>
  files?: Record<string, UploadedFile | UploadedFile[]>
}

/** at most this many songs fetched from one import */
const MAX_FETCH = 200

// A URL is fetched by this server on behalf of whoever pasted it, so it is
// rate limited per IP the way the invite-code lookup is: the cost of the
// request lands here, not on the client making it.
const urlAttempts = new Map<string, { count: number, resetAt: number }>()
const MAX_URL_ATTEMPTS = 10
const URL_WINDOW_MS = 60_000

const requireSignedIn = (ctx) => {
  if (typeof ctx.user?.userId !== 'number') ctx.throw(401)
}

const isImportEnabled = (): boolean =>
  (Prefs.get() as Record<string, unknown>).isRepertoireImportEnabled !== false

const asAttachment = (ctx, name: string, body: unknown) => {
  ctx.type = 'application/json'
  ctx.set('Content-Disposition', `attachment; filename="${name}"`)
  ctx.body = JSON.stringify(body, null, 2)
}

// this singer's own repertoire, to carry elsewhere
router.get('/', (ctx) => {
  requireSignedIn(ctx)

  const file = exportForUser(ctx.user.userId)
  asAttachment(ctx, repertoireFileName(file.singer?.name ?? ''), file)
})

// the catalogue with nobody in it (admin)
router.get('/library', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(403)

  asAttachment(ctx, repertoireFileName('library'), exportLibrary())
})

/**
 * Apply a repertoire to an account.
 *
 * Two ways in, because a phone has both: a file the singer picked, or a link
 * to one they keep somewhere public. Anyone signed in may do this to their own
 * account; only an admin may do it to somebody else's, and only an admin can
 * do it at all once the preference is off.
 */
router.post('/import', async (ctx) => {
  requireSignedIn(ctx)

  if (!ctx.user.isAdmin && !isImportEnabled()) {
    throw new MessageError(403, 'server.repertoire.turnedOff')
  }

  const req = ctx.request as unknown as RequestWithBody
  const targetId = parseInt(String(req.body?.userId ?? ''), 10)
  let userId = ctx.user.userId

  if (Number.isInteger(targetId) && targetId !== ctx.user.userId) {
    if (!ctx.user.isAdmin) ctx.throw(403)
    if (!User.getById(targetId)) throw new MessageError(404, 'server.repertoire.noSuchUser')

    userId = targetId
  }

  const raw = Array.isArray(req.files?.repertoire) ? req.files.repertoire[0] : req.files?.repertoire
  let text: string

  if (raw) {
    if (raw.size > MAX_BYTES) {
      await fs.unlink(raw.filepath).catch(() => undefined)
      throw new MessageError(413, 'server.repertoire.fileTooLarge')
    }

    text = await fs.readFile(raw.filepath, 'utf8')
    await fs.unlink(raw.filepath).catch(() => undefined)
  } else if (typeof req.body?.url === 'string' && req.body.url.trim()) {
    const ip = ctx.request.ip
    const now = Date.now()
    const entry = urlAttempts.get(ip)

    if (!entry || entry.resetAt < now) {
      urlAttempts.set(ip, { count: 1, resetAt: now + URL_WINDOW_MS })
    } else if (++entry.count > MAX_URL_ATTEMPTS) {
      throw new MessageError(429, 'server.repertoire.tooManyAttempts')
    }

    try {
      text = await fetchRepertoire(req.body.url.trim())
    } catch (err) {
      ctx.throw(422, (err as Error).message)
    }
  } else {
    throw new MessageError(422, 'server.repertoire.chooseFileOrLink')
  }

  let report

  try {
    report = importForUser({ userId, repertoire: parseRepertoire(text) })
  } catch (err) {
    ctx.throw(422, (err as Error).message)
  }

  pushImportedRepertoire(ctx.io, userId, { starsChanged: report.stars.songs > 0 })

  log.info('%s imported a repertoire for userId %s', ctx.user.name, userId)
  ctx.body = report
})

/**
 * Download the songs an import found missing (admin).
 *
 * Deliberately not part of the import itself: applying a file writes two
 * columns for one person, and this fetches videos onto the host's disk under
 * names nobody has checked. The first is the singer's business; the second is
 * the admin's, and lands in the review list like every other unattended
 * download.
 */
router.post('/fetch-missing', (ctx) => {
  if (!ctx.user.isAdmin) ctx.throw(403)
  if (typeof ctx.user.roomId !== 'number') throw new MessageError(400, 'server.repertoire.joinARoomFirst')

  const req = ctx.request as unknown as RequestWithBody
  const songs = Array.isArray(req.body?.songs) ? req.body.songs : []

  if (!songs.length) throw new MessageError(422, 'server.repertoire.nothingToFetch')

  const wanted = songs
    .filter((song): song is Record<string, string> => !!song && typeof song === 'object')
    .filter(song => typeof song.sourceId === 'string')
    .slice(0, MAX_FETCH)
    .map(song => ({
      sourceId: song.sourceId,
      artist: typeof song.artist === 'string' ? song.artist.slice(0, 300) : '',
      title: typeof song.title === 'string' ? song.title.slice(0, 300) : '',
    }))

  try {
    ctx.body = AcquisitionManager.startBulkFromSongs({
      roomId: ctx.user.roomId,
      title: typeof req.body.title === 'string' ? req.body.title.slice(0, 100) : 'Imported repertoire',
      songs: wanted,
    })
  } catch (err) {
    ctx.throw(409, (err as Error).message)
  }
})

export default router
