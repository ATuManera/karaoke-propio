import React, { useEffect, useState } from 'react'
import clsx from 'clsx'
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

      {/* A list of rooms is a single choice, so it is a radio group and says
          so: a set of buttons where one stays pressed is what this looks like,
          and a screen reader would otherwise announce it as a row of buttons
          that each do something. */}
      <div className={styles.rooms} role='radiogroup' aria-label={t('selectRoom.title')}>
        {mine.result.map((roomId) => {
          const room = mine.entities[roomId]

          return (
            <button
              key={roomId}
              type='button'
              role='radio'
              aria-checked={choice === roomId}
              className={clsx(styles.room, choice === roomId && styles.chosen)}
              onClick={() => setChoice(roomId)}
              onDoubleClick={() => go(roomId)}
              disabled={isEntering}
            >
              <span className={styles.roomName} translate='no'>{room.name}</span>
              <span className={styles.roomState}>
                {room.status === 'closed'
                  ? t('selectRoom.closed')
                  : room.isLive ? t('selectRoom.someoneHere') : t('selectRoom.free')}
              </span>
            </button>
          )
        })}
      </div>

      <Button
        variant='primary'
        className={styles.enter}
        disabled={choice === null || isEntering}
        onClick={() => choice !== null && go(choice)}
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
