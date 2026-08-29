import React from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Accordion from 'components/Accordion/Accordion'
import Icon from 'components/Icon/Icon'
import { setPref } from 'store/modules/prefs'
import styles from './PlayerPrefs.css'
import { useT } from 'lib/i18n'

const PlayerPrefs = () => {
  const t = useT()
  const isReplayGainEnabled = useAppSelector(state => state.prefs.isReplayGainEnabled)
  const isPlayerLaunchEnabled = useAppSelector(state => state.prefs.isPlayerLaunchEnabled === true)
  const dispatch = useAppDispatch()

  const toggleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setPref({ key: e.currentTarget.name, data: e.currentTarget.checked }))
  }

  return (
    <Accordion
      className={styles.container}
      headingComponent={(
        <div className={styles.heading}>
          <Icon icon='TELEVISION_PLAY' size={32} className={styles.icon} />
          <div className={styles.title}>{t('prefs.player')}</div>
        </div>
      )}
    >
      <div className={styles.content}>
        <label>
          <input
            type='checkbox'
            checked={isReplayGainEnabled}
            onChange={toggleCheckbox}
            name='isReplayGainEnabled'
          />
          {' '}
          {t('prefs.replayGain')}
        </label>

        <label>
          <input
            type='checkbox'
            checked={isPlayerLaunchEnabled}
            onChange={toggleCheckbox}
            name='isPlayerLaunchEnabled'
          />
          {' '}
          {t('prefs.letSingersStartPlayer')}
        </label>
        <p className={styles.hint}>{t('prefs.playerLaunchHint')}</p>
      </div>
    </Accordion>
  )
}

export default PlayerPrefs
