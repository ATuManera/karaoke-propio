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
import Routes from '../Routes/Routes'
import { fetchPrefs } from 'store/modules/prefs'
import { clearErrorMessage, setFooterHeight, setHeaderHeight } from 'store/modules/ui'

const CoreLayout = () => {
  const isPlayerRoute = useMatch('/player')
  const dispatch = useAppDispatch()
  const headerRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const isSignedIn = useAppSelector(state => state.user.userId !== null)
  const isAdmin = useAppSelector(state => state.user.isAdmin)

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
    if (!isSignedIn) dispatch(setFooterHeight(0))
  }, [dispatch, isSignedIn])

  const ui = useAppSelector(state => state.ui)
  const closeError = () => dispatch(clearErrorMessage())

  return (
    <>
      <Header ref={headerRef} />

      <Routes />

      {/* Nothing behind those icons until someone is signed in: every one of
          them bounces back to this screen, so they are four ways to go nowhere
          sitting on top of the form. */}
      {!isPlayerRoute && isSignedIn && <Navigation ref={navRef} />}

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
