import React from 'react'
import Panel from 'components/Panel/Panel'
import { useT } from 'lib/i18n'
import PathPrefs from './PathPrefs/PathPrefs'
import PlayerPrefs from './PlayerPrefs/PlayerPrefs'
import RepertoirePrefs from './RepertoirePrefs/RepertoirePrefs'
import styles from './Prefs.css'

const Prefs = () => {
  const t = useT()

  return (
    <Panel title={t('prefs.title')} contentClassName={styles.content}>
      <>
        <PathPrefs />
        <PlayerPrefs />
        <RepertoirePrefs />
      </>
    </Panel>
  )
}

export default Prefs
