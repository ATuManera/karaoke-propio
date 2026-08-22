import getLogger from '../lib/Log.js'
import { looksLikeCollaboration, namesMatch, primaryArtist, yearFromDate, type RawMetadata } from './categoryMap.js'

const log = getLogger('MusicBrainz')

const BASE = 'https://musicbrainz.org/ws/2'

// MusicBrainz requires an identifying User-Agent and throttles to ~1 request
// per second; ignoring either gets an IP blocked, so both are enforced here
// rather than left to callers.
const USER_AGENT = 'KaraokePropio/1.0 ( https://github.com/vicwomg/pikaraoke )'
const MIN_INTERVAL_MS = 1100
const RATE_LIMIT_BACKOFF_MS = 4000

/**
 * A lookup that failed for reasons unrelated to the artist (throttling, network).
 * Distinct from "no match" on purpose: a transient failure must not be cached
 * or recorded as an answer, or one unlucky moment permanently strips categories
 * off every song by that artist — which is exactly what happened on
 * 2026-08-14, when a single 503 mid-scan left Marc Anthony's songs bare.
 */
export class TransientLookupError extends Error {}

export class MusicBrainzClient {
  private lastRequest = 0
  private artistCache = new Map<string, { type?: string, gender?: string, country?: string, genres: string[] } | null>()

  private async throttle (): Promise<void> {
    const wait = this.lastRequest + MIN_INTERVAL_MS - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    this.lastRequest = Date.now()
  }

  private async get<T> (path: string, isRetry = false): Promise<T | null> {
    await this.throttle()

    try {
      const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': USER_AGENT } })

      // one retry after a pause: MusicBrainz throttles in bursts, and the
      // alternative is losing every category for this artist
      if (res.status === 503 && !isRetry) {
        log.info('rate limited; backing off %sms and retrying', RATE_LIMIT_BACKOFF_MS)
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_BACKOFF_MS))
        return this.get<T>(path, true)
      }

      if (res.status === 503) throw new TransientLookupError('rate limited')

      // 404 and friends are a real answer: this artist/recording is not there
      if (!res.ok) {
        log.warn('lookup failed (%s): %s', res.status, path)
        return null
      }

      return await res.json() as T
    } catch (err) {
      if (err instanceof TransientLookupError) throw err
      throw new TransientLookupError((err as Error).message)
    }
  }

  /**
   * Artist-level facts: curated genres, gender (Mujer/Hombre) and band-or-not.
   *
   * Deliberately a two-step lookup (search for the id, then fetch it) so it can
   * ask for `genres` rather than `tags`. Measured 2026-08-14, same artists:
   *
   *   tags   -> The Beatles: "heavy metal", "80s"; Queen: "metal", "disco"
   *   genres -> The Beatles: rock, pop, pop rock; Queen: rock, glam rock, hard rock
   *
   * `tags` are free-form and unmoderated, `genres` are a curated vocabulary, and
   * that difference is the whole gap between a useful filter and a wrong one.
   */
  private async lookupArtist (artist: string) {
    const key = artist.toLowerCase()
    if (this.artistCache.has(key)) return this.artistCache.get(key)!

    const search = await this.get<{ artists?: { id: string, name: string, score?: number }[] }>(
      `/artist?query=${encodeURIComponent(artist)}&fmt=json&limit=1`,
    )

    const hit = search?.artists?.[0]
    // the score alone is not enough: "Marc Anthony & La India" returns "India"
    // at score 100, whose gender and genres belong to a different performer
    if (!hit || (hit.score ?? 0) < 80 || !namesMatch(artist, hit.name)) {
      this.artistCache.set(key, null)
      return null
    }

    const detail = await this.get<{
      type?: string
      gender?: string
      country?: string
      genres?: { name: string, count: number }[]
    }>(`/artist/${hit.id}?inc=genres&fmt=json`)

    const result = detail
      ? {
          type: detail.type,
          gender: detail.gender,
          country: detail.country,
          // strongest first, and only genres somebody actually voted for
          genres: (detail.genres ?? [])
            .filter(g => g.count > 0)
            .sort((a, b) => b.count - a.count)
            .map(g => g.name),
        }
      : null

    this.artistCache.set(key, result)
    return result
  }

  /**
   * Is there really a recording of "<title>" by "<artist>"?
   *
   * Used to settle which side of a YouTube title is the artist, where the
   * question has a sharp answer: measured over the reversed titles from a real
   * import, the right way round scored 100 and the wrong way round returned
   * nothing at all, ten times out of ten. There is no threshold to tune here
   * because there is no middle ground to tune it in.
   *
   * `artistname` rather than `artist`: it matches the performer's own name and
   * reports it as MusicBrainz spells it, which is how "Doors" comes back as
   * "The Doors".
   */
  async findRecording (artist: string, title: string): Promise<{ artist: string, title: string, score: number } | null> {
    const clean = (s: string) => s.replace(/["\\]/g, ' ').trim()
    if (!clean(artist) || !clean(title)) return null

    const query = `artistname:"${clean(artist)}" AND recording:"${clean(title)}"`
    const data = await this.get<{
      recordings?: { 'score'?: number, 'title'?: string, 'artist-credit'?: { name: string }[] }[]
    }>(`/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`)

    const hit = data?.recordings?.[0]
    if (!hit || (hit.score ?? 0) < 90) return null

    return {
      artist: hit['artist-credit']?.map(credit => credit.name).join(', ') ?? artist,
      title: hit.title ?? title,
      score: hit.score ?? 0,
    }
  }

  /**
   * Everything known about one song, pooling recording-level tags (genre of
   * this particular song) with artist-level ones (Marc Anthony -> salsa), since
   * neither alone covers much: recordings frequently carry no tags at all.
   */
  async lookup (artist: string, title: string): Promise<RawMetadata | null> {
    const isCollaboration = looksLikeCollaboration(artist)
    // a joint credit is seldom its own MusicBrainz entry, so fall back to the
    // lead performer rather than lose genre/country entirely
    const searchName = isCollaboration ? primaryArtist(artist) : artist

    const artistInfo = await this.lookupArtist(searchName)

    // the recording is consulted for its release date only: per-recording
    // genres are sparse and its free-form tags carry the noise avoided above
    const query = `artist:"${searchName.replace(/"/g, '')}" AND recording:"${title.replace(/"/g, '')}"`
    const data = await this.get<{ recordings?: { 'score'?: number, 'first-release-date'?: string }[] }>(
      `/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`,
    )

    const rec = data?.recordings?.[0]
    const recMatched = rec && (rec.score ?? 0) >= 90

    // a collaboration is still worth categorizing even when neither lookup
    // resolved, because the duet itself is derived from the credit
    if (!artistInfo && !recMatched && !isCollaboration) return null

    return {
      tags: artistInfo?.genres ?? [],
      isCollaboration,
      artistType: artistInfo?.type,
      artistGender: artistInfo?.gender,
      artistCountry: artistInfo?.country,
      year: recMatched ? yearFromDate(rec['first-release-date']) : null,
    }
  }
}

/**
 * The one client everything shares.
 *
 * The throttle that keeps MusicBrainz from blocking this address lives on the
 * instance, so a second instance is a second unthrottled caller. A bulk import
 * asking which way round a title is, while categorization runs in the
 * background for the songs it already fetched, is exactly that situation.
 */
const musicBrainz = new MusicBrainzClient()

export { musicBrainz }
export default MusicBrainzClient
