import React, { useState } from 'react'
import Button from 'components/Button/Button'
import Spinner from 'components/Spinner/Spinner'
import HttpApi from 'lib/HttpApi'
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
      <span className={styles.label}>Music:</span>

      {!loaded && !isLoading && (
        <div><Button onClick={handleLoad}>Show notes & key</Button></div>
      )}

      {isLoading && <Spinner />}
      {error && <p className={styles.saveError}>{error}</p>}

      {loaded && (
        <div className={styles.musicResult}>
          <div>
            <span className={styles.label}>Key: </span>
            {songKey
              ? (
                  <>
                    {songKey.tonic}
                    {' '}
                    {songKey.mode}
                    <span className={styles.confidence}>
                      {songKey.confidence >= 0.7 ? ' (estimated)' : ' (estimated, low confidence)'}
                    </span>
                  </>
                )
              : 'could not be estimated'}
          </div>

          {notes && range?.lowest && range?.highest
            ? (
                <>
                  <div>
                    <span className={styles.label}>Vocal range: </span>
                    {range.lowest.name}
                    {' – '}
                    {range.highest.name}
                    {`  (${notes.length} notes)`}
                  </div>
                  <ul className={styles.noteList}>
                    {notes.map((n, i) => (
                      <li key={i} className={n.isGolden ? styles.goldenNote : undefined}>
                        <span className={styles.noteName}>{n.name}</span>
                        <span className={styles.noteText}>{n.text.trim() || ' '}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )
            : (
                <p className={styles.noNotes}>
                  No notes: only songs acquired from UltraStar/USDB carry the melody.
                  A YouTube karaoke is an instrumental track, so there is no vocal to extract it from.
                </p>
              )}
        </div>
      )}
    </div>
  )
}

export default SongMusicInfo
