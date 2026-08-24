import React, { useRef, useState } from 'react'
import clsx from 'clsx'
import { useSwipeable } from 'react-swipeable'
import { useLongPress } from 'use-long-press'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import DedicationModal from 'components/DedicationModal/DedicationModal'
import ButtonStar from 'components/ButtonStar/ButtonStar'
import Buttons from 'components/Buttons/Buttons'
import UserImage from 'components/UserImage/UserImage'
import { requestPlayNext, requestReplay } from 'store/modules/status'
import { showSongInfo } from 'store/modules/songInfo'
import { toggleSongStarred } from 'store/modules/userStars'
import { showErrorMessage } from 'store/modules/ui'
import { queueSong, removeItem } from '../../modules/queue'
import SeekBar from './SeekBar'
import { formatPitch } from 'shared/pitch'
import type { Dedication, PitchStatus } from 'shared/types'
import styles from './QueueItem.css'
import { useT } from 'lib/i18n'

const LONG_PRESS_THRESHOLD_MS = 700

interface QueueItemProps {
  artist: string
  /** what is being said over this performance, in the order it was written */
  dedications?: Dedication[]
  errorMessage: string
  isCurrent: boolean
  /** whether this row still has a screen ahead of it worth writing on */
  isDedicatable: boolean
  isErrored: boolean
  isInfoable: boolean
  isMovable: boolean
  isOwner: boolean
  isAdmin: boolean
  duration: number
  isPlayed: boolean
  isPlaying: boolean
  isRemovable: boolean
  isReplayable: boolean
  isSkippable: boolean
  isStarred: boolean
  isUpcoming: boolean
  pctPlayed: number
  pitchSemitones: number
  pitchStatus: PitchStatus
  pitchError?: string
  queueId: number
  songId: number
  starCount: number
  title: string
  userDateUpdated: number
  userDisplayName: string
  userId: number
  wait?: string
  // actions
  onMoveClick(queueId: number): void
  onRemoveUpcoming: (userId: number) => void
}

