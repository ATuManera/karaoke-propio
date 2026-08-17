import React, { useMemo } from 'react'
import { useAppSelector } from 'store/hooks'
import Icon from 'components/Icon/Icon'
import { formatDuration } from 'lib/dateTime'
import {
  buildLibraryMatchIndex,
  guessTrackMeta,
  matchInLibrary,
  type PlaylistTrackMeta,
} from 'shared/playlistMatch'
import type { PlaylistImport as Playlist } from 'shared/types'
import styles from './PlaylistImport.css'

interface PlaylistImportProps {
  playlist: Playlist
  /** go looking for a karaoke version of a song the library doesn't have */
  onFind(meta: PlaylistTrackMeta, entryTitle: string): void
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
 * Nothing downloads from here. A missing song opens the same search, preview
 * and pitch flow as any other acquisition, one song at a time — importing
 * forty songs somebody liked in 2011 would fill the library with versions
 * nobody chose.
 */
const PlaylistImport = ({ playlist, onFind, onOpen }: PlaylistImportProps) => {
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
  const isTruncated = playlist.total !== null && playlist.total > playlist.entries.length

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
            {`Showing the first ${playlist.entries.length} of ${playlist.total} songs.`}
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
          <ul className={styles.rows}>
            {missing.map(({ entry, meta, label }) => (
              <li key={entry.id}>
                <button
                  type='button'
                  className={styles.row}
                  onClick={() => onFind(meta, entry.title)}
                >
                  {entry.thumbnail && <img src={entry.thumbnail} alt='' className={styles.thumbnail} />}
                  <div className={styles.info}>
                    <div className={styles.label} translate='no'>{label}</div>
                    {entry.uploader && <div className={styles.sub} translate='no'>{entry.uploader}</div>}
                  </div>
                  {typeof entry.durationSeconds === 'number' && (
                    <div className={styles.duration}>{formatDuration(entry.durationSeconds)}</div>
                  )}
                  <Icon icon='MAGNIFIER' size={20} className={styles.action} />
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
