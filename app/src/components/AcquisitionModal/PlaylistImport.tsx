import React, { useMemo } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Icon from 'components/Icon/Icon'
import Button from 'components/Button/Button'
import { formatDuration } from 'lib/dateTime'
import { bulkImportPlaylist, stopBulkImport } from 'routes/Library/modules/acquisition'
import { playlistUrl } from 'shared/youtubePlaylist'
import {
  buildLibraryMatchIndex,
  guessTrackMeta,
  isKaraokeUpload,
  matchInLibrary,
  type PlaylistTrackMeta,
} from 'shared/playlistMatch'
import type { PlaylistImport as Playlist, PlaylistImportEntry } from 'shared/types'
import styles from './PlaylistImport.css'

interface PlaylistImportProps {
  playlist: Playlist
  /** go looking for a karaoke version of a song the library doesn't have */
  onFind(meta: PlaylistTrackMeta, entryTitle: string): void
  /** the entry is already a karaoke track: offer that very video */
  onGet(entry: PlaylistImportEntry, meta: PlaylistTrackMeta): void
  /** show a song the library already has, by the name the library knows it by */
  onOpen(libraryTitle: string): void
}

/**
 * Someone's playlist, answered against the library: which of these can I sing
 * tonight, and what would it take to sing the rest.
 *
 * The comparison happens here, on the client, against the library already in
 * the store — which is not only cheaper than asking the server, it is what
 * keeps the list honest: a song still downloading moves from one half of this
 * list to the other by itself, the moment LIBRARY_PUSH arrives.
 *
 * What a missing song does when tapped depends on what it is. An entry that is
 * already a karaoke track is the version its owner chose, so it offers that
 * exact video; an entry that is the original recording cannot be sung to, so it
 * opens a search for a karaoke version of it. Getting that backwards is what
 * made a karaoke playlist produce a screen of unrelated results.
 *
 * For a singer, nothing downloads from here: both roads lead to the same
 * preview and pitch flow as any other acquisition, one song at a time.
 * Importing forty songs unattended would fill a party's queue with versions
 * nobody chose.
 *
 * An admin filling a library is doing something else, and gets the bulk button
 * for it — no preview, no queue, and every song held afterwards for the check
 * the preview would have been.
 */
