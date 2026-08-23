import React from 'react'
import clsx from 'clsx'
import { Trans } from 'react-i18next'
import { msg, useT } from 'lib/i18n'
import { formatSeconds } from 'lib/dateTime'
import styles from './UpNext.css'

interface UpNextProps {
  isUpNow: boolean
  isUpNext: boolean
  wait?: number
}

const UpNext = (props: UpNextProps) => {
  const t = useT()
  const wait = props.wait ? formatSeconds(props.wait, true) : ''

  if (props.isUpNow) {
    return (
      <div className={clsx(styles.container, styles.upNow)}>
        <p className={styles.msg}>
          {/* the emphasised word differs by language, so the tag travels with
              the sentence rather than being wrapped around a fixed fragment */}
          <Trans i18nKey={msg('header.upNow')} components={{ b: <strong /> }} />
        </p>
      </div>
    )
  }

  if (props.isUpNext) {
    return (
      <div className={clsx(styles.container, styles.upNext)}>
        <p className={styles.msg}>
          <Trans
            i18nKey={msg(props.wait ? 'header.upNextIn' : 'header.upNext')}
            components={{ b: <strong /> }}
            values={{ wait }}
          />
        </p>
      </div>
    )
  }

  if (props.wait) {
    return (
      <div className={clsx(styles.container, styles.inQueue)}>
        <p className={styles.msg}>{t('header.upIn', { wait })}</p>
      </div>
    )
  }

  return null
}

export default UpNext
