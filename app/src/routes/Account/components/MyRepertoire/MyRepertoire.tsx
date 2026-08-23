import React, { useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import { clearImportReport, fetchMissingSongs, importRepertoire } from 'store/modules/repertoire'
import styles from './MyRepertoire.css'

/**
 * Carrying a repertoire between installations.
 *
 * What leaves here is a list of songs and this singer's pitch for each of
 * them — a few kilobytes, no audio. The other installation already has the
 * songs, or can fetch them the same way this one did; what it cannot get any
 * other way is the pitch, which took a party and a pitch assistant to learn.
 */
const MyRepertoire = () => {
  const dispatch = useAppDispatch()
  const { isImporting, isFetchingMissing, report, error } = useAppSelector(state => state.repertoire)
  const { isAdmin, name } = useAppSelector(state => state.user)
  const isEnabled = useAppSelector(state => state.prefs.isRepertoireImportEnabled !== false)

  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')

  const canImport = isAdmin || isEnabled

  const handleImport = () => {
    const file = fileRef.current?.files?.[0]

    if (!file && !url.trim()) {
      alert('Choose a repertoire file, or paste a link to one.')
      return
    }

    dispatch(importRepertoire({ file, url }))
  }

  const missingFetchable = report?.songs.missing.filter(song => song.sourceId) ?? []

  const handleFetchMissing = () => {
    if (!confirm(`Download ${missingFetchable.length} missing songs?\n\nThey arrive one at a time and are held for review before anyone sings them.`)) return

    dispatch(fetchMissingSongs({ songs: missingFetchable, title: `${report?.singer ?? 'Imported'} repertoire` }))
  }

  return (
    <Panel title='My Repertoire' contentClassName={styles.content}>
      <>
        <p className={styles.hint}>
          Take your songs and your pitches to another Karaoke Propio — or bring
          them here from one. The file holds no music, only what you have
          learned about singing it.
        </p>

        {/* a plain link, not a fetch: the browser saves the file itself, and
            on a phone that is what puts it somewhere the person can find it */}
        <a
          className={styles.download}
          href={`${document.baseURI}api/repertoire`}
          download
        >
          Download
          {name ? ` ${name}'s` : ' my'}
          {' '}
          repertoire
        </a>

        {canImport && (
          <div className={styles.import}>
            <label className={styles.label} htmlFor='repertoire-file'>Bring a repertoire in</label>

            <input
              id='repertoire-file'
              type='file'
              accept='application/json,.json'
              ref={fileRef}
              className={styles.file}
            />

            <div className={styles.or}>or paste a link to it</div>

            <input
              type='url'
              inputMode='url'
              placeholder='https://…/fernando.karaoke-propio.json'
              value={url}
              onChange={e => setUrl(e.target.value)}
            />

            <Button variant='primary' onClick={handleImport} disabled={isImporting}>
              {isImporting ? 'Reading…' : 'Import'}
            </Button>
          </div>
        )}

        {!canImport && (
          <p className={styles.hint}>Bringing a repertoire in is turned off here.</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {report && (
          <div className={styles.report}>
            <p className={styles.reportLine}>
              <strong>{`${report.songs.matched} of ${report.songs.total}`}</strong>
              {' songs are in this library. '}
              {report.pitches.applied > 0 && `${report.pitches.applied} pitch${report.pitches.applied === 1 ? '' : 'es'} saved.`}
              {report.pitches.kept > 0 && ` ${report.pitches.kept} left as ${report.pitches.kept === 1 ? 'it was' : 'they were'}, being newer here.`}
            </p>

            {/* worth saying rather than hiding: a karaoke upload is often
                transposed against another of the same song, so a pitch learned
                on one is a starting point against the other, not the answer */}
            {report.pitches.approximated > 0 && (
              <p className={styles.reportNote}>
                {report.pitches.approximated === 1
                  ? '1 of those pitches was learned on a different recording, so it starts as a guess and the pitch question will correct it.'
                  : `${report.pitches.approximated} of those pitches were learned on different recordings, so they start as guesses and the pitch question will correct them.`}
              </p>
            )}

            {report.songs.missing.length > 0 && (
              <details className={styles.missing}>
                <summary>{`${report.songs.missing.length} not here`}</summary>
                <ul>
                  {report.songs.missing.map((song, i) => (
                    <li key={i} translate='no'>
                      {[song.artist, song.title].filter(Boolean).join(' — ')}
                      {!song.sourceId && <span className={styles.unfetchable}> (no source to fetch it from)</span>}
                    </li>
                  ))}
                </ul>

                {isAdmin && missingFetchable.length > 0 && (
                  <Button onClick={handleFetchMissing} disabled={isFetchingMissing}>
                    {isFetchingMissing ? 'Starting…' : `Download the ${missingFetchable.length} that can be fetched`}
                  </Button>
                )}
              </details>
            )}

            <a className={styles.dismiss} onClick={() => dispatch(clearImportReport())}>Dismiss</a>
          </div>
        )}
      </>
    </Panel>
  )
}

export default MyRepertoire
