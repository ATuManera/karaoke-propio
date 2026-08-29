import Media from './Media.js'
import SongReview from '../Library/SongReview.js'
import Categories from '../Categories/Categories.js'
import getLogger from '../lib/Log.js'
import { MEDIA_ADD, MEDIA_CLEANUP, MEDIA_REMOVE, MEDIA_UPDATE } from '../../shared/actionTypes.js'

const log = getLogger('Media')

/**
 * IPC action handlers
 */
export default function (io) { // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    [MEDIA_ADD]: ({ payload }) => {
      const mediaId = Media.add(payload.media)
      SongReview.markPending(payload.media.songId, {
        sourceTitle: payload.pendingReview.sourceTitle,
        playlistId: null,
        isAmbiguous: false,
        origin: 'scan',
      })

      // Categorise it here and now if the shipped reference table knows it.
      // A song found by a folder scan used to arrive with nothing at all and
      // wait for someone to press "categorize" — an online lookup cannot run
      // in this handler, since MusicBrainz permits about one request a second
      // and a scan can add hundreds of files. The reference table is local, so
      // it can, and a library that overlaps it lands browsable straight away.
      try {
        Categories.categorizeFromReference(payload.media.songId)
      } catch (err) {
        // categories are an enhancement; a song still belongs in the library
        log.warn('could not categorize new song %s: %s', payload.media.songId, (err as Error).message)
      }

      return mediaId
    },
    [MEDIA_CLEANUP]: Media.cleanup,
    [MEDIA_REMOVE]: ({ payload }) => Media.remove(payload),
    [MEDIA_UPDATE]: ({ payload }) => Media.update(payload),
  }
}
