import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchMyRooms } from 'store/modules/rooms'
import { enterRoom } from 'store/modules/user'
import Panel from 'components/Panel/Panel'
import Button from 'components/Button/Button'
import { useT } from 'lib/i18n'
import styles from './MyRoom.css'

/**
 * Where this person is singing, and the way to somewhere else.
 *
 * Only for someone with more than one room to their name: for everyone else
 * the room is not a choice, and a panel offering one would be a decision they
 * cannot make. Moving is a real move — a new session token and a reconnected
 * socket (see enterRoom) — so it lives here rather than in a menu, next to the
 * rest of what belongs to the account.
 */
const MyRoom = () => {
  const t = useT()
  const dispatch = useAppDispatch()

  const roomId = useAppSelector(state => state.user.roomId)
  const mine = useAppSelector(state => state.rooms.mine)
  const [choice, setChoice] = useState<number | null>(null)

  // Asked for again on every visit rather than trusted from sign-in: rooms are
  // opened, closed and reassigned during an evening, and a stale list here is
  // an invitation to a room that will refuse them.
  useEffect(() => {
    dispatch(fetchMyRooms())
  }, [dispatch])

  if (typeof roomId !== 'number' || mine.result.length < 2) return null

  const selected = choice ?? roomId

  return (
    <Panel title={t('selectRoom.panelTitle')}>
      <>
        <p className={styles.hint}>{t('selectRoom.panelHint')}</p>

        <select
          className={styles.select}
          value={selected}
          onChange={e => setChoice(parseInt(e.target.value, 10))}
          aria-label={t('selectRoom.panelTitle')}
        >
          {mine.result.map(id => (
            <option key={id} value={id}>
              {mine.entities[id].name}
              {mine.entities[id].isLive ? ` — ${t('selectRoom.someoneHere')}` : ` — ${t('selectRoom.free')}`}
            </option>
          ))}
        </select>

        <Button
          variant='primary'
          className={styles.change}
          disabled={selected === roomId}
          onClick={() => dispatch(enterRoom(selected))}
        >
          {t('selectRoom.change')}
        </Button>
      </>
    </Panel>
  )
}

export default MyRoom
