import React, { useRef, useState } from 'react'
import { useAppDispatch } from 'store/hooks'
import { requestSeek } from 'routes/Player/modules/player'
import { formatDuration } from 'lib/dateTime'
import styles from './SeekBar.css'

interface SeekBarProps {
  queueId: number
  duration: number
  pctPlayed: number
}

/**
 * Drag anywhere along the playing song to jump within it.
 *
 * The seek is sent on release, not while dragging: the player is on another
 * screen in the room and every intermediate position would be an extra command
 * plus an audible jump for everyone listening. The handle follows the finger
 * locally so it still feels responsive.
 */
const SeekBar = ({ queueId, duration, pctPlayed }: SeekBarProps) => {
  const dispatch = useAppDispatch()
  const barRef = useRef<HTMLDivElement>(null)
  const [dragPct, setDragPct] = useState<number | null>(null)

  const pctFromEvent = (clientX: number): number => {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect || !rect.width) return 0
    return Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation() // don't let the row's swipe handlers claim the gesture
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragPct(pctFromEvent(e.clientX))
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return
    setDragPct(pctFromEvent(e.clientX))
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragPct === null) return

    const pct = pctFromEvent(e.clientX)
    setDragPct(null)

    if (duration > 0) dispatch(requestSeek(queueId, (pct / 100) * duration))
  }

  const shownPct = dragPct ?? pctPlayed

  return (
    <div
      ref={barRef}
      className={styles.bar}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragPct(null)}
      role='slider'
      aria-label='Seek within song'
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round((shownPct / 100) * duration)}
      tabIndex={0}
    >
      <div className={styles.handle} style={{ left: `${shownPct}%` }} />
      {dragPct !== null && (
        <div className={styles.tooltip} style={{ left: `${shownPct}%` }}>
          {formatDuration(Math.round((shownPct / 100) * duration))}
        </div>
      )}
    </div>
  )
}

export default SeekBar
