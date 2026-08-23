import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import { setPref } from 'store/modules/prefs'
import styles from './RepertoirePrefs.css'
import { useT } from 'lib/i18n'

/**
 * Who may bring a repertoire in, and the library's own manifest to hand out.
 *
 * The toggle governs everybody except an admin: what an import writes is
 * confined to one person's saved pitches and stars, and the person doing it is
 * already in a room here, but an admin who would rather nobody did it should
 * not have to argue with the feature.
 */
const RepertoirePrefs = () => {
  const t = useT()
  const isRepertoireImportEnabled = useAppSelector(state => state.prefs.isRepertoireImportEnabled !== false)
  const dispatch = useAppDispatch()

  const toggleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setPref({ key: e.currentTarget.name, data: e.currentTarget.checked }))
  }

  return (
    <Accordion
      className={styles.container}
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='DOWNLOAD' size={32} className={styles.icon} />
          <div className={styles.title}>{t('prefs.repertoire')}</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <label>
          <input
            type='checkbox'
            checked={isRepertoireImportEnabled}
            onChange={toggleCheckbox}
            name='isRepertoireImportEnabled'
          />
          {' '}
          {t('prefs.letSingersBringRepertoire')}
        </label>

        <p className={styles.hint}>{t('prefs.repertoireHint')}</p>

        <a href={`${document.baseURI}api/repertoire/library`} download>
          {t('prefs.downloadSongList')}
        </a>

        <p className={styles.hint}>
          Names every song here and the upload it came from, with nobody
          attached. Another installation can read it to fetch the same songs.
        </p>
      </div>
    </Accordion>
  )
}

export default RepertoirePrefs
