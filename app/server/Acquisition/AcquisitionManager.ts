import crypto from 'node:crypto'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import type { Server as SocketIOServer } from 'socket.io'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import { registerMedia, publishAtomically, sanitizePathSegment, type RegisterResult } from '../Media/MediaRegistrar.js'
import { withSourceIdSuffix } from '../lib/util.js'
import PitchManager from '../Pitch/PitchManager.js'
import Categories from '../Categories/Categories.js'
import { setViewCount } from '../Media/popularity.js'
import Prefs from '../Prefs/Prefs.js'
import Queue from '../Queue/Queue.js'
import Rooms from '../Rooms/Rooms.js'
import AcquisitionWorkerClient from './AcquisitionWorkerClient.js'
import CdgWorkerClient from './CdgWorkerClient.js'
import UsdbClient from './UsdbClient.js'
import { parseUltraStarHeaders, ultraStarToLrc } from './UltraStarToLrc.js'
import { isPrivatePlaylistId, parsePlaylistId, playlistUrl } from '../../shared/youtubePlaylist.js'
import { buildLibraryMatchIndex, isKaraokeUpload, matchInLibrary, resolveTrackMeta } from '../../shared/playlistMatch.js'
import SongReview from '../Library/SongReview.js'
import { musicBrainz } from '../Categories/MusicBrainzClient.js'
import { corroborate } from './corroborate.js'
import { ACQUISITION_BULK_PUSH, ACQUISITION_PUSH, LIBRARY_PUSH, LIBRARY_PUSH_SONG, QUEUE_PUSH } from '../../shared/actionTypes.js'
import type { AcquisitionRequest, AcquisitionSource, AcquisitionState, BulkAcquisition, BulkAcquisitionItem, PlaylistImport, PlaylistImportEntry } from '../../shared/types.js'
import { MessageError } from '../lib/i18n.js'

const log = getLogger('AcquisitionManager')

// standard YouTube video id shape; anything else is rejected before it ever
// reaches a URL string (defense in depth on top of the worker's own
// youtube.com/youtu.be host allowlist)
const YOUTUBE_ID_RE = /^[\w-]{11}$/

// What a song is filed under when nothing names its artist. A filename with no
// " - " in it cannot be parsed at all (MetaParser throws), so something has to
// go there; a placeholder that is obviously a placeholder beats the channel
// that uploaded it, which is not the artist and would scatter one performer's
// songs across every karaoke publisher on YouTube.
const UNKNOWN_ARTIST = 'Unknown Artist'

/**
 * One half of an "Artist - Title" filename, written so it can be read back.
 *
 * A dash inside either half gives MetaParser a second delimiter to choose
 * between, and its longest-match rule picks the wrong one: "Queen - Bohemian
 * Rhapsody - Live Aid" comes back as artist "Queen-Bohemian Rhapsody". An en
 * dash is not a delimiter at all, so the outer one stays the only one — and it
 * is what the title should have been written with anyway.
 */
export function asFilenamePart (text: string): string {
  return sanitizePathSegment(text.replace(/\s+-\s+/g, ' – '))
}

interface StartParams {
  /** popularity of the chosen source, kept so the library can be ordered by it */
  viewCount?: number | null
  roomId: number
  userId: number
  pitchSemitones: number
  source: AcquisitionSource
  query: string
  resultId: string
  title: string
  /** user-confirmed metadata (see shared/acquisitionMeta.ts) */
  artist?: string
  songTitle?: string
}

/**
 * Orchestrates ACQUISITION — turning a search result the user picked into a
 * registered library song, queued with the room/user/pitch identity that
 * requested it (see prompt_de_implementacion.md #33-#41).
 *
 * This is a DIFFERENT workflow than PitchManager: acquisition gets the song
 * into the library at all; pitch prepares one transposed variant of a song
 * that's already there. State here is intentionally in-memory/ephemeral
 * (unlike queue.pitchSemitones) — losing an in-progress acquisition on
 * restart just means the user re-searches, which is an acceptable MVP
 * trade-off explicitly allowed by the prompt ("puede implementarse de forma
 * durable si es razonable").
 */
