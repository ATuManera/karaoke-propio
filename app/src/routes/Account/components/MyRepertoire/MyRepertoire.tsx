import React, { useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import { clearImportReport, fetchMissingSongs, importRepertoire } from 'store/modules/repertoire'
import { useT } from 'lib/i18n'
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
  const t = useT()
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
      alert(t('repertoire.chooseFileOrLink'))
      return
    }

    dispatch(importRepertoire({ file, url }))
  }

  const missingFetchable = report?.songs.missing.filter(song => song.sourceId) ?? []

  const handleFetchMissing = () => {
    if (!confirm(t('repertoire.confirmDownloadMissing', { count: missingFetchable.length }))) return

    dispatch(fetchMissingSongs({
      songs: missingFetchable,
      title: t('repertoire.importedRepertoireTitle', { singer: report?.singer ?? t('repertoire.imported') }),
    }))
  }

  return (
    <Panel title={t('repertoire.title')} contentClassName={styles.content}>
      <>
        <p className={styles.hint}>{t('repertoire.intro')}</p>

        {/* a plain link, not a fetch: the browser saves the file itself, and
            on a phone that is what puts it somewhere the person can find it */}
        <a
          className={styles.download}
          href={`${document.baseURI}api/repertoire`}
          download
        >
          {name ? t('repertoire.downloadTheirs', { name }) : t('repertoire.downloadMine')}
        </a>

        {canImport && (
          <div className={styles.import}>
            <label className={styles.label} htmlFor='repertoire-file'>{t('repertoire.bringItIn')}</label>

            <input
              id='repertoire-file'
              type='file'
              accept='application/json,.json'
              ref={fileRef}
              className={styles.file}
            />

            <div className={styles.or}>{t('repertoire.orPasteALink')}</div>

            <input
              type='url'
              inputMode='url'
              placeholder={t('repertoire.urlPlaceholder')}
              value={url}
              onChange={e => setUrl(e.target.value)}
            />

            <Button variant='primary' onClick={handleImport} disabled={isImporting}>
              {isImporting ? t('common.reading') : t('repertoire.import')}
            </Button>
          </div>
        )}

        {!canImport && (
          <p className={styles.hint}>{t('repertoire.turnedOff')}</p>
        )}

        {error && <p className={styles.error}>{error}</p>}

        {report && (
          <div className={styles.report}>
            <p className={styles.reportLine}>
              <strong>
                {t('repertoire.matched', { matched: report.songs.matched, total: report.songs.total, count: report.songs.total })}
              </strong>
              {t('repertoire.songsInThisLibrary')}
              {report.pitches.applied > 0 && t('repertoire.pitchesSaved', { count: report.pitches.applied })}
              {report.pitches.kept > 0 && t('repertoire.pitchesKept', { count: report.pitches.kept })}
            </p>

            {/* worth saying rather than hiding: a karaoke upload is often
                transposed against another of the same song, so a pitch learned
                on one is a starting point against the other, not the answer */}
            {report.pitches.approximated > 0 && (
              <p className={styles.reportNote}>
                {t('repertoire.approximated', { count: report.pitches.approximated })}
              </p>
            )}

            {report.songs.missing.length > 0 && (
              <details className={styles.missing}>
                <summary>{t('repertoire.notHere', { count: report.songs.missing.length })}</summary>
                <ul>
                  {report.songs.missing.map((song, i) => (
                    <li key={i} translate='no'>
                      {[song.artist, song.title].filter(Boolean).join(' — ')}
                      {!song.sourceId && <span className={styles.unfetchable}>{t('repertoire.noSourceToFetch')}</span>}
                    </li>
                  ))}
                </ul>

                {isAdmin && missingFetchable.length > 0 && (
                  <Button onClick={handleFetchMissing} disabled={isFetchingMissing}>
                    {isFetchingMissing ? t('common.starting') : t('repertoire.downloadFetchable', { count: missingFetchable.length })}
                  </Button>
                )}
              </details>
            )}

            <a className={styles.dismiss} onClick={() => dispatch(clearImportReport())}>{t('common.dismiss')}</a>
          </div>
        )}
      </>
    </Panel>
  )
}

export default MyRepertoire
