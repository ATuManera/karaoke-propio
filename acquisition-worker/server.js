#!/usr/bin/env node
// Karaoke Propio — acquisition-worker
//
// Runs yt-dlp (+ffmpeg for muxing) in its own Debian container so the
// karaoke-eternal Alpine image never needs Python/yt-dlp installed. Search
// results and downloads only — no pitch shifting here (see pitch-worker).
// Never exposed publicly — internal Docker network only.
'use strict'

const http = require('node:http')
const path = require('node:path')
const fsPromises = require('node:fs/promises')
const { execFile } = require('node:child_process')

const PORT = parseInt(process.env.PORT, 10) || 4100
const SEARCH_TIMEOUT_MS = parseInt(process.env.ACQ_WORKER_SEARCH_TIMEOUT_MS, 10) || 30 * 1000
// a playlist is read a page of ~100 entries at a time, so it takes longer than
// a single search but nothing like a download
const PLAYLIST_TIMEOUT_MS = parseInt(process.env.ACQ_WORKER_PLAYLIST_TIMEOUT_MS, 10) || 60 * 1000
const DOWNLOAD_TIMEOUT_MS = parseInt(process.env.ACQ_WORKER_DOWNLOAD_TIMEOUT_MS, 10) || 10 * 60 * 1000

// Reimplementation of the search-and-download shape PiKaraoke uses
// (query + " karaoke", ~10 flat results, prefer H264 for compatibility) —
// see prompt_de_implementacion.md #34. No PiKaraoke (GPLv3) source copied;
// this is our own thin wrapper around yt-dlp's documented CLI/JSON output.
const ALLOWED_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'])

function isSafeAbsolutePath (p) {
  return typeof p === 'string' && path.isAbsolute(p) && !p.includes('\0')
}

function isAllowedYouTubeUrl (raw) {
  try {
    const u = new URL(raw)
    return (u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

// YouTube requires solving a JS challenge to decipher format URLs. yt-dlp only
// auto-detects deno, so without this it silently falls back to a client whose
// separate video+audio formats 403 on download — verified 2026-08-14: the exact
// download command failed with "HTTP Error 403: Forbidden" bare, and succeeded
// ("Solving JS challenges using node") with this flag. node is guaranteed here:
// this worker runs on a node base image. PiKaraoke solves the same problem by
// installing deno into its image.
const JS_RUNTIME_ARGS = ['--js-runtimes', 'node']

// Which YouTube client yt-dlp impersonates decides whether the adaptive
// video+audio formats actually download. Measured 2026-08-14 on this server,
// same video and command, only this flag differing:
//
//   android     6/6 ok       <- and 9/9 across three different videos
//   default     1/2 ok       (yt-dlp picks android_vr, which 403s constantly)
//   tv          0/2 ok
//   web_safari  0/2 ok       (YouTube forces SABR streaming for it)
//   mweb        0/2 ok
//
// So the 403s were never really transient: yt-dlp's default client choice was
// simply a bad one for downloads here. Retries walk the list in case the
// pecking order shifts (it has before — this is a moving target).
const DOWNLOAD_CLIENTS = ['android', 'default', 'tv']
const MAX_DOWNLOAD_ATTEMPTS = DOWNLOAD_CLIENTS.length
const RETRY_BACKOFF_MS = 2000

const clientArgs = client => client === 'default' ? [] : ['--extractor-args', `youtube:player_client=${client}`]

// googlevideo hands out signed format URLs that it then intermittently rejects
// with 403 — verified 2026-08-14: a download that failed twice through the app
// succeeded immediately when retried by hand, same video, same command. The
// preview path already retried; downloads did not, so one unlucky 403 killed
// the whole acquisition. Only errors that can plausibly pass are retried: a
// private/removed/DRM video fails the same way every time, and hammering it
// just delays telling the user.
const TRANSIENT_RE = /\b(403|forbidden|429|too many requests|5\d\d server error|timed? ?out|timeout|connection|network|temporarily|unable to download video data)\b/i

function isTransient (message) {
  return TRANSIENT_RE.test(message ?? '')
}

// yt-dlp writes per-format parts next to the output (".f137.mp4", ".part"...);
// a retry must not find leftovers from the attempt that just failed
async function cleanupPartials (tmpPath) {
  const dir = path.dirname(tmpPath)
  const base = path.basename(tmpPath).replace(/\.[^.]+$/, '')

  await fsPromises.unlink(tmpPath).catch(() => {})
  const entries = await fsPromises.readdir(dir).catch(() => [])

  await Promise.all(entries
    .filter(f => f.startsWith(base))
    .map(f => fsPromises.unlink(path.join(dir, f)).catch(() => {})))
}

function execFileP (cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || err.message || '').slice(-2000)
        return reject(new Error(`${cmd} failed: ${tail}`))
      }
      resolve({ stdout, stderr })
    })
  })
}

