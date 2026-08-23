import React from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router'
import { useAppSelector } from 'store/hooks'

import AccountView from 'routes/Account/views/AccountView'
import LibraryView from 'routes/Library/views/LibraryView'
import QueueView from 'routes/Queue/views/QueueView'
import PhotosView from 'routes/Photos/views/PhotosView'
import getCanLaunchPlayer from 'routes/Player/selectors/getCanLaunchPlayer'

const PlayerView = React.lazy(() => import('routes/Player/views/PlayerView'))

const AppRoutes = () => (
  <Routes>
    <Route path='/account' element={<AccountView />} />
    <Route
      path='/library'
      element={(
        <RequireAuth path='/library' redirectTo='/account'>
          <LibraryView />
        </RequireAuth>
      )}
    />
    <Route
      path='/photos'
      element={(
        <RequireAuth path='/photos' redirectTo='/account'>
          <PhotosView />
        </RequireAuth>
      )}
    />
    <Route
      path='/queue'
      element={(
        <RequireAuth path='/queue' redirectTo='/account'>
          <QueueView />
        </RequireAuth>
      )}
    />
    <Route
      path='/player'
      element={(
        <RequireAuth path='/player' redirectTo='/account'>
          <PlayerView />
        </RequireAuth>
      )}
    />
    <Route
      path='/'
      element={(
        <Navigate
          to={{
            pathname: '/library',
            search: window.location.search, // pass through search params (e.g. roomId)
          }}
          replace
        />
      )}
    />
  </Routes>
)

export default AppRoutes

interface RequireAuthProps {
  children: React.ReactNode
  path: string
  redirectTo: string
}

const RequireAuth = ({
  children,
  path,
  redirectTo,
}: RequireAuthProps) => {
  const { isAdmin, userId } = useAppSelector(state => state.user)
  const canLaunchPlayer = useAppSelector(getCanLaunchPlayer)
  const isPrefsFetched = useAppSelector(state => state.prefs.isFetched === true)
  const location = useLocation()

  if (userId === null) {
    // set their originally-desired location in query parameter
    const params = new URLSearchParams(location.search)
    params.set('redirect', path)

    return <Navigate to={redirectTo + '?' + params.toString()} replace />
  }

  if (path === '/player' && !isAdmin) {
    // Unlike every other permission this one lives in prefs, not on the signed-in
    // user, so it isn't known yet on the first render of a TV reopened straight
    // at /player. Wait for the answer instead of bouncing them to the library.
    if (!isPrefsFetched) return null

    // Asked once per load, in practice: nothing pushes prefs at a non-admin
    // after this (see server/Prefs/socket.ts), so an admin revoking the flag
    // can't navigate a Player away from the song a room is watching. Keep it
    // that way if you ever add a push that reaches them.
    if (!canLaunchPlayer) return <Navigate to='/' replace />
  }

  return children
}
