import getLogger from './lib/Log.js'
import { ensureRoomCodes } from './Rooms/Rooms.js'
import path from 'path'
import getIPAddress from './lib/getIPAddress.js'
import http from 'http'
import fs from 'fs'
import { promisify } from 'util'
import parseCookie from './lib/parseCookie.js'
import { MessageError } from './lib/i18n.js'
import jsonWebToken from 'jsonwebtoken'
import Koa from 'koa'
import koaRouter from '@koa/router'
import { koaBody } from 'koa-body'
import koaFavicon from 'koa-favicon'
import koaLogger from 'koa-logger'
import koaMount from 'koa-mount'
import koaRange from 'koa-range'
import koaStatic from 'koa-static'
import Media from './Media/Media.js'
import Prefs from './Prefs/Prefs.js'
import User from './User/User.js'
import AcquisitionManager from './Acquisition/AcquisitionManager.js'
import PitchManager from './Pitch/PitchManager.js'
import acquisitionRouter from './Acquisition/router.js'
import libraryRouter from './Library/router.js'
import mediaRouter from './Media/router.js'
import photosRouter from './Photos/router.js'
import prefsRouter from './Prefs/router.js'
import repertoireRouter from './Repertoire/router.js'
import roomsRouter from './Rooms/router.js'
import userRouter from './User/router.js'
import pushQueuesAndLibrary from './lib/pushQueuesAndLibrary.js'
import { Server as SocketIO } from 'socket.io'
import socketActions from './socket.js'
import IPC from './lib/IPCBridge.js'
import IPCLibraryActions from './Library/ipc.js'
import IPCMediaActions from './Media/ipc.js'
import { SCANNER_WORKER_EXITED, SERVER_WORKER_STATUS, SERVER_WORKER_ERROR } from '../shared/actionTypes.js'

const log = getLogger('server')
const { verify: jwtVerify } = jsonWebToken