// A real karaoke track usually says so in the title or the channel name
// ("PARTY TYME KARAOKE", "Puro Mariachi Karaoke"). Appending "karaoke" to the
// query alone still lets plain music videos through, which are useless to sing
// to — this is what actually drops them. Kept deliberately broad (accent- and
// language-tolerant) because a false negative hides a usable track, which is
// worse than letting an occasional non-karaoke result slip by.
const KARAOKE_RE = /karaok|instrumental|playback|pista|sing[\s-]?along|backing\s?track|minus\s?one/i

// yt-dlp only reports these in --flat-playlist mode; a live/upcoming stream is
// never a usable karaoke track
const LIVE_STATUSES = new Set(['is_live', 'is_upcoming'])

async function handleSearch (req, res, query) {
  const q = query.get('q')
  const limit = Math.min(25, Math.max(1, parseInt(query.get('limit'), 10) || 10))
  // opt-out, not opt-in: singers want karaoke tracks by default
  const karaokeOnly = query.get('karaokeOnly') !== 'false'

  if (!q || !q.trim()) {
    return sendJson(res, 422, { error: 'q is required' })
  }

  // ask for extras: filtering/sorting throws some away, so a bare `limit`
  // would routinely return far fewer than the caller asked for
  const fetchLimit = karaokeOnly ? Math.min(50, limit * 3) : Math.min(50, limit * 2)

  // never shell-concatenate user input: the search term becomes one execFile
  // argument, not a shell string
  const searchTerm = `ytsearch${fetchLimit}:${q.trim()}${karaokeOnly ? ' karaoke' : ''}`

  const { stdout } = await execFileP('yt-dlp', [
    searchTerm,
    '--flat-playlist',
    '--dump-single-json',
    '--no-warnings',
    ...JS_RUNTIME_ARGS,
  ], { timeout: SEARCH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })

  const parsed = JSON.parse(stdout)
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []

  const results = entries
    .filter(e => !LIVE_STATUSES.has(e.live_status))
    .filter(e => !karaokeOnly || KARAOKE_RE.test(`${e.title ?? ''} ${e.channel ?? e.uploader ?? ''}`))
    .map(e => ({
      id: e.id,
      url: `https://www.youtube.com/watch?v=${e.id}`,
      title: e.title,
      durationSeconds: typeof e.duration === 'number' ? Math.round(e.duration) : null,
      uploader: e.uploader || e.channel || null,
      thumbnail: Array.isArray(e.thumbnails) && e.thumbnails.length ? e.thumbnails[e.thumbnails.length - 1].url : null,
      // view count is the single best quality signal available from a flat
      // search (upload date is always null here); verified marks official
      // karaoke publishers
      viewCount: typeof e.view_count === 'number' ? e.view_count : null,
      isVerified: e.channel_is_verified === true,
    }))
    // most-watched first: popularity tracks karaoke quality closely, and
    // YouTube's own relevance order buries good versions behind novelty uploads
    .sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1))
    .slice(0, limit)

  return sendJson(res, 200, { results })
}

// A playlist is read to find out which of its songs the library already has, so
// what matters is covering the list, not the detail of each entry: --flat-playlist
// asks YouTube for the listing itself and never touches the videos. The cap is
// on this side because a 1600-entry channel upload playlist is a legitimate
// thing to paste, and every entry past a party's worth of songs is a page of
// scrolling nobody reads. The caller is told the real total so it can say so.
const PLAYLIST_MAX_ENTRIES = 100

// yt-dlp's own message is the useful part ("The playlist does not exist", "This
// playlist is private") — the wrapper prefix, the extractor tag and the id are
// noise to whoever pasted the link
function ytDlpMessage (raw) {
  const lines = String(raw ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const line = lines.filter(l => l.includes('ERROR:')).pop() ?? lines.pop() ?? 'yt-dlp failed'

  return line
    .replace(/^.*?ERROR:\s*/, '')
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/^[\w-]+:\s+/, '')
    .replace(/^YouTube said:\s*/, '')
    .trim()
}