class AcquisitionManager {
  private static io: SocketIOServer
  private static worker: AcquisitionWorkerClient
  private static cdgWorker: CdgWorkerClient
  private static usdb: UsdbClient
  private static requests = new Map<string, AcquisitionRequest>()
  /**
   * The one bulk import at a time. One, because every song is a yt-dlp process
   * and the worker limits nothing: forty at once is forty ffmpeg jobs
   * competing for the same disk, and YouTube counting them all against the
   * same address.
   */
  private static bulk: BulkAcquisition | null = null
  private static bulkRoomId: number | null = null

  static init ({ io, workerUrl, cdgWorkerUrl, usdbCredentials }: {
    io: SocketIOServer
    workerUrl: string
    cdgWorkerUrl: string
    usdbCredentials?: { username: string, password: string }
  }): void {
    this.io = io
    this.worker = new AcquisitionWorkerClient(workerUrl)
    this.cdgWorker = new CdgWorkerClient(cdgWorkerUrl)
    this.usdb = new UsdbClient(usdbCredentials)
  }

  static async searchYouTube (query: string, karaokeOnly = true) {
    return this.worker.search(query, 10, karaokeOnly)
  }

  /** single free-text query, matched against USDB's title field (most common single-box search intent) */
  static async searchUsdb (query: string) {
    return this.usdb.search('', query)
  }

  /**
   * What is in a playlist someone pasted a link to. Reading only: this never
   * downloads anything, and the answer is a listing to compare against the
   * library — see shared/playlistMatch.ts for what the client does with it.
   *
   * The link is reduced to its list id and rebuilt from scratch, so whatever
   * else it carried (a video id, an index, tracking parameters) never reaches
   * yt-dlp.
   */
  static async fetchPlaylist (url: string): Promise<PlaylistImport> {
    const playlistId = parsePlaylistId(url)
    if (!playlistId) throw new MessageError(422, 'server.acquisition.notAPlaylistLink')

    if (isPrivatePlaylistId(playlistId)) {
      throw new MessageError(422, 'server.acquisition.privatePlaylist')
    }

    const { title, total, read, entries } = await this.worker.fetchPlaylist(playlistUrl(playlistId))
    log.info('read playlist %s: %d usable of %d read, %s in total', playlistId, entries.length, read, total ?? '?')

    return { playlistId, title, total, read, entries }
  }

  /**
   * Resolve a directly-playable stream URL for a search result BEFORE
   * committing to a download (see prompt discussion: "análogo a PiKaraoke"
   * — let the user confirm the version is good on their own screen, not the
   * room's shared Player, before adding it to the queue).
   *
   * Deliberately mirrors PiKaraoke's approach rather than the YouTube IFrame
   * Player API: many karaoke-relevant uploads (Sing King etc.) disable
   * embedding on third-party sites, which the IFrame API respects and shows
   * as "video unavailable" for — confirmed live 2026-08-13 previewing "La
   * Bikina". yt-dlp extracting a direct progressive stream URL (same
   * mechanism used for the real download) bypasses that restriction
   * entirely, since playback never goes through YouTube's own player.
   *
   * For 'youtube' results the search result id already IS the video id — no
   * extra lookup needed. For 'usdb' results this fetches the same
   * community-posted YouTube link `runUsdb()` will download later (comments
   * on the USDB detail page); resolving it once here at preview time and
   * again at download time is deliberate — a preview should never trigger a
   * download, and the two are cheap, independent reads.
   */
  static async resolvePreview (source: AcquisitionSource, resultId: string): Promise<{ videoId: string }> {
    if (source === 'youtube') {
      if (!YOUTUBE_ID_RE.test(resultId)) throw new Error('invalid YouTube video id')
      return { videoId: resultId }
    }

    if (!/^\d+$/.test(resultId)) throw new Error('invalid USDB song id')
    const links = await this.usdb.fetchYoutubeLinks(resultId)
    if (!links.length) throw new MessageError(422, 'server.acquisition.noUsdbLink')
    return { videoId: links[0].videoId }
  }

