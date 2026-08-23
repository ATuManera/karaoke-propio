import React, { useEffect, useRef } from 'react'
import clsx from 'clsx'
import styles from './SelectRoom.css'
import type { Room } from 'shared/types'
import { useT } from 'lib/i18n'

interface SelectRoomProps {
  className?: string
  rooms: {
    result: number[]
    entities: Record<number, Room>
  }
  roomId: number | null
  roomPassword: string
  showAllRooms: boolean
  onRoomSelect: (value: number) => void
  onRoomPasswordChange: (value: string) => void
}

const SelectRoom = ({
  onRoomSelect,
  onRoomPasswordChange,
  className,
  rooms,
  roomId,
  roomPassword,
  showAllRooms,
}: SelectRoomProps) => {
  const t = useT()
  const passwordRef = useRef<HTMLInputElement>(null)
  const selected = roomId === null ? undefined : rooms.entities[roomId]
  const hasPassword = !!selected?.hasPassword

  // choosing a room that wants a password leaves exactly one thing to do next
  useEffect(() => {
    if (hasPassword) passwordRef.current?.focus()
  }, [hasPassword, roomId])

  const password = hasPassword && (
    <input
      type='password'
      autoComplete='off'
      onChange={(e) => { onRoomPasswordChange(e.target.value) }}
      placeholder={t('signedOut.roomPasswordRequired')}
      aria-label={t('signedOut.roomPasswordRequired')}
      ref={passwordRef}
      value={roomPassword}
    />
  )

  // an invite names its room, so there is nothing here to choose
  if (!showAllRooms) {
    return (
      <div className={clsx(styles.container, className)}>
        {selected && <div className={styles.pinned} translate='no'>{selected.name}</div>}
        {password}
      </div>
    )
  }

  return (
    <div className={clsx(styles.container, className)}>
      {/* A radio per room ran off the bottom of the screen as soon as a few
          existed, and the sign-in form went with it. A select stays one row
          however many rooms there are, and hands the phone its own picker —
          easier to hit than a column of dots. Which rooms have somebody in
          them still shows, on each option. */}
      <select
        className={styles.select}
        value={roomId ?? ''}
        onChange={e => onRoomSelect(parseInt(e.target.value, 10))}
        aria-label={t('signedOut.roomLabel')}
      >
        <option value='' disabled>{t('signedOut.chooseARoom')}</option>
        {rooms.result.map(id => (
          <option key={`room-${id}`} value={id}>
            {rooms.entities[id].name}
            {rooms.entities[id].isLive ? t('signedOut.roomSomeoneHere') : t('signedOut.roomFree')}
          </option>
        ))}
      </select>

      {password}
    </div>
  )
}

export default SelectRoom
