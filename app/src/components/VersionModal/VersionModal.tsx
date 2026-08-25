import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
import Modal from 'components/Modal/Modal'
import Button from 'components/Button/Button'
import Spinner from 'components/Spinner/Spinner'
import { formatDuration } from 'lib/dateTime'
import { useT } from 'lib/i18n'
import styles from './VersionModal.css'

export interface SongVersion {
  mediaId: number
  duration: number
  isPreferred: boolean
  mediaType: 'cdg' | 'mp4'
  sourceId: string | null
}

interface VersionModalProps {
  songId: number
  songTitle: string
  onConfirm(mediaId: number): void
  onClose(): void
}

/**
 * Which recording of a song the singer wants, when the library holds more than
 * one. Before the queue could store a mediaId, playback always resolved to
 * whichever version happened to be `isPreferred`, so extra versions existed on
 * disk but were unreachable — the reason this exists.
 *
 * Only shown when there is an actual choice to make (see SongList): a modal
 * asking to pick between one option is just friction.
 */
const VersionModal = ({ songId, songTitle, onConfirm, onClose }: VersionModalProps) => {
  const t = useT()
  const [versions, setVersions] = useState<SongVersion[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [previewing, setPreviewing] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`${document.baseURI}api/song/${songId}/versions`, { credentials: 'same-origin' })
      .then((res): Promise<{ versions: SongVersion[] }> => {
        if (!res.ok) throw new Error(`Could not load versions (${res.status})`)
        return res.json()
      })
      .then((data): undefined => {
        if (cancelled) return undefined
        setVersions(data.versions)
        // default to the version playback would have chosen on its own
        setSelected((data.versions.find(v => v.isPreferred) ?? data.versions[0])?.mediaId ?? null)
        return undefined
      })
      .catch((err: Error): undefined => {
        if (!cancelled) setError(err.message)
        return undefined
      })

    return () => {
      cancelled = true
    }
  }, [songId])

  const togglePreview = (mediaId: number) => {
    setSelected(mediaId)
    setPreviewing(current => current === mediaId ? null : mediaId)
  }

  return (
    <Modal
      title={t('version.title')}
      onClose={onClose}
      buttons={(
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant='primary' onClick={() => selected !== null && onConfirm(selected)} disabled={selected === null}>
            {t('version.next')}
          </Button>
        </>
      )}
    >
      <p className={styles.songTitle} translate='no'>{songTitle}</p>

      {!versions && !error && <Spinner />}
      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.list}>
        {versions?.map((v, i) => (
          <li key={v.mediaId} className={clsx(styles.item, selected === v.mediaId && styles.selected)}>
            <button
              type='button'
              className={styles.option}
              onClick={() => setSelected(v.mediaId)}
            >
              <span className={styles.radio}>{selected === v.mediaId ? '◉' : '○'}</span>
              <span className={styles.info}>
                <span className={styles.label}>
                  {t('version.numbered', { number: i + 1 })}
                  {v.isPreferred && <span className={styles.badge}>{t('version.isDefault')}</span>}
                </span>
                <span className={styles.meta}>
                  {formatDuration(v.duration)}
                  {v.sourceId && ` · ${v.sourceId}`}
                </span>
              </span>
            </button>
            <button
              type='button'
              className={styles.previewButton}
              aria-expanded={previewing === v.mediaId}
              onClick={() => togglePreview(v.mediaId)}
            >
              {previewing === v.mediaId ? t('version.hidePreview') : t('version.preview')}
            </button>
            {previewing === v.mediaId && (
              <div className={styles.preview}>
                {v.mediaType === 'mp4'
                  ? (
                      <video
                        src={`${document.baseURI}api/media/${v.mediaId}?type=video&previewSongId=${songId}`}
                        controls
                        autoPlay
                        playsInline
                      />
                    )
                  : (
                      <>
                        <audio
                          src={`${document.baseURI}api/media/${v.mediaId}?type=audio&previewSongId=${songId}`}
                          controls
                          autoPlay
                        />
                        <span>{t('version.audioOnly')}</span>
                      </>
                    )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export default VersionModal