  /**
   * The actual playable bytes' source, resolved fresh per request by the
   * preview proxy (see Acquisition/router.ts). Kept separate from
   * resolvePreview() on purpose: that one must stay cheap (for 'youtube' it's
   * pure validation, no network at all), because it runs on the socket path
   * that gates the preview UI. Folding the yt-dlp resolve into it meant every
   * preview paid ~4s before rendering anything AND could fail the whole
   * preview on a transient googlevideo 403 — the proxy retries instead.
   */
  static async resolvePreviewStreamUrl (source: AcquisitionSource, resultId: string): Promise<string> {
    const { videoId } = await this.resolvePreview(source, resultId)
    const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
    const { streamUrl } = await this.worker.getPreviewStreamUrl(url)
    return streamUrl
  }

  /**
   * Kicks off the full pipeline asynchronously and returns immediately with
   * a requestId — same "never hold the ack open" principle as pitch requests.
   */
  static start (params: StartParams): string {
    const requestId = crypto.randomUUID()

    const request: AcquisitionRequest = {
      requestId,
      roomId: params.roomId,
      userId: params.userId,
      pitchSemitones: params.pitchSemitones,
      source: params.source,
      query: params.query,
      result: { id: params.resultId, title: params.title },
      artist: params.artist,
      songTitle: params.songTitle,
      viewCount: params.viewCount ?? null,
      state: 'downloading',
      dateCreated: Math.floor(Date.now() / 1000),
    }

    this.requests.set(requestId, request)
    this.pushStatus(request)

    const pipeline = params.source === 'youtube' ? this.runYouTube(request) : this.runUsdb(request)
    pipeline.catch(err => this.fail(request, err))

    return requestId
  }

  static getBulk (): BulkAcquisition | null {
    return this.bulk
  }

  /** the library as something a playlist entry can be compared against */
  private static matchIndex () {
    const { songs, artists } = Library.get()

    return buildLibraryMatchIndex(songs.result.map((songId: number) => ({
      songId,
      title: songs.entities[songId].title,
      artist: artists.entities[songs.entities[songId].artistId]?.name ?? '',
    })))
  }

  /**
   * What a bulk import would do, decided before any of it happens.
   *
   * Pure on purpose: this is the part that can be wrong in a way nobody
   * notices — a song downloaded twice, an original recording nobody can sing
   * to, a name read backwards — and it is the part worth being able to test
   * without a network, a disk, or a database.
   */
  static planBulk (playlist: PlaylistImport, index: ReturnType<typeof buildLibraryMatchIndex>): BulkAcquisitionItem[] {
    const seen = new Set<string>()
    const items: BulkAcquisitionItem[] = []

    for (const entry of playlist.entries) {
      // the client filters these out too; this is not a second opinion, it is
      // the only one that counts
      if (!YOUTUBE_ID_RE.test(entry.id) || !isKaraokeUpload(entry)) continue
      if (seen.has(entry.id)) continue
      seen.add(entry.id)

      const meta = resolveTrackMeta(entry, index)
      const songId = matchInLibrary(meta, index)

      items.push({
        id: entry.id,
        artist: meta.artist,
        title: meta.title,
        isAmbiguous: meta.isAmbiguous,
        // listed rather than silently dropped: "which of these did I already
        // have" is half of what the admin wanted to know
        state: songId === null ? 'waiting' : 'skipped',
        detail: songId === null ? undefined : 'already in the library',
      })
    }

    return items
  }

  /**
   * Download everything in a playlist the library does not already have.
   *
   * Only entries that are already karaoke tracks: an original recording cannot
   * be sung to, and picking a karaoke version of one unattended means picking
   * whatever a search happened to return first. Those stay one tap each.
   *
   * Nothing here is queued. Forty songs into a room's queue is not what the
   * admin filling a library meant, and the pitch questions the singer flow
   * asks have no answer without a singer.
   */
  static startBulk ({ roomId, playlist }: { roomId: number, playlist: PlaylistImport }): BulkAcquisition {
    return this.startBulkJob({
      roomId,
      playlistId: playlist.playlistId,
      playlistTitle: playlist.title,
      items: AcquisitionManager.planBulk(playlist, this.matchIndex()),
      entries: new Map(playlist.entries.map(entry => [entry.id, entry])),
    })
  }

