import React, { useMemo } from 'react'
import { useAppSelector } from 'store/hooks'
import Icon from 'components/Icon/Icon'
import { formatDuration } from 'lib/dateTime'
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
 * Either way nothing downloads from here: both roads lead to the same preview
 * and pitch flow as any other acquisition, one song at a time. Importing forty
 * songs unattended would fill the library with versions nobody chose.
 */
const PlaylistImport = ({ playlist, onFind, onGet, onOpen }: PlaylistImportProps) => {
  const songs = useAppSelector(state => state.songs)
  const artists = useAppSelector(state => state.artists)

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
