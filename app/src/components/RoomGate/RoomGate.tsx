import React, { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import { fetchMyRooms } from 'store/modules/rooms'
import { enterRoom, requestLogout } from 'store/modules/user'
import Button from 'components/Button/Button'
import Logo from 'components/Logo/Logo'
import Spinner from 'components/Spinner/Spinner'
import { useT } from 'lib/i18n'
import styles from './RoomGate.css'

/**
 * Which room, asked after signing in rather than before.
 *
 * The sign-in screen used to list every room on the installation to anyone who
 * could reach the address, and let them pick one before saying who they were.
 * That made the room list public and put the choice in the wrong hands: which
 * rooms a person may enter is an admin's decision, so it can only be answered
 * once there is a person to answer it about.
 *
 * So this screen is what is left of that question. It appears only when there
 * is a question to ask — someone with a single room never sees it, because the
 * server puts them straight in — and it always arrives with an answer already
 * chosen, the admin's the first time and their own after that.
 */
const RoomGate = () => {
  const t = useT()
  const dispatch = useAppDispatch()

  const ui = useAppSelector(state => state.ui)
  const mine = useAppSelector(state => state.rooms.mine)

  const [choice, setChoice] = useState<number | null>(null)
  const [isEntering, setIsEntering] = useState(false)

  // The preselection is whatever the server worked out, until this person
  // touches the list — after which it is theirs, including changing it back.
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevPreferred, setPrevPreferred] = useState<number | null>(null)

  if (mine.preferredRoomId !== prevPreferred) {
    setPrevPreferred(mine.preferredRoomId)
    setChoice(mine.preferredRoomId)
  }

  // What the control is actually showing.
  //
  // A select always displays one of its options, so the state has to name the
  // same one or the screen contradicts itself: with no preference set, `choice`
  // stayed null while the select showed the first room, and Enter sat disabled
  // under a room that looked chosen. The cards could afford that — none of them
  // looked picked — a dropdown cannot.
  const selected = choice ?? mine.preferredRoomId ?? mine.result[0] ?? null

  const go = (roomId: number) => {
    setIsEntering(true)

    dispatch(enterRoom(roomId))
      .then((res): undefined => {
        // a room that closed while this screen was open, most likely; the
        // error itself is already on its way to the modal that every rejected
        // thunk raises
        if (enterRoom.rejected.match(res)) {
          setIsEntering(false)
          dispatch(fetchMyRooms())
        }

        return undefined
      })
      .catch((): undefined => undefined)
  }

  // One room is not a question. The server already answers it at sign-in, so
  // this is for the way back — someone whose other rooms were revoked while
  // they were signed in, and who would otherwise be asked to "choose" from a
  // list of one.
  const onlyRoomId = mine.isFetched && mine.result.length === 1 ? mine.result[0] : null

  useEffect(() => {
    if (onlyRoomId !== null && !isEntering) go(onlyRoomId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyRoomId])

  if (!mine.isFetched || onlyRoomId !== null) {
    return <Spinner />
  }

  const size = {
    width: ui.contentWidth,
    height: ui.innerHeight,
    maxWidth: Math.max(340, ui.contentWidth * 0.66),
  }

  // Nobody has been given a room. Said plainly, with what to do about it,
  // because there is nothing on this screen they can do themselves — and an
  // empty list with a dead button would read as the app being broken.
  if (!mine.result.length) {
    return (
      <div className={styles.container} style={size}>
        <Logo className={styles.logo} />
        <h1>{t('selectRoom.noneTitle')}</h1>
        <p className={styles.hint}>{t('selectRoom.noneBody')}</p>

        <Button variant='default' onClick={() => dispatch(requestLogout())}>
          {t('account.signOut')}
        </Button>
      </div>
    )
  }

  return (
    <div className={styles.container} style={size}>
      <Logo className={styles.logo} />

      <h1>{t('selectRoom.title')}</h1>
      <p className={styles.hint}>{t('selectRoom.hint')}</p>

      {/* One row, however many rooms there are.

          This was a radio group — one tall card per room — which is a fine
          shape for two rooms and a wrong one for six: the cards pushed the
          Enter button off the bottom of the phone, so choosing a room meant
          scrolling past every other room to reach the way in. A native select
          is still a single choice, still announces itself as one, and on a
          phone it opens the platform's own picker, which is a better list than
          any this screen could draw. It is the control My Room already uses
          for the same question, down to naming the room's state in the option
          — one pattern for "which room", not two.

          Lost with the cards: double-click to enter. It was undiscoverable on
          a screen whose whole audience is on a touchscreen. */}
      <select
        className={styles.roomSelect}
        value={selected ?? ''}
        onChange={e => setChoice(parseInt(e.target.value, 10))}
        disabled={isEntering}
        aria-label={t('selectRoom.title')}
      >
        {mine.result.map((roomId) => {
          const room = mine.entities[roomId]
          const state = room.status === 'closed'
            ? t('selectRoom.closed')
            : room.isLive ? t('selectRoom.someoneHere') : t('selectRoom.free')

          return (
            <option key={roomId} value={roomId}>
              {`${room.name} — ${state}`}
            </option>
          )
        })}
      </select>

      <Button
        variant='primary'
        className={styles.enter}
        disabled={selected === null || isEntering}
        onClick={() => selected !== null && go(selected)}
      >
        {isEntering ? t('selectRoom.entering') : t('selectRoom.enter')}
      </Button>

      <button type='button' className={styles.signOut} onClick={() => dispatch(requestLogout())}>
        {t('account.signOut')}
      </button>
    </div>
  )
}

export default RoomGate