  /**
   * Download the songs an imported repertoire named that this library does
   * not have.
   *
   * The same job as a playlist import, from a different list. It deliberately
   * does NOT go through planBulk: that filter asks whether a YouTube entry
   * looks like a karaoke upload, which is the right question for a stranger's
   * playlist and the wrong one here — every song on this list is already a
   * karaoke file sitting in somebody's library, and its artist and title were
   * read there rather than guessed from an uploader's title. So they arrive
   * un-ambiguous and skip the MusicBrainz corroboration too.
   */
  static startBulkFromSongs ({ roomId, title, songs }: {
    roomId: number
    title: string
    songs: { sourceId: string, artist: string, title: string }[]
  }): BulkAcquisition {
    const seen = new Set<string>()
    const items: BulkAcquisitionItem[] = []
    const entries = new Map<string, PlaylistImportEntry>()

    for (const song of songs) {
      if (!YOUTUBE_ID_RE.test(song.sourceId) || seen.has(song.sourceId)) continue
      seen.add(song.sourceId)

      items.push({ id: song.sourceId, artist: song.artist, title: song.title, state: 'waiting', isAmbiguous: false })
      entries.set(song.sourceId, { id: song.sourceId, title: [song.artist, song.title].filter(Boolean).join(' - ') })
    }

    if (!items.length) {
      throw new MessageError(422, 'server.acquisition.nothingFetchable')
    }

    return this.startBulkJob({ roomId, playlistId: '', playlistTitle: title, items, entries })
  }

  private static startBulkJob ({ roomId, playlistId, playlistTitle, items, entries }: {
    roomId: number
    playlistId: string
    playlistTitle: string
    items: BulkAcquisitionItem[]
    entries: Map<string, PlaylistImportEntry>
  }): BulkAcquisition {
    if (this.bulk?.isRunning) {
      throw new MessageError(409, 'server.acquisition.bulkAlreadyRunning')
    }

    const job: BulkAcquisition = {
      jobId: crypto.randomUUID(),
      playlistId,
      playlistTitle,
      items,
      isRunning: items.some(item => item.state === 'waiting'),
      isStopping: false,
      dateCreated: Math.floor(Date.now() / 1000),
    }

    this.bulk = job
    this.bulkRoomId = roomId

    if (job.isRunning) {
      this.runBulk(job, entries).catch((err: Error) => {
        job.error = err.message
        job.isRunning = false
        log.error('bulk import %s failed: %s', job.jobId, err.message)
        this.pushBulk()
      })
    }

    this.pushBulk()
    return job
  }

  /** stop after the song currently downloading; killing yt-dlp mid-file would leave a partial */
  static stopBulk (): BulkAcquisition | null {
    if (this.bulk?.isRunning) {
      this.bulk.isStopping = true
      this.pushBulk()
    }

    return this.bulk
  }

