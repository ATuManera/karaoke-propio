import React, { useState } from 'react'
import { useT } from 'lib/i18n'
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
  const t = useT()
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
        {t('songInfo.artist')}
        <input
          type='text'
          className={styles.editInput}
          value={artist}
          onChange={e => setArtist(e.target.value)}
          placeholder={t('songInfo.artistPlaceholder')}
        />
      </label>
      <label className={styles.editLabel}>
        {t('songInfo.songTitle')}
        <input
          type='text'
          className={styles.editInput}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={t('songInfo.titlePlaceholder')}
        />
      </label>

      {saveError && <p className={styles.saveError}>{saveError}</p>}

      <Button variant='primary' onClick={handleSave} disabled={!canSave}>
        {isSaving ? t('common.saving') : t('songInfo.saveChanges')}
      </Button>
      <p className={styles.editHint}>{t('songInfo.renameHint')}</p>
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
  const t = useT()
  const dispatch = useAppDispatch()
  const pending = useAppSelector(state => state.songReview.pending.find(row => row.songId === songId))

  if (!pending) return null

  return (
    <div className={styles.pendingReview}>
      <p className={styles.pendingHeading}>
        {pending.isAmbiguous
          ? t('songInfo.pendingAmbiguous')
          : t('songInfo.pendingUnchecked')}
      </p>
      <p className={styles.pendingSource} translate='no'>{pending.sourceTitle}</p>
      <Button onClick={() => dispatch(markSongReviewed(songId))}>
        {t('songInfo.markReviewed')}
      </Button>
    </div>
  )
}

const SongInfo = () => {
  const t = useT()
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
      ? t('songInfo.confirmDeleteLast')
      : t('songInfo.confirmDeleteVersion', { count: media.result.length - 1 })

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
        <span className={styles.label}>{t('songInfo.duration')}</span>
        {' '}
        {formatDuration(item.duration)}
        <br />
        <span className={styles.label}>{t('songInfo.mediaId')}</span>
        {' '}
        {mediaId}
        <br />
        <span className={styles.label}>{t('songInfo.preferred')}</span>
        {' '}
        {isPreferred
          && (
            <span>
              <strong>{t('common.yes')}</strong>
&nbsp;
              <a onClick={() => handleRemovePrefer(mediaId)}>{t('songInfo.unset')}</a>
            </span>
          )}
        {!isPreferred
          && (
            <span>
              {t('common.no')}
&nbsp;
              <a onClick={() => handlePrefer(mediaId)}>{t('songInfo.set')}</a>
            </span>
          )}
        <br />
        <a className={styles.delete} onClick={() => handleDelete(mediaId)}>
          {media.result.length === 1 ? t('songInfo.deleteLastVersion') : t('songInfo.deleteThisVersion')}
        </a>
      </div>
    )
  })

  return (
    <Modal
      visible={isVisible}
      onClose={handleCloseSongInfo}
      title={t('songInfo.title')}
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
          <span className={styles.label}>{t('songInfo.songId')}</span>
          {' '}
          {songId}
          <br />
          <span className={styles.label}>{t('songInfo.mediaFiles')}</span>
          {' '}
          {isLoading ? '?' : media.result.length}
        </p>

        <div className={styles.mediaContainer}>
          {isLoading ? <p>{t('common.loading')}</p> : mediaDetails}
        </div>

        <div>
          <Button variant='primary' onClick={handleCloseSongInfo}>
            {t('common.done')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default SongInfo