const QueueItem = ({
  artist,
  dedications,
  errorMessage,
  isCurrent,
  isDedicatable,
  isErrored,
  isInfoable,
  isMovable,
  isOwner,
  isAdmin,
  duration,
  isPlayed,
  isPlaying,
  isRemovable,
  isReplayable,
  isSkippable,
  isStarred,
  isUpcoming,
  onMoveClick,
  onRemoveUpcoming,
  pctPlayed,
  pitchSemitones,
  pitchStatus,
  pitchError,
  queueId,
  songId,
  starCount,
  title,
  userDateUpdated,
  userDisplayName,
  userId,
  wait,
}: QueueItemProps) => {
  const t = useT()
  const [isExpanded, setExpanded] = useState(false)
  const [isDedicationOpen, setDedicationOpen] = useState(false)
  const longPressActiveRef = useRef(false)
  const dispatch = useAppDispatch()
  const myUserId = useAppSelector(state => state.user.userId)

  const handleErrorInfoClick = () => dispatch(showErrorMessage(errorMessage))
  const handleInfoClick = () => dispatch(showSongInfo(songId))
  const handleMoveClick = () => {
    onMoveClick(queueId)
    setExpanded(false)
  }
  const handleReplayClick = () => {
    dispatch(requestReplay(queueId))
    setExpanded(false)
  }
  const handleRequeueClick = () => {
    // conserve the previously-chosen pitch; never silently reset to 0
    dispatch(queueSong(songId, pitchSemitones))
    setExpanded(false)
  }
  const handleSkipClick = () => {
    dispatch(requestPlayNext())
    setExpanded(false)
  }
  const handleDedicationClick = () => {
    setDedicationOpen(true)
    setExpanded(false)
  }

  const handleRemoveClick = () => dispatch(removeItem({ queueId }))
  const handleStarClick = () => dispatch(toggleSongStarred(songId))

  const swipeHandlers = useSwipeable({
    onSwipedLeft: () => {
      setExpanded(isErrored || isInfoable || isRemovable || isSkippable || isDedicatable)
    },
    onSwipedRight: () => setExpanded(false),
    preventScrollOnSwipe: true,
    trackMouse: true,
  })

  const bindRemovePressHandlers = useLongPress(() => {
    const confirmText = isOwner
      ? t('queue.confirmRemoveAllMine')
      : t('queue.confirmRemoveAllFor', { name: userDisplayName })
    longPressActiveRef.current = true

    if (confirm(confirmText)) {
      onRemoveUpcoming(userId)
    }
  }, { threshold: LONG_PRESS_THRESHOLD_MS, cancelOnMovement: true })

  const bindSkipPressHandlers = useLongPress(() => {
    const confirmText = isOwner
      ? t('queue.confirmSkipAndRemoveAllMine')
      : t('queue.confirmSkipAndRemoveAllFor', { name: userDisplayName })
    longPressActiveRef.current = true

    if (confirm(confirmText)) {
      onRemoveUpcoming(userId)
      handleSkipClick()
    }
  }, { threshold: LONG_PRESS_THRESHOLD_MS, cancelOnMovement: true })

  return (
    <div
      {...swipeHandlers}
      className={clsx(
        styles.container,
        isCurrent && styles.current,
        isCurrent && !isPlaying && styles.paused,
      )}
      style={{ '--progress': (isCurrent && pctPlayed < 2 ? 2 : pctPlayed) + '%' } as React.CSSProperties}
    >
      {/* Scrubbing changes what the whole room hears mid-song, so it is offered
          only to the singer whose turn it is, or an admin. The server re-checks
          this — the absence of the control is not the protection. */}
      {isCurrent && (isOwner || isAdmin) && (
        <SeekBar queueId={queueId} duration={duration} pctPlayed={pctPlayed} />
      )}

      <div className={styles.content}>
        <div className={clsx(styles.imageContainer, isPlayed && styles.greyed)}>
          <UserImage userId={userId} dateUpdated={userDateUpdated} />
          <div className={styles.waitContainer}>
            {isUpcoming && (
              <div className={clsx(styles.wait, isOwner && styles.isOwner)}>
                {wait}
              </div>
            )}
          </div>
        </div>

        <div className={clsx(styles.primary, isPlayed && styles.greyed)} translate='no'>
          <div className={styles.innerPrimary}>
            <div className={styles.title}>
              {title}
              {pitchSemitones !== 0 && (
                <span className={clsx(styles.pitchBadge, pitchStatus === 'error' && styles.danger)}>
                  {formatPitch(pitchSemitones)}
                </span>
              )}
            </div>
            <div className={styles.artist}>{artist}</div>
            {/* what the room will read over this song. The first message is
                shown in full-ish and the rest counted: the row is a list
                entry, and the carousel on the television is where they all
                get their turn. */}
            {!!dedications?.length && (
              <div className={styles.dedication}>
                <span className={styles.dedicationText}>{dedications[0].text}</span>
                {dedications.length > 1 && (
                  <span className={styles.dedicationMore}>{`+${dedications.length - 1}`}</span>
                )}
              </div>
            )}
            {pitchStatus === 'preparing' && (
              <div className={styles.pitchStatus}>
                {t('queue.pitchPreparing', { pitch: formatPitch(pitchSemitones) })}
              </div>
            )}
            {pitchStatus === 'error' && (
              <div className={clsx(styles.pitchStatus, styles.danger)}>
                {t('queue.pitchFailed', { pitch: formatPitch(pitchSemitones) })}
                {pitchError ? `: ${pitchError}` : ''}
              </div>
            )}
          </div>
          <div className={clsx(styles.user, isOwner && styles.isOwner)}>
            {userDisplayName}
          </div>
        </div>

        <Buttons btnWidth={56} isExpanded={isExpanded} className={styles.btnContainer}>
          {isErrored && (
            <Button
              className={styles.danger}
              icon='INFO_OUTLINE'
              onClick={handleErrorInfoClick}
            />
          )}
          <ButtonStar
            className={styles.btnStar}
            isStarred={isStarred}
            onClick={handleStarClick}
            count={starCount}
          />
          {isInfoable && (
            <Button
              className={styles.active}
              data-hide
              icon='INFO_OUTLINE'
              onClick={handleInfoClick}
            />
          )}
          {isDedicatable && (
            <Button
              className={clsx(styles.btnDedicate, dedications?.length ? styles.active : undefined)}
              data-hide
              icon='MESSAGE'
              aria-label={t('dedication.title')}
              onClick={handleDedicationClick}
            />
          )}
          {isMovable && (
            <Button
              className={clsx(styles.btnMove, styles.active)}
              data-hide
              icon='MOVE_TOP'
              onClick={handleMoveClick}
            />
          )}
          {isPlayed && (
            <Button
              className={clsx(styles.btnAdd, styles.active)}
              data-hide
              icon='PLUS'
              onClick={handleRequeueClick}
            />
          )}
          {isReplayable && (
            <Button
              className={clsx(styles.active, styles.danger)}
              data-hide
              icon='REPLAY'
              onClick={handleReplayClick}
            />
          )}
          {isRemovable && (
            <Button
              className={clsx(styles.btnRemove, styles.danger)}
              data-hide
              icon='DELETE'
              onTouchEnd={(e: React.TouchEvent<HTMLButtonElement>) => {
                if (longPressActiveRef.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  longPressActiveRef.current = false
                  return
                }
              }}
              onClick={() => {
                if (longPressActiveRef.current) {
                  longPressActiveRef.current = false
                  return
                }
                handleRemoveClick()
              }}
              {...bindRemovePressHandlers()}
            />
          )}
          {isSkippable && (
            <Button
              className={clsx(styles.btnPlayNext, styles.danger)}
              data-hide
              icon='PLAY_NEXT'
              onTouchEnd={(e: React.TouchEvent<HTMLButtonElement>) => {
                if (longPressActiveRef.current) {
                  e.preventDefault()
                  e.stopPropagation()
                  longPressActiveRef.current = false
                  return
                }
              }}
              onClick={() => {
                if (longPressActiveRef.current) {
                  longPressActiveRef.current = false
                  return
                }
                handleSkipClick()
              }}
              {...bindSkipPressHandlers()}
            />
          )}
        </Buttons>
      </div>

      {isDedicationOpen && (
        <DedicationModal
          queueId={queueId}
          songTitle={title}
          dedications={dedications ?? []}
          userId={myUserId}
          isAdmin={isAdmin}
          onClose={() => setDedicationOpen(false)}
        />
      )}
    </div>
  )
}

export default QueueItem