async function serverWorker ({ env, startScanner, stopScanner, shutdownHandlers }) {
  const indexFile = path.join(env.KES_PATH_WEBROOT, 'index.html')
  const urlPath = env.KES_URL_PATH.replace(/\/?$/, '/') // force trailing slash
  const jwtKey = Prefs.getJwtKey(env.KES_ROTATE_KEY)
  const app = new Koa()
  let server, io

  // called when middleware is finalized
  function createServer () {
    server = http.createServer(app.callback())

    // http server error handler
    server.on('error', function (err) {
      log.error(err.message)

      process.emit('serverWorker', {
        type: SERVER_WORKER_ERROR,
        error: err.message,
      })

      // not much we can do without a working server
      throw err
    })

    // create socket.io server
    io = new SocketIO(server, {
      path: urlPath + 'socket.io',
      serveClient: false,
    })

    // pitch jobs that finish need to notify the room(s) waiting on them
    PitchManager.setIO(io)

    AcquisitionManager.init({
      io,
      workerUrl: env.KES_ACQUISITION_WORKER_URL,
      cdgWorkerUrl: env.KES_CDG_WORKER_URL,
      usdbCredentials: (env.USDB_USERNAME && env.USDB_PASSWORD)
        ? { username: env.USDB_USERNAME, password: env.USDB_PASSWORD }
        : undefined,
    })

    // attach socket.io handlers
    socketActions(io, jwtKey)

    // attach IPC action handlers
    IPC.use(IPCLibraryActions(io))
    IPC.use(IPCMediaActions(io))

    // success callback in 3rd arg
    server.listen(env.KES_PORT, () => {
      const port = server.address().port
      const url = `http://${getIPAddress()}${port === 80 ? '' : ':' + port}${urlPath}`
      log.info(`Web server running at ${url}`)

      process.emit('serverWorker', {
        type: SERVER_WORKER_STATUS,
        payload: { url },
      })
    })

    // when scanner exits cleanly
    process.on(SCANNER_WORKER_EXITED, ({ code }) => {
      if (code !== 0) return

      Media.cleanup()
      pushQueuesAndLibrary(io)
    })

    // handle shutdown gracefully
    shutdownHandlers.push(() => new Promise((resolve) => {
      // also calls http server's close method, which ultimately handles the callback
      io.close(resolve)

      // HMR keep-alive connections can prevent http server from fully closing
      server.closeAllConnections()
    }))
  }

  // --------------------
  // Begin Koa middleware
  // --------------------

  // server error handler
  app.on('error', (err, ctx) => {
    if (err.code === 'EPIPE') {
      // these are common since browsers make multiple requests for media files
      log.verbose(err.message)
      return
    }

    // silence 4xx response "errors" (koa-logger should show these anyway)
    if (ctx.response && ctx.response.status.toString().startsWith('4')) {
      return
    }

    if (err.stack) log.error(err.stack)
    else log.error(err)
  })

  // middleware error handler
  app.use(async (ctx, next) => {
    try {
      await next()
    } catch (err) {
      ctx.status = err.status || 500
      // a MessageError has waited until here to be worded, because here is
      // the first place that knows who is reading it
      ctx.body = err instanceof MessageError ? err.translate(ctx) : err.message
      ctx.app.emit('error', err, ctx)
    }
  })

  // http request/response logging
  app.use(koaLogger((str, args) => (args.length === 6 && args[3] >= 500) ? log.error(str) : log.debug(str)))

  app.use(koaFavicon(path.join(env.KES_PATH_ASSETS, 'favicon.ico')))
  app.use(koaRange)
  app.use(koaBody({ multipart: true }))

  // all http requests
  app.use(async (ctx, next) => {
    ctx.jwtKey = jwtKey // used by login route
    ctx.io = io // used by the logout route, which is exempt from the block below

    // skip JWT/session validation if non-API request or logging in/out
    if (!ctx.request.path.startsWith(`${urlPath}api/`)
      || ctx.request.path === `${urlPath}api/login`
      || ctx.request.path === `${urlPath}api/logout`) {
      return next()
    }

    // verify JWT
    try {
      const { keToken } = parseCookie(ctx.request.header.cookie)
      ctx.user = jwtVerify(keToken, jwtKey)
    } catch {
      ctx.user = {
        dateUpdated: null,
        isAdmin: false,
        isGuest: false,
        locale: null,
        name: null,
        roomId: null,
        userId: null,
        username: null,
      }
    }

    // validated
    ctx.startScanner = startScanner
    ctx.stopScanner = stopScanner

    await next()
  })

  // Guest accounts pile up otherwise: one per person per party, forever.
  // Swept at startup and hourly rather than on a timer tied to each account,
  // which would need per-user scheduling for no benefit.
  const sweepGuests = () => {
    try {
      const removed = User.removeExpiredGuests()
      if (removed) log.info('removed %s expired guest account(s)', removed)
    } catch (err) {
      log.warn('guest sweep failed: %s', err.message)
    }
  }

  sweepGuests()
  const guestSweep = setInterval(sweepGuests, 60 * 60 * 1000)
  shutdownHandlers.push(() => clearInterval(guestSweep))

  // rooms created before invite codes existed still need one

  {
    const filled = ensureRoomCodes()

    if (filled) log.info('generated invite codes for %s room(s)', filled)
  }

  // http api endpoints
  const baseRouter = new koaRouter({
    prefix: urlPath.replace(/\/$/, ''), // avoid double slashes with /api prefix
  })

  baseRouter.use(acquisitionRouter.routes())
  baseRouter.use(libraryRouter.routes())
  baseRouter.use(mediaRouter.routes())
  baseRouter.use(photosRouter.routes())
  baseRouter.use(prefsRouter.routes())
  baseRouter.use(repertoireRouter.routes())
  baseRouter.use(roomsRouter.routes())
  baseRouter.use(userRouter.routes())
  app.use(baseRouter.routes())

  // serve index.html with dynamic base tag at the main SPA routes
  const createIndexMiddleware = (content) => {
    const indexRoutes = [
      urlPath,
      ...['account', 'library', 'queue', 'player'].map(r => urlPath + r + '/'),
    ]

    content = content.replace('<base href="/">', `<base href="${urlPath}">`)

    return async (ctx, next) => {
      // use a trailing slash for matching purposes
      const reqPath = ctx.request.path.replace(/\/?$/, '/')

      if (!indexRoutes.includes(reqPath)) {
        return next()
      }

      ctx.set('content-type', 'text/html')
      ctx.body = content
      ctx.status = 200
    }
  }

  if (env.NODE_ENV !== 'development') {
    // make sure we handle index.html before koaStatic,
    // otherwise it'll be served without dynamic base tag
    app.use(createIndexMiddleware(await promisify(fs.readFile)(indexFile, 'utf8')))

    // serve build and asset folders
    app.use(koaMount(urlPath, koaStatic(env.KES_PATH_WEBROOT)))
    app.use(koaMount(`${urlPath}assets`, koaStatic(env.KES_PATH_ASSETS)))

    createServer()
    return
  }

  // ----------------------
  // Development middleware
  // ----------------------
  log.info('Enabling webpack dev and HMR middleware')
  const { default: webpack } = await import('webpack')
  // eslint-disable-next-line n/no-missing-import
  const { default: webpackConfig } = await import('../config/webpack.config.js')
  const compiler = webpack(webpackConfig)

  compiler.hooks.done.tap('indexPlugin', async () => {
    const indexContent = await new Promise((resolve, reject) => {
      compiler.outputFileSystem.readFile(indexFile, 'utf8', (err, result) => {
        if (err) return reject(err)
        return resolve(result)
      })
    })

    // @todo make this less hacky
    if (!server) {
      app.use(createIndexMiddleware(indexContent))
      createServer()
    }
  })

  const { default: webpackDevMiddleware } = await import('webpack-dev-middleware')
  app.use(webpackDevMiddleware.koaWrapper(compiler, { publicPath: urlPath }))

  const { default: hotMiddleware } = await import('./lib/getHotMiddleware.js')
  app.use(hotMiddleware(compiler))

  // serve assets since webpack-dev-server is unaware of this folder
  app.use(koaMount(`${urlPath}assets`, koaStatic(env.KES_PATH_ASSETS)))
}

export default serverWorker
