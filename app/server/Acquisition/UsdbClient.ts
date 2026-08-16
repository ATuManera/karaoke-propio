import getLogger from '../lib/Log.js'

const log = getLogger('UsdbClient')

const USDB_BASE = 'https://usdb.animux.de'

export interface UsdbSearchResult {
  id: string
  artist: string
  title: string
  languages: string[]
}

export interface UsdbYoutubeLink {
  videoId: string
  createdAt: Date
}

/**
 * Reimplementation (not a copy) of the USDB client behavior in UltraScrap
 * CLI (MIT, /tmp/UltraScrap-cli-mvp) — studied per
 * prompt_de_implementacion.md #35's explicit permission to compare code and
 * reimplement, without copying UltraScrap's source. Verified LIVE against
 * https://usdb.animux.de on 2026-08-13:
 *
 *   - `POST /?link=list` requires `order`/`ud` params (not just
 *     interpret/title/limit/start) or USDB returns an empty result set.
 *   - Every one of `list`, `editsongs` (song.txt) and `detail` (comments,
 *     for the community-posted YouTube link) responded with
 *     "ERROR: You are not logged in. Login to use this function." when
 *     called anonymously — USDB genuinely requires an authenticated session
 *     for all three, not just song.txt as originally assumed. This is a
 *     real external blocker, not a guess: `login()` below is implemented
 *     against the documented request shape but could not be exercised
 *     end-to-end without credentials, which this project must never read
 *     from UltraScrap's credentials.json (see #35) or otherwise obtain
 *     without the operator's explicit configuration.
 *
 * An operator can supply USDB_USERNAME/USDB_PASSWORD as environment
 * variables (never logged, never sent to the client) to enable this at
 * runtime; without them, search()/fetchSongTxt()/fetchYoutubeLinks() throw
 * a clear "not logged in" error rather than silently returning nothing.
 */
export default class UsdbClient {
  private sessionCookie: string | null = null

  constructor (private readonly credentials?: { username: string, password: string }) {}

