import React from 'react'
import { Link } from 'react-router'
import { Trans } from 'react-i18next'
import { msg } from 'lib/i18n'
import styles from './NoPlayer.css'

const NoPlayer = () => (
  <div className={styles.container}>
    <p className={styles.msg}>
      {/* the link sits inside the sentence, and where in the sentence is the
          translator's business */}
      <Trans
        i18nKey={msg('playback.noPlayerInRoomWithLink')}
        components={{ a: <Link to='/player' target='_blank' replace /> }}
      />
    </p>
  </div>
)

export default NoPlayer
