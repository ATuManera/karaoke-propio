import React from 'react'
import { useAppSelector } from 'store/hooks'
import Button from 'components/Button/Button'
import InputCheckbox from 'components/InputCheckbox/InputCheckbox'
import { useT } from 'lib/i18n'
import styles from './UserRooms.css'

interface UserRoomsProps {
  isAdminUser: boolean
  roomIds: number[]
  preferredRoomId: number | null
  onChange: (roomIds: number[], preferredRoomId: number | null) => void
}

/**
 * Which rooms an account may enter, and which one it lands in.
 *
 * This is the whole of the new access control: a room used to be guarded by a
 * password everybody in it shared, which says nothing about who may sing where
 * and cannot be taken back from one person. Ticking boxes here can.
 *
 * The preselection is a separate question from access, and asked separately:
 * every room ticked is one they can reach, and exactly one of them is where
 * they arrive. Whatever the admin chooses here is only the first answer —
 * after that it follows the person's own last choice.
 */
const UserRooms = ({ isAdminUser, roomIds, preferredRoomId, onChange }: UserRoomsProps) => {
  const t = useT()
  const rooms = useAppSelector(state => state.rooms)

  if (!rooms.result.length) {
    return (
      <div className={styles.container}>
        <label>{t('users.roomsTitle')}</label>
        <p className={styles.hint}>{t('users.roomsEmpty')}</p>
      </div>
    )
  }

  const toggle = (roomId: number) => {
    const next = roomIds.includes(roomId)
      ? roomIds.filter(id => id !== roomId)
      : [...roomIds, roomId]

    // The room they land in has to be one they can reach. Unticking it hands
    // the choice to the first of what is left rather than leaving a
    // preselection pointing at a door that is now shut.
    const preferred = next.includes(preferredRoomId) ? preferredRoomId : (next[0] ?? null)

    onChange(next, preferred)
  }

  const setAll = (all: boolean) => {
    const next = all ? [...rooms.result] : []
    onChange(next, all ? (preferredRoomId ?? next[0] ?? null) : null)
  }

  return (
    <div className={styles.container}>
      <label>{t('users.roomsTitle')}</label>
      <p className={styles.hint}>{t('users.roomsHint')}</p>

      {/* An admin walks into every room whatever is ticked here. The boxes
          still show, and are still editable, because the day this account
          stops being an admin they are what is left — hiding them is how
          somebody gets demoted into having no rooms at all. */}
      {isAdminUser && <p className={styles.hint}>{t('users.roomsAdminHint')}</p>}

      <div className={styles.list}>
        {rooms.result.map((roomId) => {
          const room = rooms.entities[roomId]

          return (
            <InputCheckbox
              key={roomId}
              checked={roomIds.includes(roomId)}
              onChange={() => toggle(roomId)}
              label={room.status === 'closed'
                ? `${room.name} (${t('users.roomsClosed')})`
                : room.name}
            />
          )
        })}
      </div>

      <div className={styles.bulk}>
        <Button variant='default' onClick={() => setAll(true)}>{t('users.roomsAll')}</Button>
        <Button variant='default' onClick={() => setAll(false)}>{t('users.roomsNone')}</Button>
      </div>

      {roomIds.length > 1 && (
        <select
          className={styles.preferred}
          value={preferredRoomId ?? ''}
          onChange={e => onChange(roomIds, parseInt(e.target.value, 10))}
          aria-label={t('users.roomsLandsHereSet')}
        >
          {roomIds.map(roomId => (
            <option key={roomId} value={roomId}>
              {`${rooms.entities[roomId]?.name} — ${t('users.roomsLandsHere')}`}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export default UserRooms