  /**
   * POST user/pass, extract the session cookie from Set-Cookie. Matches the
   * documented form fields (`user`, `pass`, `login=Login`) posted to
   * `/index.php?link=login`.
   */
  async login (): Promise<void> {
    if (!this.credentials) {
      throw new Error('USDB credentials not configured (USDB_USERNAME/USDB_PASSWORD)')
    }

    const form = new URLSearchParams({
      user: this.credentials.username,
      pass: this.credentials.password,
      login: 'Login',
    })

    const res = await fetch(`${USDB_BASE}/index.php?link=login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      redirect: 'manual', // USDB redirects on success; we only need the Set-Cookie
    })

    const cookie = extractSessionCookie(res)
    if (!cookie) {
      throw new Error('USDB login failed: no session cookie returned')
    }

    this.sessionCookie = cookie
    log.info('USDB session established')
  }

  private async authedFetch (url: string, init: RequestInit = {}, isRetry = false): Promise<Response> {
    if (!this.sessionCookie) await this.login()

    const res = await fetch(url, {
      ...init,
      headers: { ...init.headers, cookie: this.sessionCookie! },
    })

    const body = await res.clone().text()
    if (/you are not logged in/i.test(body)) {
      // USDB sessions can be invalidated externally (e.g. logging in again
      // from elsewhere with the same account appears to end the previous
      // session — observed live 2026-08-13). Re-login once and retry before
      // giving up, rather than requiring an app restart to recover.
      if (isRetry) {
        throw new Error('USDB session rejected (not logged in) — check USDB_USERNAME/USDB_PASSWORD')
      }

      log.info('USDB session was rejected; re-authenticating and retrying once')
      this.sessionCookie = null
      await this.login()
      return this.authedFetch(url, init, true)
    }

    return res
  }

  async search (artist: string, title: string, limit = 10): Promise<UsdbSearchResult[]> {
    const form = new URLSearchParams({
      order: 'lastchange',
      ud: 'desc',
      limit: String(Math.min(100, Math.max(1, limit))),
      start: '0',
    })
    if (artist.trim()) form.set('interpret', artist.trim())
    if (title.trim()) form.set('title', title.trim())

    let res: Response
    try {
      res = await this.authedFetch(`${USDB_BASE}/?link=list`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
      })
    } catch (err) {
      throw new Error(`USDB search failed: ${(err as Error).message}`)
    }

    if (!res.ok) {
      throw new Error(`USDB search failed: HTTP ${res.status}`)
    }

    return parseSearchResults(await res.text())
  }

  /**
   * Fetch the raw song.txt (UltraStar format) for a given USDB song id.
   * The song.txt content is embedded in a <textarea> on the "editsongs" page.
   */
  async fetchSongTxt (usdbId: string): Promise<string> {
    const res = await this.authedFetch(`${USDB_BASE}/?link=editsongs&id=${encodeURIComponent(usdbId)}`)

    if (!res.ok) {
      throw new Error(`USDB song.txt fetch failed: HTTP ${res.status}`)
    }

    const html = await res.text()
    const match = html.match(/<textarea[^>]*>([\s\S]*)<\/textarea>/)

    if (!match) {
      throw new Error(`USDB song.txt not found in response for id ${usdbId}`)
    }

    return decodeHtmlEntities(match[1])
  }

  /**
   * USDB doesn't host audio: the community convention is to post a YouTube
   * link for the song in a comment on its detail page. Returns links found,
   * most recent first — caller picks one (typically the first).
   */
  async fetchYoutubeLinks (usdbId: string): Promise<UsdbYoutubeLink[]> {
    const res = await this.authedFetch(`${USDB_BASE}/?link=detail&id=${encodeURIComponent(usdbId)}`)

    if (!res.ok) {
      throw new Error(`USDB detail fetch failed: HTTP ${res.status}`)
    }

    return parseYoutubeLinks(await res.text())
  }
}

function extractSessionCookie (res: Response): string | null {
  const getSetCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie
  const setCookies = getSetCookie ? getSetCookie.call(res.headers) : null

  if (Array.isArray(setCookies) && setCookies.length > 0) {
    return setCookies.map(c => c.split(';', 1)[0]).join('; ')
  }

  const combined = res.headers.get('set-cookie')
  if (!combined) return null

  const pairs = new Map<string, string>()
  for (const m of combined.matchAll(/([^=;,\s]+=[^;]+)(?:;|$)/g)) {
    const pair = m[1]
    pairs.set(pair.split('=', 1)[0], pair)
  }

  return pairs.size ? Array.from(pairs.values()).join('; ') : null
}

/**
 * USDB's HTML is explicitly known to be fragile to scrape; every row that
 * doesn't match the expected shape is skipped rather than throwing, so one
 * malformed row doesn't lose the rest. Rows are `<tr class="list_tr1|2">`,
 * the song id comes from an inline `show_detail(ID)` handler, and columns
 * are artist (0), title (1), ..., languages (6).
 */
export function parseSearchResults (html: string): UsdbSearchResult[] {
  const results: UsdbSearchResult[] = []
  const rowPattern = /<tr class="list_tr[12].*?>([\s\S]*?)<\/tr>/gm

  for (const rowMatch of html.matchAll(rowPattern)) {
    // show_detail(id) lives in the OPENING <tr ...> tag's onclick attribute,
    // which is outside the capture group (group 1 is only the row's inner
    // content) — search the full match (m[0]) for it, not just the body
    const idMatch = rowMatch[0].match(/show_detail\((\d+)\)/)
    if (!idMatch) continue

    const rowHtml = rowMatch[1]

    const cells = Array.from(rowHtml.matchAll(/<td\s[^>]*>(?:<a[^>]*>)?(.*?)<\/td>/gs)).map(m => stripTags(m[1]))
    const artist = cells[0]
    const title = cells[1]
    if (!artist || !title) continue

    results.push({
      id: idMatch[1],
      artist: decodeHtmlEntities(artist),
      title: decodeHtmlEntities(title),
      languages: cells[6] ? decodeHtmlEntities(cells[6]).toLowerCase().split(',').map(s => s.trim()).filter(Boolean) : [],
    })
  }

  log.verbose('parsed %s USDB result(s)', results.length)
  return results
}

export function parseYoutubeLinks (html: string): UsdbYoutubeLink[] {
  const links: UsdbYoutubeLink[] = []

  // split into comment blocks at each "DD.MM.YYYY - HH:MM" marker; whether
  // the community poster's link renders as an <a href>, an <img src>
  // (thumbnail embed) or plain text varies, so search broadly for any
  // youtube.com/youtu.be URL within the block rather than one specific tag
  const commentStart = /<td>(\d+)\.(\d+)\.(\d+) - (\d+):(\d+)/g
  const starts = Array.from(html.matchAll(commentStart))

  for (let i = 0; i < starts.length; i++) {
    const m = starts[i]
    const blockEnd = i + 1 < starts.length ? starts[i + 1].index : html.length
    const block = html.slice(m.index, blockEnd)

    const urlMatch = block.match(/https?:\/\/[^\s"'<>]*(?:youtu\.be|youtube\.com)[^\s"'<>]*/)
    const videoId = urlMatch ? extractYoutubeId(urlMatch[0]) : null
    if (!videoId) continue

    const [, day, month, year, hour, minute] = m
    // best-effort date parse; not critical if it's slightly off, only used for ordering
    const createdAt = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
    links.push({ videoId, createdAt })
  }

  return links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

function extractYoutubeId (url: string): string | null {
  // covers watch?v=, youtu.be/, /embed/ and thumbnail-style /vi/ URLs — the
  // exact form a community-posted comment link takes is unconfirmed (see
  // parseYoutubeLinks), so this is intentionally permissive
  const match = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/vi\/)([\w-]{11})/)
  return match ? match[1] : null
}

function stripTags (html: string): string {
  return html.replace(/<[^>]*>/g, '').trim()
}

function decodeHtmlEntities (text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, '\'')
    .replace(/&nbsp;/g, ' ')
}
