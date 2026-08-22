import AcquisitionManager from './AcquisitionManager.js'
import Rooms from '../Rooms/Rooms.js'
import { isValidPitch } from '../../shared/pitch.js'
import { ACQUISITION_SEARCH, ACQUISITION_PLAYLIST, ACQUISITION_BULK, ACQUISITION_PREVIEW, ACQUISITION_ADD } from '../../shared/actionTypes.js'

const MAX_QUERY_LENGTH = 200
// a share link with every tracking parameter YouTube attaches is still well
// under this; anything longer is not a link anyone copied
const MAX_URL_LENGTH = 2000

const ACTION_HANDLERS = {
  [ACQUISITION_SEARCH]: async (sock, { payload }, acknowledge) => {
    // karaokeOnly defaults on: only an explicit false widens the search to
    // plain music videos (which can't be sung to)
    const { query, source, karaokeOnly = true } = payload ?? {}

    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
      return acknowledge({ type: ACQUISITION_SEARCH + '_ERROR', error: 'Invalid query' })
    }

    if (source !== 'youtube' && source !== 'usdb') {
      return acknowledge({ type: ACQUISITION_SEARCH + '_ERROR', error: `Unsupported source: ${source}` })
    }

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({ type: ACQUISITION_SEARCH + '_ERROR', error: err.message })
    }

    try {
      // USDB requires an authenticated session for every call, including
      // search (verified live 2026-08-13 — see UsdbClient.ts); without
      // USDB_USERNAME/USDB_PASSWORD configured this throws a clear error
      // rather than silently returning nothing
      const results = source === 'youtube'
        ? await AcquisitionManager.searchYouTube(query.trim(), karaokeOnly !== false)
        : await AcquisitionManager.searchUsdb(query.trim())
      acknowledge({ type: ACQUISITION_SEARCH + '_SUCCESS', payload: { results } })
    } catch (err) {
      acknowledge({ type: ACQUISITION_SEARCH + '_ERROR', error: err.message })
    }
  },

  [ACQUISITION_PLAYLIST]: async (sock, { payload }, acknowledge) => {
    const { url } = payload ?? {}

    if (typeof url !== 'string' || !url.trim() || url.length > MAX_URL_LENGTH) {
      return acknowledge({ type: ACQUISITION_PLAYLIST + '_ERROR', error: 'Invalid playlist link' })
    }

    // Reading a public playlist touches no room state, so this check is not
    // there to protect anything — it is there because ACQUISITION_SEARCH has
    // it. Half of what an import is for is fetching the songs that turned out
    // to be missing, and that half needs a room; letting the listing through
    // without one would just move the refusal to the next tap.
    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({ type: ACQUISITION_PLAYLIST + '_ERROR', error: err.message })
    }

    try {
      // acknowledged rather than pushed: this is one person looking at their
      // own playlist, and nobody else in the room has any use for the answer
      const playlist = await AcquisitionManager.fetchPlaylist(url.trim())
      acknowledge({ type: ACQUISITION_PLAYLIST + '_SUCCESS', payload: { playlist } })
    } catch (err) {
      acknowledge({ type: ACQUISITION_PLAYLIST + '_ERROR', error: err.message })
    }
  },

  /**
   * Download everything in a playlist that isn't here yet — admin only.
   *
   * The gate is not about who may spend bandwidth. It is about who may write
   * to the library: a bulk import files songs under guessed names with nobody
   * confirming them one by one, and the person who has to clean that up is the
   * same person who can already retag and delete songs.
   */
  [ACQUISITION_BULK]: async (sock, { payload }, acknowledge) => {
    if (!sock.user.isAdmin) {
      return acknowledge({ type: ACQUISITION_BULK + '_ERROR', error: 'Only an admin can import a whole playlist.' })
    }

    const { url, stop } = payload ?? {}

    if (stop === true) {
      return acknowledge({ type: ACQUISITION_BULK + '_SUCCESS', payload: { bulk: AcquisitionManager.stopBulk() } })
    }

    if (typeof url !== 'string' || !url.trim() || url.length > MAX_URL_LENGTH) {
      return acknowledge({ type: ACQUISITION_BULK + '_ERROR', error: 'Invalid playlist link' })
    }

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({ type: ACQUISITION_BULK + '_ERROR', error: err.message })
    }

    try {
      // Read again here rather than taking the listing the client is looking
      // at: what gets downloaded is decided from what YouTube says now, not
      // from a payload a browser could have edited.
      const playlist = await AcquisitionManager.fetchPlaylist(url.trim())
      const bulk = AcquisitionManager.startBulk({ roomId: sock.user.roomId, playlist })

      // acknowledged AND pushed: the ack answers the tap, the pushes that
      // follow report a job that outlives the request by many minutes
      acknowledge({ type: ACQUISITION_BULK + '_SUCCESS', payload: { bulk } })
    } catch (err) {
      acknowledge({ type: ACQUISITION_BULK + '_ERROR', error: err.message })
    }
  },

  [ACQUISITION_PREVIEW]: async (sock, { payload }, acknowledge) => {
    const { source, resultId } = payload ?? {}

    if (source !== 'youtube' && source !== 'usdb') {
      return acknowledge({ type: ACQUISITION_PREVIEW + '_ERROR', error: `Unsupported source: ${source}` })
    }

    if (typeof resultId !== 'string' || !resultId) {
      return acknowledge({ type: ACQUISITION_PREVIEW + '_ERROR', error: 'Invalid resultId' })
    }

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({ type: ACQUISITION_PREVIEW + '_ERROR', error: err.message })
    }

    try {
      const preview = await AcquisitionManager.resolvePreview(source, resultId)
      acknowledge({ type: ACQUISITION_PREVIEW + '_SUCCESS', payload: preview })
    } catch (err) {
      acknowledge({ type: ACQUISITION_PREVIEW + '_ERROR', error: err.message })
    }
  },

  [ACQUISITION_ADD]: async (sock, { payload }, acknowledge) => {
    const { source, resultId, title, artist, songTitle, viewCount, pitchSemitones = 0, query = '' } = payload ?? {}

    if (source !== 'youtube' && source !== 'usdb') {
      return acknowledge({ type: ACQUISITION_ADD + '_ERROR', error: `Unsupported source: ${source}` })
    }

    if (typeof resultId !== 'string' || !resultId) {
      return acknowledge({ type: ACQUISITION_ADD + '_ERROR', error: 'Invalid resultId' })
    }

    if (typeof title !== 'string' || !title.trim()) {
      return acknowledge({ type: ACQUISITION_ADD + '_ERROR', error: 'Invalid title' })
    }

    if (!isValidPitch(pitchSemitones)) {
      return acknowledge({ type: ACQUISITION_ADD + '_ERROR', error: 'Invalid pitchSemitones' })
    }

    try {
      await Rooms.validate(sock.user.roomId, null, { validatePassword: false })
    } catch (err) {
      return acknowledge({ type: ACQUISITION_ADD + '_ERROR', error: err.message })
    }

    // fire-and-forget: never hold the ack open for a multi-second download,
    // same principle as QUEUE_ADD/pitch registration
    const requestId = AcquisitionManager.start({
      roomId: sock.user.roomId,
      userId: sock.user.userId,
      pitchSemitones,
      source,
      query: String(query).slice(0, MAX_QUERY_LENGTH),
      resultId,
      title: title.trim(),
      artist: typeof artist === 'string' ? artist.trim().slice(0, 200) : undefined,
      songTitle: typeof songTitle === 'string' ? songTitle.trim().slice(0, 200) : undefined,
      viewCount: typeof viewCount === 'number' && Number.isFinite(viewCount) ? viewCount : null,
    })

    acknowledge({ type: ACQUISITION_ADD + '_SUCCESS', payload: { requestId } })
  },
}

export default ACTION_HANDLERS
