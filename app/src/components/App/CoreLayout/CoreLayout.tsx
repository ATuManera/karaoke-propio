import React, { useEffect, useRef } from 'react'
import { useMatch } from 'react-router'
import { useAppDispatch, useAppSelector } from 'store/hooks'
import useResizeObserver from 'use-resize-observer'
// global stylesheets should be imported before any
// components that will import their own modular css
import '../../../styles/global.css'
import Button from 'components/Button/Button'
import Header from 'components/Header/Header'
import Navigation from 'components/Navigation/Navigation'
import Modal from 'components/Modal/Modal'
import PitchFeedbackPrompt from 'components/PitchFeedbackPrompt/PitchFeedbackPrompt'
import SongInfo from 'components/SongInfo/SongInfo'
import RoomGate from 'components/RoomGate/RoomGate'
import Routes from '../Routes/Routes'
import { fetchPrefs } from 'store/modules/prefs'
import { fetchMyRooms } from 'store/modules/rooms'
import { clearErrorMessage, setFooterHeight, setHeaderHeight } from 'store/modules/ui'
import { applyLocale, resolveLocale } from 'lib/i18n'

const CoreLayout = () => {
  const isPlayerRoute = useMatch('/player')
  const dispatch = useAppDispatch()
  const headerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const isSignedIn = useAppSelector(state => state.user.userId !== null)
  const isAdmin = useAppSelector(state => state.user.isAdmin)
  const accountLocale = useAppSelector(state => state.user.locale)
  const hasNoRoom = useAppSelector(state => state.user.userId !== null && state.user.roomId === null)
  const myRooms = useAppSelector(state => state.rooms.mine)

  // Signed in, but nowhere yet: someone with more than one room to choose
  // from, or nobody's room at all. Both are answered on one screen, and until
  // they are there is nothing useful behind the app — every route needs a room
  // to ask the server about.
  //
  // The exception is an admin of an installation with no rooms in it. Sending
  // them to a screen that says "ask an admin" would be a joke at their
  // expense; they need the Rooms panel, which is behind this gate.
  const needsRoom = hasNoRoom && !(isAdmin && myRooms.isFetched && !myRooms.result.length)

  useEffect(() => {
    if (hasNoRoom && !myRooms.isFetched) dispatch(fetchMyRooms())
  }, [dispatch, hasNoRoom, myRooms.isFetched])

  // The account's language wins over the phone's, and this is where it starts
  // to: the app boots before anyone is signed in, so the first paint follows
  // the browser and this puts the account's answer over it the moment there
  // is one — a sign-in, a rehydrated session, a language changed on another
  // device and picked up here.
  useEffect(() => {
    applyLocale(resolveLocale(accountLocale))
  }, [accountLocale])

  // An admin is handed prefs over the socket the moment it connects; everyone
  // else has to ask, and until they do the app can't know whether this person
  // is allowed to open the Player. Asking here rather than from the account
  // screen means a TV reopened straight at /player finds out too.
  useEffect(() => {
    if (isSignedIn && !isAdmin) dispatch(fetchPrefs())
  }, [dispatch, isAdmin, isSignedIn])

  useResizeObserver({
    onResize: ({ height }) => { dispatch(setHeaderHeight(height)) },
    ref: headerRef,
  })

  useResizeObserver({
    onResize: ({ height }) => { dispatch(setFooterHeight(height)) },
    ref: navRef,
  })

  // the observer cannot report a bar that is no longer rendered, and the
  // padding it asked for would otherwise outlive it
  useEffect(() => {
    if (!isSignedIn || needsRoom) dispatch(setFooterHeight(0))
  }, [dispatch, isSignedIn, needsRoom])

  useEffect(() => {
    if (needsRoom) dispatch(setHeaderHeight(0))
  }, [dispatch, needsRoom])

  const ui = useAppSelector(state => state.ui)
  const closeError = () => dispatch(clearErrorMessage())

  return (
    <>
      {/* The header belongs to a room: the playback controls act on one, the
          library search asks one for songs, and the scan progress is an
          admin's view of the installation. On the way in there is no room to
          act on, and /library — where someone lands with a redirect in hand —
          would otherwise draw its search bar across the top of the question. */}
      {!needsRoom && <Header ref={headerRef} />}

      {needsRoom ? <RoomGate /> : <Routes />}

      {/* Nothing behind those icons until someone is signed in: every one of
          them bounces back to this screen, so they are four ways to go nowhere
          sitting on top of the form. */}
      {!isPlayerRoute && isSignedIn && !needsRoom && <Navigation ref={navRef} />}

      {/* Everywhere the singer might be — library, queue, photos, account —
          but never on the Player: that screen belongs to the whole room, and
          what someone sings in belongs to them. */}
      {!isPlayerRoute && <PitchFeedbackPrompt />}

      <SongInfo />

      {ui.isErrored && (
        <Modal
          title='Oops...'
          onClose={closeError}
          buttons={<Button variant='primary' onClick={closeError}>OK</Button>}
        >
          <p style={{ WebkitUserSelect: 'text', userSelect: 'text' }}>
            {ui.errorMessage}
          </p>
        </Modal>
      )}
    </>
  )
}

export default CoreLayout