async function handlePlaylist (req, res, query) {
  const url = query.get('url')
  const limit = Math.min(
    PLAYLIST_MAX_ENTRIES,
    Math.max(1, parseInt(query.get('limit'), 10) || PLAYLIST_MAX_ENTRIES),
  )

  if (!isAllowedYouTubeUrl(url)) {
    return sendJson(res, 422, { error: 'url must be a youtube.com/youtu.be URL' })
  }

  let stdout

  try {
    ({ stdout } = await execFileP('yt-dlp', [
      url,
      '--flat-playlist',
      '--dump-single-json',
      '--playlist-end', String(limit),
      '--no-warnings',
      ...JS_RUNTIME_ARGS,
    ], { timeout: PLAYLIST_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }))
  } catch (err) {
    // a private, deleted or mistyped playlist is the user's problem to fix, not
    // a server fault — 422 with what YouTube actually said, unless what it said
    // was an HTTP status (which is true, and useless to whoever pasted a link)
    const detail = ytDlpMessage(err.message)

    return sendJson(res, 422, {
      error: /HTTP Error|Unable to download|urlopen|SSL/i.test(detail)
        ? 'YouTube would not open this playlist. Check the link, and that the playlist is public or unlisted.'
        : detail,
    })
  }

  const parsed = JSON.parse(stdout)
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []

  return sendJson(res, 200, {
    playlist: {
      title: parsed.title ?? '',
      // present on a real playlist, null on an auto-generated mix
      total: Number.isFinite(parsed.playlist_count) ? parsed.playlist_count : null,
      // how many the listing itself returned, before the unusable ones were
      // dropped. Without it a playlist holding one deleted video looks like it
      // was cut short by the cap, which is a different and worse thing to say.
      read: entries.length,
      entries: entries
        .filter(e => e && e.id && !LIVE_STATUSES.has(e.live_status))
        // a playlist keeps its place for videos that have since been taken
        // down; "[Deleted video]" is not a song anyone can be helped to find,
        // and some come back with no title at all, which rendered as a blank row
        .filter(e => typeof e.title === 'string' && e.title.trim())
        .filter(e => !/^\[(deleted|private|unavailable) video\]$/i.test(e.title.trim()))
        .map(e => ({
          id: e.id,
          title: e.title,
          durationSeconds: typeof e.duration === 'number' ? Math.round(e.duration) : null,
          uploader: e.uploader || e.channel || null,
          // smallest thumbnail, not the largest the search uses: this is a list
          // of up to 100 rows on a phone, so 100 full-size images is the wrong
          // trade
          thumbnail: Array.isArray(e.thumbnails) && e.thumbnails.length ? e.thumbnails[0].url : null,
        })),
    },
  })
}

// yt-dlp reports HLS variants as ext=mp4 even though their URL is an .m3u8
// playlist only some players handle, so protocol=https is what keeps the
// preview a plain progressive file a <video> tag can just point at. "worst"
// is deliberate: this is a confirmation preview, not the final download, so
// low bitrate is preferable (less bandwidth, faster start).
const PREVIEW_FORMAT = 'worst[ext=mp4][protocol=https][vcodec!=none][acodec!=none]' +
  '/worst[protocol=https][vcodec!=none][acodec!=none]'

async function handlePreviewStreamUrl (req, res, query) {
  const url = query.get('url')

  if (!isAllowedYouTubeUrl(url)) {
    return sendJson(res, 422, { error: 'url must be a youtube.com/youtu.be URL' })
  }

  // a direct media URL, not YouTube's embed player: this is what lets a
  // preview play videos whose uploader disabled third-party embedding — the
  // IFrame Player API respects that flag, a raw stream URL played in our
  // own <video> element does not go through YouTube's player at all
  const { stdout } = await execFileP('yt-dlp', [
    '-g', '-f', PREVIEW_FORMAT,
    '--no-warnings',
    ...JS_RUNTIME_ARGS,
    url,
  ], { timeout: 15 * 1000, maxBuffer: 1024 * 1024 })

  const streamUrl = stdout.trim().split('\n')[0]
  if (!streamUrl) {
    return sendJson(res, 500, { error: 'yt-dlp returned no playable stream for this video' })
  }
  if (streamUrl.includes('.m3u8') || streamUrl.includes('/manifest/')) {
    return sendJson(res, 500, { error: 'no progressive (non-manifest) stream available for this video' })
  }

  return sendJson(res, 200, { streamUrl })
}

async function handleViewCount (req, res, query) {
  const url = query.get('url')
  if (!isAllowedYouTubeUrl(url)) return sendJson(res, 422, { error: 'url must be a youtube.com/youtu.be URL' })

  const { stdout } = await execFileP('yt-dlp', [
    '--skip-download', '--print', '%(view_count)s', '--no-warnings',
    ...JS_RUNTIME_ARGS, ...clientArgs('android'),
    url,
  ], { timeout: 30000, maxBuffer: 1024 * 1024 })

  const n = parseInt(stdout.trim().split('\n')[0], 10)
  return sendJson(res, 200, { viewCount: Number.isFinite(n) ? n : null })
}

