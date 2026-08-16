import AcquisitionManager from './AcquisitionManager.js'
import Rooms from '../Rooms/Rooms.js'
import { isValidPitch } from '../../shared/pitch.js'
import { ACQUISITION_SEARCH, ACQUISITION_PREVIEW, ACQUISITION_ADD } from '../../shared/actionTypes.js'

const MAX_QUERY_LENGTH = 200

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
