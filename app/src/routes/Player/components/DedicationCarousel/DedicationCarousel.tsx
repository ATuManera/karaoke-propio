import React, { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { useT } from 'lib/i18n'
import { advance, dwellFor, firstStep, CHANGE_DELAY_MS } from './carousel'
import type { Dedication } from 'shared/types'
import styles from './DedicationCarousel.css'

interface DedicationCarouselProps {
  /** the performance these belong to; a new one restarts the cycle */
  queueId: number | null
  dedications?: Dedication[]
  /** false whenever no song is actually on screen (error, pitch, queue end) */
  isVisible: boolean
  width: number
}

/**
 * The dedications and messages on the song being played, across the top of
 * the television.
 *
 * Deliberately not a permanent caption. Karaoke lyrics can and do reach the
 * top of the frame — CDG paints wherever it likes and an MP4 karaoke is
 * whatever the uploader made — so anything parked up there is competing with
 * the words somebody is trying to sing. Instead each message takes a turn and
 * the strip then goes away for half a minute, which is also what makes a
 * second message readable at all: two greetings side by side on a TV are two
 * greetings nobody reads.
 *
 * The text arrives on the queue push the player already receives (see
 * Queue.get), so a dedication edited on a phone reaches the screen with the
 * next push and no channel of its own.
 */
const DedicationCarousel = ({ queueId, dedications, isVisible, width }: DedicationCarouselProps) => {
  const t = useT()
  const messages = dedications ?? []

  // The identity of the *content*, not of the array. Every unrelated queue
  // push — somebody adding a song, a pitch finishing — rebuilds the array,
  // and restarting the cycle for that would cut a message off mid-sentence.
  const contentKey = messages.map(d => `${d.dedicationId}:${d.dateUpdated}`).join(',')

  // read by the timer below, which must not be torn down and restarted just
  // because a new array arrived saying the same thing
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  })

  const [state, setState] = useState(firstStep)
  const [prevKey, setPrevKey] = useState(contentKey)
  const [prevQueueId, setPrevQueueId] = useState(queueId)

  // Start over when the performance changes, and when what is written on it
  // does — the two differ only in how long the wait is. Adjusted here during
  // render rather than in an effect so the very next paint is already the
  // right one, and no frame of the outgoing message survives into the new
  // song. (Same pattern as Button's animation reset.)
  if (contentKey !== prevKey || queueId !== prevQueueId) {
    const isNewPerformance = queueId !== prevQueueId

    setPrevKey(contentKey)
    setPrevQueueId(queueId)
    setState(firstStep(isNewPerformance ? undefined : CHANGE_DELAY_MS))
  }

  useEffect(() => {
    const list = messagesRef.current
    if (!isVisible || list.length === 0) return

    if (state.isShown) {
      const timeout = setTimeout(
        () => setState(step => advance(step, list.length)),
        dwellFor(list[state.index]?.text ?? ''),
      )

      return () => clearTimeout(timeout)
    }

    const timeout = setTimeout(() => setState(s => ({ ...s, isShown: true })), state.wait)
    return () => clearTimeout(timeout)
  }, [state, isVisible, contentKey])

  const current = messages[state.index]
  if (!isVisible || !current) return null

  return (
    <div className={styles.container} style={{ width }} aria-hidden>
      <div className={clsx(styles.banner, state.isShown && styles.shown)}>
        <p className={styles.text} translate='no'>{current.text}</p>
        <p className={styles.author} translate='no'>
          {t('dedication.onScreen.from', { name: current.userDisplayName })}
        </p>
      </div>
    </div>
  )
}

export default DedicationCarousel