async function handleDownload (req, res) {
  const body = await readJsonBody(req)
  const { url, outputPath, tmpPath } = body || {}

  if (!isAllowedYouTubeUrl(url)) {
    return sendJson(res, 422, { error: 'url must be a youtube.com/youtu.be URL' })
  }

  if (!isSafeAbsolutePath(outputPath) || !isSafeAbsolutePath(tmpPath)) {
    return sendJson(res, 422, { error: 'outputPath/tmpPath must be absolute paths' })
  }

  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true })
  await fsPromises.mkdir(path.dirname(tmpPath), { recursive: true })

  let lastError

  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      // prefer H264/AAC in an mp4 container for broad compatibility (Fire TV,
      // browsers) — same rationale PiKaraoke documented; reimplemented here
      // via yt-dlp's own format-selection syntax, not copied code
      await execFileP('yt-dlp', [
        '-f', 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/best[ext=mp4]/best',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-warnings',
        ...JS_RUNTIME_ARGS,
        ...clientArgs(DOWNLOAD_CLIENTS[attempt - 1]),
        '-o', tmpPath,
        url,
      ], { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })

      await fsPromises.rename(tmpPath, outputPath) // atomic publish into staging
      return sendJson(res, 200, { outputPath })
    } catch (err) {
      lastError = err
      await cleanupPartials(tmpPath)

      if (!isTransient(err.message) || attempt === MAX_DOWNLOAD_ATTEMPTS) break

      // Each attempt re-runs yt-dlp, which resolves brand-new format URLs —
      // that is the whole point: the URLs from the failed attempt are the
      // problem, not the video. Backing off a little also lets a burst of
      // googlevideo throttling pass.
      console.warn(`download attempt ${attempt}/${MAX_DOWNLOAD_ATTEMPTS} via client "${DOWNLOAD_CLIENTS[attempt - 1]}" failed (${err.message.trim().slice(-120)}); retrying with "${DOWNLOAD_CLIENTS[attempt]}"`)
      await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt))
    }
  }

  return sendJson(res, 500, { error: lastError.message })
}

async function handleExtractAudio (req, res) {
  const body = await readJsonBody(req)
  const { inputPath, outputPath, tmpPath } = body || {}

  if (!isSafeAbsolutePath(inputPath) || !isSafeAbsolutePath(outputPath) || !isSafeAbsolutePath(tmpPath)) {
    return sendJson(res, 422, { error: 'inputPath/outputPath/tmpPath must be absolute paths' })
  }

  await fsPromises.mkdir(path.dirname(outputPath), { recursive: true })
  await fsPromises.mkdir(path.dirname(tmpPath), { recursive: true })

  try {
    // used by the UltraStar/USDB acquisition path: the CDG generator only
    // needs audio (CDGSharp renders the lyrics graphics separately from
    // song.txt), so extract just the audio track from a downloaded video
    // rather than publishing the whole video — see
    // prompt_de_implementacion.md #36 ("Puede extraerse audio del video
    // descargado")
    await execFileP('ffmpeg', [
      '-y', '-i', inputPath,
      '-vn',
      '-c:a', 'aac', '-b:a', '192k',
      tmpPath,
    ], { timeout: DOWNLOAD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 })

    await fsPromises.rename(tmpPath, outputPath)
    return sendJson(res, 200, { outputPath })
  } catch (err) {
    await fsPromises.unlink(tmpPath).catch(() => {})
    return sendJson(res, 500, { error: err.message })
  }
}

function readJsonBody (req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function sendJson (res, status, obj) {
  const json = JSON.stringify(obj)
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) })
  res.end(json)
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://internal')

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true })
  }

  if (req.method === 'GET' && url.pathname === '/search') {
    return handleSearch(req, res, url.searchParams).catch((err) => {
      sendJson(res, 500, { error: err.message })
    })
  }

  if (req.method === 'GET' && url.pathname === '/playlist') {
    return handlePlaylist(req, res, url.searchParams).catch((err) => {
      sendJson(res, 500, { error: err.message })
    })
  }

  if (req.method === 'GET' && url.pathname === '/view-count') {
    return handleViewCount(req, res, url.searchParams).catch((err) => {
      sendJson(res, 500, { error: err.message })
    })
  }

  if (req.method === 'GET' && url.pathname === '/preview-stream-url') {
    return handlePreviewStreamUrl(req, res, url.searchParams).catch((err) => {
      sendJson(res, 500, { error: err.message })
    })
  }

  if (req.method === 'POST' && url.pathname === '/download') {
    return handleDownload(req, res).catch((err) => {
      sendJson(res, 400, { error: err.message })
    })
  }

  if (req.method === 'POST' && url.pathname === '/extract-audio') {
    return handleExtractAudio(req, res).catch((err) => {
      sendJson(res, 400, { error: err.message })
    })
  }

  sendJson(res, 404, { error: 'not found' })
})

server.listen(PORT, () => {
  console.log(`acquisition-worker listening on :${PORT}`)
})
