import React, { useState } from 'react'
import { useT } from 'lib/i18n'
import Button from 'components/Button/Button'
import Spinner from 'components/Spinner/Spinner'
import HttpApi from 'lib/HttpApi'
import { translateNoteName } from 'lib/noteNames'
import styles from './SongInfo.css'

const api = new HttpApi()

interface Note {
  timeSeconds: number
  durationSeconds: number
  midi: number
  name: string
  text: string
  isGolden: boolean
}

interface Key { tonic: string, tonicEs: string, mode: string, confidence: number }

/**
 * Melody and key, fetched only when asked for.
 *
 * Both are looked up on demand rather than shown by default: the notes require
 * reading a sidecar file and the key decodes audio, and neither is something
 * most people open a song to see.
 */
const SongMusicInfo = ({ songId }: { songId: number }) => {
  const t = useT()
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [range, setRange] = useState<{ lowest: Note | null, highest: Note | null } | null>(null)
  const [songKey, setSongKey] = useState<Key | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoad = () => {
    setIsLoading(true)
    setError(null)

    Promise.all([
      api.get<{ notes: Note[] | null, range: { lowest: Note | null, highest: Note | null } | null }>(`song/${songId}/notes`),
      api.get<{ key: Key | null }>(`song/${songId}/key`),
    ])
      .then(([n, k]): undefined => {
        setNotes(n.notes)
        setRange(n.range)
        setSongKey(k.key)
        setLoaded(true)
        setIsLoading(false)
        return undefined
      })
      .catch((err: Error): undefined => {
        setError(err.message)
        setIsLoading(false)
        return undefined
      })
  }

  return (
    <div className={styles.musicBlock}>
      <span className={styles.label}>{t('music.label')}</span>

      {!loaded && !isLoading && (
        <div><Button onClick={handleLoad}>{t('music.showNotesAndKey')}</Button></div>
      )}

      {isLoading && <Spinner />}
      {error && <p className={styles.saveError}>{error}</p>}

      {loaded && (
        <div className={styles.musicResult}>
          <div>
            <span className={styles.label}>{t('music.key')}</span>
            {' '}
            {songKey
              ? (
                  <>
                    {translateNoteName(songKey.tonic)}
                    {' '}
                    {songKey.mode === 'minor' ? t('music.mode.minor') : t('music.mode.major')}
                    <span className={styles.confidence}>
                      {' '}
                      {songKey.confidence >= 0.7 ? t('music.keyEstimated') : t('music.keyEstimatedLowConfidence')}
                    </span>
                  </>
                )
              : t('music.keyUnknown')}
          </div>

          {notes && range?.lowest && range?.highest
            ? (
                <>
                  <div>
                    <span className={styles.label}>{t('music.vocalRange')}</span>
                    {' '}
                    {translateNoteName(range.lowest.name)}
                    {' – '}
                    {translateNoteName(range.highest.name)}
                    {'  '}
                    {t('music.noteCount', { count: notes.length })}
                  </div>
                  <ul className={styles.noteList}>
                    {notes.map((n, i) => (
                      <li key={i} className={n.isGolden ? styles.goldenNote : undefined}>
                        <span className={styles.noteName}>{translateNoteName(n.name)}</span>
                        <span className={styles.noteText}>{n.text.trim() || ' '}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )
            : (
                <p className={styles.noNotes}>{t('music.noNotes')}</p>
              )}
        </div>
      )}
    </div>
  )
}

export default SongMusicInfo