const PlaylistImport = ({ playlist, onFind, onGet, onOpen }: PlaylistImportProps) => {
  const dispatch = useAppDispatch()
  const songs = useAppSelector(state => state.songs)
  const artists = useAppSelector(state => state.artists)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const { bulk, isBulkStarting, bulkError } = useAppSelector(state => state.acquisition)

  const index = useMemo(() => buildLibraryMatchIndex(
    songs.result.map(songId => ({
      songId,
      title: songs.entities[songId].title,
      artist: artists.entities[songs.entities[songId].artistId]?.name ?? '',
    })),
  ), [songs, artists])

  const rows = useMemo(() => playlist.entries.map((entry) => {
    const meta = guessTrackMeta(entry)
    const songId = matchInLibrary(meta, index)

    return {
      entry,
      meta,
      songId,
      // a karaoke playlist is a list of versions someone already chose; an
      // ordinary one is a list of songs still needing a version found
      isKaraoke: isKaraokeUpload(entry),
      // what the playlist calls this song, tidied up where it can be
      label: meta.artist ? `${meta.artist} — ${meta.title}` : (meta.title || entry.title),
      libraryTitle: songId === null ? '' : songs.entities[songId].title,
      inLibrary: songId === null
        ? null
        : `${artists.entities[songs.entities[songId].artistId]?.name ?? ''} — ${songs.entities[songId].title}`,
    }
  }), [playlist, index, songs, artists])

  const missing = rows.filter(row => row.songId === null)
  const found = rows.filter(row => row.songId !== null)
  // against what the listing read, not what survived it: one deleted video in
  // a playlist of eight is not the same news as a playlist cut off at 100
  const isTruncated = playlist.total !== null && playlist.total > playlist.read

  // only the entries that already ARE karaoke tracks: an original recording
  // cannot be sung to, and choosing a karaoke version of one unattended means
  // taking whatever a search happened to return first
  const bulkable = missing.filter(row => row.isKaraoke)

  const isThisPlaylist = bulk?.playlistId === playlist.playlistId
  const isThisPlaylistRunning = isThisPlaylist && !!bulk?.isRunning
  // everything that was going to be downloaded, including what a stop cut
  // short — so the denominator does not shrink under the admin who stopped it
  const bulkTotal = isThisPlaylist ? bulk.items.filter(item => item.state !== 'skipped').length : 0
  const bulkDone = isThisPlaylist ? bulk.items.filter(item => item.state === 'done').length : 0
  const bulkFailed = isThisPlaylist ? bulk.items.filter(item => item.state === 'error').length : 0
  const downloading = isThisPlaylist ? bulk.items.find(item => item.state === 'downloading') : undefined
  const bulkCurrent = downloading && [downloading.artist, downloading.title].filter(Boolean).join(' — ')

  const handleBulk = () => {
    // minutes of downloading that writes files to disk, so it is asked for
    // once and explicitly rather than started by a stray tap
    const message = `Download ${bulkable.length} karaoke tracks from this playlist?\n\n`
      + `They are downloaded one at a time and nothing is added to the queue. `
      + `Each one is held for you to check its artist and title.`

    if (window.confirm(message)) dispatch(bulkImportPlaylist(playlistUrl(playlist.playlistId)))
  }

  return (
    <div className={styles.container}>
      <div className={styles.summary}>
        {playlist.title && <div className={styles.playlistTitle} translate='no'>{playlist.title}</div>}

        {rows.length > 0 && (
          <div className={styles.counts}>
            {found.length}
            {' of '}
            {rows.length}
            {' already in the library'}
          </div>
        )}

        {/* said out loud rather than left to look like the whole playlist */}
        {isTruncated && (
          <div className={styles.counts}>
            {`Showing the first ${playlist.read} of ${playlist.total} songs.`}
          </div>
        )}
      </div>

      {rows.length === 0 && (
        <p className={styles.empty}>There are no songs to read in this playlist.</p>
      )}

      {/* Only an admin sees this, and only the server's copy of that rule
          decides anything. A bulk import writes to the library under guessed
          names with nobody confirming them one at a time — the person who
          cleans that up is the person who can already retag and delete. */}
      {isAdmin && bulkable.length > 0 && !isThisPlaylistRunning && (
        <div className={styles.bulk}>
          <Button
            variant='primary'
            className={styles.bulkButton}
            disabled={isBulkStarting}
            onClick={handleBulk}
          >
            {isBulkStarting ? 'Starting…' : `Download all ${bulkable.length} missing`}
          </Button>
          <p className={styles.hint}>
            Karaoke tracks only, one at a time, nothing queued. Each one waits for
            you to check its artist and title afterwards.
          </p>
        </div>
      )}

      {isAdmin && bulkError && <p className={styles.bulkError}>{bulkError}</p>}

      {/* pushed to the whole room, because that is where acquisition state
          goes — but a singer with this playlist open has no use for a progress
          bar and no way to act on the Stop button under it */}
      {isAdmin && isThisPlaylist && bulk && (
        <div className={styles.bulk}>
          <div className={styles.bulkCounts}>
            {bulk.isRunning
              ? `Downloading ${bulkDone + 1} of ${bulkTotal}…`
              : `${bulkDone} of ${bulkTotal} downloaded`}
            {bulkFailed > 0 && ` · ${bulkFailed} failed`}
          </div>
          {bulkCurrent && <div className={styles.bulkCurrent} translate='no'>{bulkCurrent}</div>}
          {bulk.isRunning && (
            <Button onClick={() => dispatch(stopBulkImport())} disabled={bulk.isStopping}>
              {bulk.isStopping ? 'Stopping after this one…' : 'Stop'}
            </Button>
          )}
          {!bulk.isRunning && bulkDone > 0 && (
            <p className={styles.hint}>
              Waiting for you in the library, under the flag in the search bar.
            </p>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <>
          <h2 className={styles.heading}>
            {`Not here yet (${missing.length})`}
          </h2>
          <p className={styles.hint}>
            Tap one to add it — you get to watch it first, and pick your pitch.
          </p>
          <ul className={styles.rows}>
            {missing.map(({ entry, meta, label, isKaraoke }) => (
              <li key={entry.id}>
                <button
                  type='button'
                  className={styles.row}
                  onClick={() => isKaraoke ? onGet(entry, meta) : onFind(meta, entry.title)}
                  aria-label={isKaraoke ? `Add ${label}` : `Find a karaoke version of ${label}`}
                >
                  {entry.thumbnail && <img src={entry.thumbnail} alt='' className={styles.thumbnail} />}
                  <div className={styles.info}>
                    <div className={styles.label} translate='no'>{label}</div>
                    {entry.uploader && <div className={styles.sub} translate='no'>{entry.uploader}</div>}
                  </div>
                  {typeof entry.durationSeconds === 'number' && (
                    <div className={styles.duration}>{formatDuration(entry.durationSeconds)}</div>
                  )}
                  {/* the entry itself when it is already a karaoke track, a
                      search when it is the original recording — offering the
                      wrong one of those is what made this list look useless */}
                  <Icon icon={isKaraoke ? 'DOWNLOAD' : 'MAGNIFIER'} size={20} className={styles.action} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {found.length > 0 && (
        <>
          <h2 className={styles.heading}>
            {`Ready to sing (${found.length})`}
          </h2>
          <ul className={styles.rows}>
            {found.map(({ entry, label, libraryTitle, inLibrary }) => (
              <li key={entry.id}>
                <button
                  type='button'
                  className={styles.row}
                  onClick={() => onOpen(libraryTitle)}
                >
                  {entry.thumbnail && <img src={entry.thumbnail} alt='' className={styles.thumbnail} />}
                  <div className={styles.info}>
                    <div className={styles.label} translate='no'>{label}</div>
                    {/* the library's own name for it: how the match can be
                        checked, and what to look for after tapping */}
                    <div className={styles.sub} translate='no'>{inLibrary}</div>
                  </div>
                  <Icon icon='NAV_LIBRARY' size={20} className={styles.action} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default PlaylistImport
