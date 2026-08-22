import React, { useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import Modal from 'components/Modal/Modal'
import { formatDuration } from 'lib/dateTime'
import { closeSongInfo, setPreferredSong, retagSong, deleteMediaVersion } from 'store/modules/songInfo'
import SongCategories from './SongCategories'
import SongMusicInfo from './SongMusicInfo'
import SongPitchPref from './SongPitchPref'
import { markSongReviewed } from 'store/modules/songReview'
import styles from './SongInfo.css'

interface EditFieldsProps {
  songId: number
  currentArtist: string
  currentTitle: string
}

/**
 * Editing renames the media files as well as the database row — filenames are
 * what a library rescan re-derives metadata from, so a database-only edit
 * would silently revert (see server/Media/retagSong.ts).
 */
const EditFields = ({ songId, currentArtist, currentTitle }: EditFieldsProps) => {
  const dispatch = useAppDispatch()
  const [artist, setArtist] = useState(currentArtist)
  const [title, setTitle] = useState(currentTitle)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const isDirty = artist.trim() !== currentArtist || title.trim() !== currentTitle
  const canSave = isDirty && !!artist.trim() && !!title.trim() && !isSaving

  const handleSave = () => {
    setIsSaving(true)
    setSaveError(null)

    dispatch(retagSong({ songId, artist: artist.trim(), title: title.trim() }))
      .unwrap()
      .then((): undefined => {
        setIsSaving(false)
        dispatch(closeSongInfo())
        return undefined
      })
      .catch((err: unknown): undefined => {
        setIsSaving(false)
        setSaveError(err instanceof Error ? err.message : String(err))
        return undefined
      })
  }

  return (
    <div className={styles.editFields}>
      <label className={styles.editLabel}>
        Artist
        <input
          type='text'
          className={styles.editInput}
          value={artist}
          onChange={e => setArtist(e.target.value)}
          placeholder='e.g. Marc Anthony'
        />
      </label>
      <label className={styles.editLabel}>
        Title
        <input
          type='text'
          className={styles.editInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder='e.g. Y hubo alguien'
        />
      </label>

      {saveError && <p className={styles.saveError}>{saveError}</p>}

      <Button variant='primary' onClick={handleSave} disabled={!canSave}>
        {isSaving ? 'Saving…' : 'Save changes'}
      </Button>
      <p className={styles.editHint}>
        Renames the files too, so the change survives a library rescan.
      </p>
    </div>
  )
}

/**
 * A song a bulk playlist import brought in, still waiting to be looked at.
 *
 * This is where the confirmation the bulk download skipped is finally made.
 * The YouTube title it was guessed from is shown because it is the only way to
 * judge the guess without going back to YouTube — and often the only place a
 * misread word survives at all.
 *
 * Marking it reviewed is a separate act from editing it: an admin may well
 * want a second look at something they just retyped.
 */
const PendingReview = ({ songId }: { songId: number }) => {
  const dispatch = useAppDispatch()
  const pending = useAppSelector(state => state.songReview.pending.find(row => row.songId === songId))

  if (!pending) return null

  return (
    <div className={styles.pendingReview}>
      <p className={styles.pendingHeading}>
        {pending.isAmbiguous
          ? 'Downloaded in bulk — nothing in the library confirmed this artist and title.'
          : 'Downloaded in bulk — not checked yet.'}
      </p>
      <p className={styles.pendingSource} translate='no'>{pending.sourceTitle}</p>
      <Button onClick={() => dispatch(markSongReviewed(songId))}>
        Mark reviewed
      </Button>
    </div>
  )
}

const SongInfo = () => {
  const { isLoading, isVisible, songId, media } = useAppSelector(state => state.songInfo)
  const songs = useAppSelector(state => state.songs.entities)
  const artists = useAppSelector(state => state.artists.entities)

  const dispatch = useAppDispatch()
  const handleCloseSongInfo = () => dispatch(closeSongInfo())
  const handlePrefer = (mediaId: number) => dispatch(setPreferredSong({ songId, mediaId, isPreferred: true }))
  const handleRemovePrefer = (mediaId: number) => dispatch(setPreferredSong({ songId, mediaId, isPreferred: false }))

  const handleDelete = (mediaId: number) => {
    const isLast = media.result.length === 1
    const warning = isLast
      ? `Delete the ONLY version of this song?\n\nThe song will be removed from the library and from anyone's queue, and the file will be deleted from disk.`
      : `Delete this version?\n\nThe file is deleted from disk. The other ${media.result.length - 1} version(s) stay.`

    // deleting files is irreversible, so never on a single stray tap
    if (window.confirm(warning)) dispatch(deleteMediaVersion({ songId, mediaId }))
  }

  const song = songId !== null ? songs[songId] : undefined
  const currentArtist = song ? artists[song.artistId]?.name ?? '' : ''
  const currentTitle = song?.title ?? ''

  const mediaDetails = media.result.map((mediaId) => {
    const item = media.entities[mediaId]
    const isPreferred = !!item.isPreferred

    return (
      <div key={item.mediaId} className={styles.media}>
        {item.path + (item.path.indexOf('/') === 0 ? '/' : '\\') + item.relPath}
        <br />
        <span className={styles.label}>Duration: </span>
        {formatDuration(item.duration)}
        <br />
        <span className={styles.label}>Media ID: </span>
        {mediaId}
        <br />
        <span className={styles.label}>Preferred: </span>
        {isPreferred
          && (
            <span>
              <strong>Yes</strong>
&nbsp;
              <a onClick={() => handleRemovePrefer(mediaId)}>(Unset)</a>
            </span>
          )}
        {!isPreferred
          && (
            <span>
              No&nbsp;
              <a onClick={() => handlePrefer(mediaId)}>(Set)</a>
            </span>
          )}
        <br />
        <a className={styles.delete} onClick={() => handleDelete(mediaId)}>
          {media.result.length === 1 ? 'Delete song (last version)' : 'Delete this version'}
        </a>
      </div>
    )
  })

  return (
    <Modal
      visible={isVisible}
      onClose={handleCloseSongInfo}
      title='Song Info'
      scrollable
    >
      <div className={styles.container}>
        {/* Editing renames the media files as well as the database row —
            filenames are what a library rescan re-derives metadata from, so a
            database-only edit would silently revert (see retagSong.ts). */}
        {songId !== null && (
          <EditFields
            // remount per song so the inputs re-seed without a state-setting effect
            key={songId}
            songId={songId}
            currentArtist={currentArtist}
            currentTitle={currentTitle}
          />
        )}

        {songId !== null && <PendingReview songId={songId} />}

        {songId !== null && <SongCategories songId={songId} />}

        {songId !== null && <SongMusicInfo key={songId} songId={songId} />}

        {songId !== null && <SongPitchPref songId={songId} />}

        <p>
          <span className={styles.label}>Song ID: </span>
          {songId}
          <br />
          <span className={styles.label}>Media Files: </span>
          {isLoading ? '?' : media.result.length}
        </p>

        <div className={styles.mediaContainer}>
          {isLoading ? <p>Loading...</p> : mediaDetails}
        </div>

        <div>
          <Button variant='primary' onClick={handleCloseSongInfo}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default SongInfo
