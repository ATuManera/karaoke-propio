import React, { useState } from 'react'
import { useAppDispatch } from 'store/hooks'
import { requestPlay } from 'store/modules/status'
import ColorCycle from './ColorCycle/ColorCycle'
import UpNow from './UpNow/UpNow'
import Icon from 'components/Icon/Icon'
import { formatPitch } from 'shared/pitch'
import { useT } from 'lib/i18n'
import type { QueueItem } from 'shared/types'
import styles from './PlayerTextOverlay.css'

interface PlayerTextOverlayProps {
  queueItem?: QueueItem
  nextQueueItem?: QueueItem
  isAtQueueEnd: boolean
  isQueueEmpty: boolean
  isErrored: boolean
  width: number
  height: number
}

const PlayerTextOverlay = ({
  isQueueEmpty,
  isAtQueueEnd,
  isErrored,
  nextQueueItem,
  queueItem,
  width,
  height,
}: PlayerTextOverlayProps) => {
  const t = useT()
  const dispatch = useAppDispatch()
  const handlePlay = () => dispatch(requestPlay())
  const [errorOffset] = useState(() => Math.random() * -300)

  let Component

  if (isQueueEmpty || (isAtQueueEnd && !nextQueueItem)) {
    Component = <ColorCycle text={t('player.noMoreSongs')} className={styles.backdrop} />
  } else if (!queueItem || (isAtQueueEnd && nextQueueItem)) {
    Component = (
      <>
        <svg width='0' height='0' style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id='play-icon-gradient' x1='0%' y1='0%' x2='100%' y2='100%'>
              <stop offset='0%' className={styles.gradientStop1} />
              <stop offset='100%' className={styles.gradientStop2} />
            </linearGradient>
          </defs>
        </svg>
        <button className={styles.playButton} onClick={handlePlay} aria-label={t('player.play')}>
          <Icon icon='PLAY' />
        </button>
      </>
    )
  } else if (queueItem.pitchStatus === 'preparing') {
    // pitch is a per-request property, not a room property: this queueId is
    // "up" but its transposed audio isn't ready yet. Never mount the leaf
    // player (see PlayerController's isVisible) — hold the singer's turn
    // here instead of letting another singer's song jump ahead.
    Component = (
      <ColorCycle text={t('player.preparingPitch', { pitch: formatPitch(queueItem.pitchSemitones) })} className={styles.backdrop} />
    )
  } else if (queueItem.pitchStatus === 'error') {
    // distinct from player.isErrored: this is a transcode failure, not a
    // playback failure — they must never be conflated (see QueueItem for the
    // matching per-item message)
    Component = (
      <>
        <ColorCycle text={t('player.pitchError')} offset={errorOffset} className={styles.backdrop} />
        <ColorCycle text={t('player.seeQueueForDetails')} offset={errorOffset} className={styles.backdrop} />
      </>
    )
  } else if (isErrored) {
    Component = (
      <>
        <ColorCycle text={t('player.oops')} offset={errorOffset} className={styles.backdrop} />
        <ColorCycle text={t('player.seeQueueForDetails')} offset={errorOffset} className={styles.backdrop} />
      </>
    )
  } else {
    Component = <UpNow queueItem={queueItem} />
  }

  return (
    <div style={{ width, height }} className={styles.container}>
      {Component}
    </div>
  )
}

export default PlayerTextOverlay
