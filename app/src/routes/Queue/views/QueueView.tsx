import React, { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { ensureState } from 'redux-optimistic-ui'
import { Link } from 'react-router'
import { Trans } from 'react-i18next'
import { msg, useT } from 'lib/i18n'
import getRoundRobinQueue from '../selectors/getRoundRobinQueue'
import QueueList from '../components/QueueList/QueueList'
import Button from 'components/Button/Button'
import { removeItem } from '../modules/queue'
import Spinner from 'components/Spinner/Spinner'
import TextOverlay from 'components/TextOverlay/TextOverlay'
import styles from './QueueView.css'

const QUEUE_ITEM_HEIGHT = 92

const QueueView = () => {
  const t = useT()
  const dispatch = useAppDispatch()
  const { innerWidth, innerHeight, headerHeight, footerHeight } = useAppSelector(state => state.ui)
  const isInRoom = useAppSelector(state => !!state.user.roomId)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const isLoading = useAppSelector(state => ensureState(state.queue).isLoading)
  const queue = useAppSelector(getRoundRobinQueue)
  const queueId = useAppSelector(state => state.status.queueId)
  const containerRef = useRef<HTMLDivElement>(null)

  // Removing every entry at once. QUEUE_REMOVE already accepts a list and
  // re-checks ownership server-side, so admin-only here is a UI affordance on
  // top of a rule the server enforces regardless.
  const handleClearQueue = () => {
    if (window.confirm(t('queue.confirmClear', { count: queue.result.length }))) {
      dispatch(removeItem({ queueId: [...queue.result] as number[] }))
    }
  }

  // ensure current song is in view on first mount only
  useEffect(() => {
    if (containerRef.current) {
      const i = queue.result.indexOf(queueId)
      containerRef.current.scrollTop = QUEUE_ITEM_HEIGHT * i
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={styles.container}
      ref={containerRef}
      style={{
        paddingTop: headerHeight,
        paddingBottom: footerHeight,
        width: innerWidth,
        height: innerHeight,
      }}
    >
      {!isInRoom && (
        <TextOverlay>
          <h1>{t('queue.getARoom')}</h1>
          <p>
            <Trans i18nKey={msg('queue.startQueueing')} components={{ a: <Link to='/account' /> }} />
          </p>
        </TextOverlay>
      )}

      {isLoading && <Spinner />}

      {!isLoading && queue.result.length === 0 && (
        <TextOverlay>
          <h1>{t('queue.empty')}</h1>
          <p>
            <Trans i18nKey={msg('queue.tapASong')} components={{ a: <Link to='/library' /> }} />
          </p>
        </TextOverlay>
      )}

      {isAdmin && !isLoading && queue.result.length > 0 && (
        <div className={styles.adminBar} style={{ top: headerHeight }}>
          <Button className={styles.clearBtn} onClick={handleClearQueue}>
            {t('queue.clearQueue')}
          </Button>
        </div>
      )}

      <QueueList />
    </div>
  )
}

export default QueueView