  /**
   * One song at a time, on purpose (see `bulk` above), and never stopping on a
   * failure: a playlist with one deleted video in it is still worth the other
   * thirty-nine.
   */
  private static async runBulk (job: BulkAcquisition, entries: Map<string, PlaylistImportEntry>): Promise<void> {
    for (const item of job.items) {
      if (item.state !== 'waiting') continue

      if (job.isStopping) {
        item.state = 'stopped'
        item.detail = 'stopped before this one'
        continue
      }

      const index = this.matchIndex()

      // Asked only for the readings the library could not settle, and asked
      // before the duplicate check rather than after: a title read backwards
      // is also a title that fails to recognise the song it already is.
      const meta = await corroborate(item, index, musicBrainz)
      if (meta.artist !== item.artist || meta.title !== item.title) {
        log.info('MusicBrainz reads "%s - %s" as "%s - %s"', item.artist, item.title, meta.artist, meta.title)
        item.artist = meta.artist
        item.title = meta.title
        item.isAmbiguous = meta.isAmbiguous
      }

      // re-checked here rather than trusted from the plan: the library has
      // been changing while this ran, not least because of this very job
      const songId = matchInLibrary(item, index)
      if (songId !== null) {
        item.state = 'skipped'
        item.detail = 'already in the library'
        this.pushBulk()
        continue
      }

      item.state = 'downloading'
      this.pushBulk()

      try {
        const entry = entries.get(item.id)
        const reg = await this.fetchYouTubeSong({
          videoId: item.id,
          workId: `bulk-${job.jobId}-${item.id}`,
          artist: item.artist || UNKNOWN_ARTIST,
          songTitle: item.title,
          fallbackTitle: entry?.title ?? item.title,
        })

        SongReview.markPending(reg.songId, {
          sourceTitle: entry?.title ?? item.title,
          // an import job is not a playlist, and its rows should say so rather
          // than claiming an empty one
          playlistId: job.playlistId || null,
          isAmbiguous: item.isAmbiguous,
        })

        this.notifyLibrary(reg)

        if (reg.isNewSong) {
          Categories.categorizeSong(reg.songId).catch((err: Error): undefined => {
            log.warn('could not categorize bulk-imported song %s: %s', reg.songId, err.message)
            return undefined
          })
        }

        item.state = 'done'
      } catch (err) {
        item.state = 'error'
        item.detail = (err as Error).message
        log.error('bulk import %s: %s failed: %s', job.jobId, item.id, item.detail)
      }

      this.pushBulk()
    }

    job.isRunning = false
    this.pushBulk()

    const done = job.items.filter(i => i.state === 'done').length
    log.info('bulk import %s finished: %d downloaded, %d skipped, %d failed',
      job.jobId, done,
      job.items.filter(i => i.state === 'skipped').length,
      job.items.filter(i => i.state === 'error').length)
  }

  private static pushBulk (): void {
    if (!this.bulk || this.bulkRoomId === null) return

    this.io?.to(Rooms.prefix(this.bulkRoomId)).emit('action', {
      type: ACQUISITION_BULK_PUSH,
      payload: this.bulk,
    })
  }

  static get (requestId: string): AcquisitionRequest | undefined {
    return this.requests.get(requestId)
  }

  private static async runYouTube (request: AcquisitionRequest): Promise<void> {
    const reg = await this.fetchYouTubeSong({
      videoId: request.result.id,
      workId: request.requestId,
      artist: request.artist,
      songTitle: request.songTitle,
      fallbackTitle: request.result.title,
      onPublishing: () => this.setState(request, 'publishing'),
      onRegistering: () => this.setState(request, 'registering'),
    })

    await this.queueAndFinish(request, reg)
  }

  /**
   * Download one YouTube video and file it in the library, with no opinion
   * about who wanted it or what happens next.
   *
   * Shared by the one-at-a-time flow and the bulk import, which differ only in
   * what they do afterwards: one queues the song for the singer who asked,
   * the other holds it for review.
   */
  private static async fetchYouTubeSong ({ videoId, workId, artist, songTitle, fallbackTitle, onPublishing, onRegistering }: {
    videoId: string
    /** anything unique; names the staging directory */
    workId: string
    artist?: string
    songTitle?: string
    fallbackTitle: string
    onPublishing?: () => void
    onRegistering?: () => void
  }): Promise<RegisterResult> {
    if (!YOUTUBE_ID_RE.test(videoId)) {
      throw new Error('invalid YouTube video id')
    }

    const { paths } = Prefs.get()
    const pathId = paths.result[0]
    if (typeof pathId !== 'number') {
      throw new Error('no library path configured to publish into')
    }

    const basePath = paths.entities[pathId].path
    const stagingDir = path.join(basePath, '_staging', workId)
    await fsPromises.mkdir(stagingDir, { recursive: true })

    const stagedFile = path.join(stagingDir, `${videoId}.mp4`)
    // NOTE: must end in .mp4 (not e.g. "*.mp4.downloading") — yt-dlp's
    // --merge-output-format mp4 enforces its own final extension on the -o
    // template, so a tmp path whose extension it wouldn't otherwise produce
    // gets silently rewritten out from under a naive rename(). The staging
    // dir is already unique per requestId, so a random infix is enough.
    const tmpFile = path.join(stagingDir, `.tmp-${videoId}-${crypto.randomBytes(4).toString('hex')}.mp4`)

    try {
      // ---- downloading ----
      const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`
      await this.worker.download(url, stagedFile, tmpFile)

      // ---- publishing (atomic move into the real library path) ----
      onPublishing?.()
      // Publish as "Artist - Title---videoId" when the metadata is known, so
      // MetaParser derives exactly those (and normalizes articles: "The
      // Beatles" -> "Beatles, The", matching the rest of the library).
      // Deliberately NOT metadataOverride: parsing the canonical filename
      // keeps a later rescan idempotent instead of silently re-deriving
      // something different.
      const baseName = artist && songTitle
        ? `${asFilenamePart(artist)} - ${asFilenamePart(songTitle)}`
        : asFilenamePart(fallbackTitle)
      const destRelPath = `${withSourceIdSuffix(baseName, videoId)}.mp4`
      const finalPath = await publishAtomically(stagedFile, pathId, destRelPath)

      // ---- registering (point registration; no full library scan) ----
      onRegistering?.()
      return await registerMedia(finalPath, pathId)
    } finally {
      await fsPromises.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * UltraStar/USDB path: song.txt (lyrics+timing) + a community-posted
   * YouTube link (USDB never hosts audio itself) -> extracted audio +
   * CDGSharp-rendered .cdg, published as a pair.
   *
   * NOTE: every USDB call below requires an authenticated session — verified
   * live against usdb.animux.de on 2026-08-13 (see UsdbClient.ts). Without
   * USDB_USERNAME/USDB_PASSWORD configured, this fails fast with a clear
   * error instead of hanging or silently returning nothing.
   */
  private static async runUsdb (request: AcquisitionRequest): Promise<void> {
    const usdbId = request.result.id
    if (!/^\d+$/.test(usdbId)) {
      throw new Error('invalid USDB song id')
    }

    const { paths } = Prefs.get()
    const pathId = paths.result[0]
    if (typeof pathId !== 'number') {
      throw new Error('no library path configured to publish into')
    }

    const basePath = paths.entities[pathId].path
    const stagingDir = path.join(basePath, '_staging', request.requestId)
    await fsPromises.mkdir(stagingDir, { recursive: true })

    try {
      // ---- downloading: song.txt + locate a source video ----
      const songTxt = await this.usdb.fetchSongTxt(usdbId)
      const song = parseUltraStarHeaders(songTxt) // throws a clear error on malformed song.txt

      const youtubeLinks = await this.usdb.fetchYoutubeLinks(usdbId)
      if (!youtubeLinks.length) {
        throw new Error(`no YouTube link found in USDB comments for song ${usdbId}`)
      }
      const videoId = youtubeLinks[0].videoId

      const rand = () => crypto.randomBytes(4).toString('hex')
      const videoFile = path.join(stagingDir, `${videoId}.mp4`)
      const videoTmp = path.join(stagingDir, `.tmp-${videoId}-${rand()}.mp4`)
      await this.worker.download(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, videoFile, videoTmp)

      // ---- processing: extract audio, generate CD+G from song.txt ----
      this.setState(request, 'processing')

      const audioFile = path.join(stagingDir, `${videoId}.m4a`)
      const audioTmp = path.join(stagingDir, `.tmp-${videoId}-${rand()}.m4a`)
      await this.worker.extractAudio(videoFile, audioFile, audioTmp)

      const lrc = ultraStarToLrc(songTxt)
      const cdgFile = path.join(stagingDir, `${videoId}.cdg`)
      const cdgTmp = path.join(stagingDir, `.tmp-${videoId}-${rand()}.cdg`)
      await this.cdgWorker.convertLrc(lrc, cdgFile, cdgTmp)

      // ---- publishing: audio + .cdg as a matching-basename pair ----
      this.setState(request, 'publishing')
      const baseName = withSourceIdSuffix(`${sanitizePathSegment(song.artist)} - ${sanitizePathSegment(song.title)}`, videoId)
      const finalAudioPath = await publishAtomically(audioFile, pathId, `${baseName}.m4a`)
      await publishAtomically(cdgFile, pathId, `${baseName}.cdg`)

      // keep song.txt beside the media: it carries the melody note by note,
      // which the CD+G rendering throws away (it only needs the words and
      // their timing). Without it the notes cannot be shown later.
      const songTxtFile = path.join(stagingDir, `${videoId}.song.txt`)
      await fsPromises.writeFile(songTxtFile, songTxt, 'utf8')
      await publishAtomically(songTxtFile, pathId, `${baseName}.song.txt`)

      // ---- registering (point registration; the .cdg sidecar is now in
      // place, so probeMedia/resolveMedia's getCdgName() lookup finds it).
      // song.txt already gave us the correct artist/title — never let
      // MetaParser re-derive them from the constructed filename, which
      // contains a SECOND "artist - title"-shaped delimiter plus the
      // "---videoId" suffix and can misparse (see MediaRegistrar.ts) ----
      this.setState(request, 'registering')
      const reg = await registerMedia(finalAudioPath, pathId, { artist: song.artist, title: song.title })

      await this.queueAndFinish(request, reg)
    } finally {
      await fsPromises.rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /**
   * Shared tail for every acquisition source: queue with preserved
   * room/user/pitch identity, register the pitch job if needed (mirrors what
   * QUEUE_ADD's socket handler does — acquisition never goes through that
   * handler), push library + queue updates, mark 'queued'.
   */
  private static async queueAndFinish (request: AcquisitionRequest, reg: RegisterResult): Promise<void> {
    request.songId = reg.songId
    request.mediaId = reg.mediaId

    const queueId = Queue.add({
      roomId: request.roomId,
      songId: reg.songId,
      userId: request.userId,
      pitchSemitones: request.pitchSemitones,
    })
    request.queueId = queueId

    if (request.pitchSemitones !== 0) {
      try {
        await PitchManager.request({
          mediaId: reg.mediaId,
          pitchSemitones: request.pitchSemitones,
          queueId,
          roomId: request.roomId,
        })
      } catch (err) {
        log.error('pitch registration failed for acquired song %s: %s', reg.mediaId, (err as Error).message)
      }
    }

    if (typeof request.viewCount === 'number') setViewCount(reg.mediaId, request.viewCount)

    this.notifyLibrary(reg)

    this.io.to(Rooms.prefix(request.roomId)).emit('action', {
      type: QUEUE_PUSH,
      payload: Queue.get(request.roomId),
    })

    this.setState(request, 'queued')

    // Categorize in the background: MusicBrainz is rate limited to ~1 request
    // per second and this needs two of them, which is far too long to keep a
    // singer waiting on a song that is already queued and playable. Failures
    // are logged and ignored — a missing category must never turn a successful
    // acquisition into a failed one.
    if (reg.isNewSong) {
      Categories.categorizeSong(reg.songId)
        .then((categories): undefined => {
          if (categories.length) {
            this.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
          }
          return undefined
        })
        .catch((err: Error): undefined => {
          log.warn('could not categorize new song %s: %s', reg.songId, err.message)
          return undefined
        })
    }
  }

  /**
   * Same LIBRARY_PUSH vs LIBRARY_PUSH_SONG distinction pitch/scan code
   * already has to respect (see prompt_de_implementacion.md #38):
   * LIBRARY_PUSH_SONG can't introduce a brand new songId into
   * `songs.result` client-side, so a genuinely new song/artist needs the
   * full LIBRARY_PUSH.
   */
  private static notifyLibrary (reg: { songId: number, isNewSong: boolean, isNewArtist: boolean }): void {
    Library.cache.version = null // invalidate

    if (reg.isNewSong || reg.isNewArtist) {
      this.io.emit('action', { type: LIBRARY_PUSH, payload: Library.get() })
    } else {
      this.io.emit('action', { type: LIBRARY_PUSH_SONG, payload: Library.getSong(reg.songId) })
    }
  }

  private static fail (request: AcquisitionRequest, err: unknown): void {
    request.error = (err as Error).message
    this.setState(request, 'error')
    log.error('acquisition %s failed: %s', request.requestId, request.error)
  }

  private static setState (request: AcquisitionRequest, state: AcquisitionState): void {
    request.state = state
    this.pushStatus(request)
  }

  private static pushStatus (request: AcquisitionRequest): void {
    this.io?.to(Rooms.prefix(request.roomId)).emit('action', {
      type: ACQUISITION_PUSH,
      payload: request,
    })
  }
}

export default AcquisitionManager
