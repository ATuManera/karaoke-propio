import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import { persistReducer } from 'redux-persist'
import storage from 'redux-persist/lib/storage'
import socket from 'lib/socket'
import AppRouter from 'lib/AppRouter'
import { RootState } from 'store/store'
import HttpApi from 'lib/HttpApi'
import Persistor from 'store/Persistor'
import { fetchPrefs } from './prefs'
import { applyLocale, resolveLocale, setStoredLocale, translate } from 'lib/i18n'
import {
  ACCOUNT_LOCALE_SET,
  ACCOUNT_RECEIVE,
  ACCOUNT_REQUEST,
  ACCOUNT_ROOM_SET,
  ACCOUNT_CREATE,
  ACCOUNT_UPDATE,
  LOGIN,
  LOGOUT,
  SOCKET_AUTH_ERROR,
  SOCKET_REQUEST_CONNECT,
} from 'shared/actionTypes'

const api = new HttpApi('')
const basename = new URL(document.baseURI).pathname

const receiveAccount = createAction<object>(ACCOUNT_RECEIVE)

// ------------------------------------
// Login
// ------------------------------------
export const login = createAsyncThunk(
  LOGIN,
  async (creds: object, thunkAPI) => {
    // calls api endpoint that should set an httpOnly cookie with
    // our JWT, then establish the sockiet.io connection
    const user = await api.post<{ roomId: number | null }>('login', {
      body: creds,
    })

    // signing in can cause additional reducers to be injected and
    // trigger rehydration with stale data, so purge here first
    Persistor.get().purge()

    thunkAPI.dispatch(receiveAccount(user))
    thunkAPI.dispatch(fetchPrefs())
    thunkAPI.dispatch(connectSocket())
    socket.open()

    // redirect in query string?
    //
    // Held back when there is no room yet: signing in with more than one room
    // to choose from lands on the question "which room", and navigating to
    // the library underneath it would answer that question by walking past
    // it. enterRoom finishes the trip once the room is known.
    const redirect = new URLSearchParams(window.location.search).get('redirect')

    if (redirect && user.roomId !== null) {
      AppRouter.navigate(basename.replace(/\/$/, '') + redirect)
    }
  },
)

// ------------------------------------
// Enter a room (or move to another one)
// ------------------------------------
/**
 * Which room someone is in is part of their session, so changing it is not a
 * client-side switch: the server signs a new token, and the socket has to be
 * reconnected because it joined its room at the handshake and nowhere else.
 * Without the reconnect the phone shows one room's name and the other room's
 * queue.
 */
export const enterRoom = createAsyncThunk<void, number, { state: RootState }>(
  ACCOUNT_ROOM_SET,
  async (roomId, thunkAPI) => {
    const user = await api.put('user/room', { body: { roomId } })

    socket.close()

    // moving rooms leaves the previous room's queue and stars in the
    // persisted store, which would rehydrate over the new room's
    Persistor.get().purge()

    thunkAPI.dispatch(receiveAccount(user))
    thunkAPI.dispatch(fetchPrefs())
    thunkAPI.dispatch(connectSocket())
    socket.open()

    // Somewhere to sing. A room was just chosen, so the library is what they
    // came for — unless they were on their way somewhere specific when the
    // question interrupted them.
    const redirect = new URLSearchParams(window.location.search).get('redirect')

    AppRouter.navigate(basename.replace(/\/$/, '') + (redirect ?? '/library'))
  },
)

// ------------------------------------
// Logout
// ------------------------------------
const logout = createAction(LOGOUT)

export const requestLogout = createAsyncThunk(
  LOGOUT,
  async (_, thunkAPI) => {
    try {
      // server response should clear our cookie
      await api.get('logout')
    } catch {
      // ignore errors
    }

    thunkAPI.dispatch(logout())
    Persistor.get().purge()
    socket.close()
  },
)

// ------------------------------------
// Create account
// ------------------------------------
export const createAccount = createAsyncThunk<void, FormData, { state: RootState }>(
  ACCOUNT_CREATE,
  async (data: FormData, thunkAPI) => {
    const isFirstRun = thunkAPI.getState().prefs.isFirstRun

    const user = await api.post(isFirstRun ? 'setup' : 'user', {
      body: data,
    })

    // signing in can cause additional reducers to be injected and
    // trigger rehydration with stale data, so purge here first
    Persistor.get().purge()

    thunkAPI.dispatch(receiveAccount(user))
    thunkAPI.dispatch(fetchPrefs())
    thunkAPI.dispatch(connectSocket())
    socket.open()

    // Somewhere to sing, not a settings screen. Someone who typed a display
    // name to get into a party has no use yet for preferences, repertoire
    // export and the rest of the account page, and being met with it reads as
    // one more form. They will find it when they want it.
    //
    // Except on first run: the admin who just created this installation is on
    // the one screen where the work is — a library with no paths yet has
    // nothing to show them.
    const redirect = new URLSearchParams(window.location.search).get('redirect')
    const to = redirect ?? (isFirstRun ? null : '/library')

    if (to) {
      AppRouter.navigate(basename.replace(/\/$/, '') + to)
    }
  },
)

// ------------------------------------
// Update account
// ------------------------------------
export const updateAccount = createAsyncThunk<void, FormData, { state: RootState }>(
  ACCOUNT_UPDATE,
  async (data: FormData, thunkAPI) => {
    const { userId } = thunkAPI.getState().user

    const user = await api.put(`user/${userId}`, {
      body: data,
    })

    thunkAPI.dispatch(receiveAccount(user))
    alert(translate('account.updated'))
  },
)

// ------------------------------------
// Request account (does not refresh JWT)
// ------------------------------------
export const fetchAccount = createAsyncThunk(
  ACCOUNT_REQUEST,
  async (_, thunkAPI) => {
    try {
      const user = await api.get('user')
      thunkAPI.dispatch(receiveAccount(user))
    } catch {
      // ignore errors
    }
  },
)

// ------------------------------------
// Language
// ------------------------------------
/**
 * Choose the language, or hand the choice back to the phone by passing null.
 *
 * Applied here and now rather than waiting for the round trip: the point of
 * tapping a language is to see it change. The request that follows is what
 * makes it survive to the next phone, and the browser keeps a copy so the
 * sign-in screen — which happens before any account is known — speaks it too.
 */
export const setLocale = createAsyncThunk<void, string | null, { state: RootState }>(
  ACCOUNT_LOCALE_SET,
  async (locale, thunkAPI) => {
    setStoredLocale(locale)
    applyLocale(resolveLocale(locale))

    if (thunkAPI.getState().user.userId === null) return

    const user = await api.put('user/locale', { body: { locale } })
    thunkAPI.dispatch(receiveAccount(user))
  },
)

// ------------------------------------
// Socket actions
// ------------------------------------
const requestSocketConnect = createAction<object>(SOCKET_REQUEST_CONNECT)

export const connectSocket = createAsyncThunk<void, void, { state: RootState }>(
  'user/SOCKET_CONNECT',
  async (_, { dispatch, getState }) => {
    const versions = {
      library: getState().library.version,
      stars: getState().starCounts.version,
    }

    dispatch(requestSocketConnect(versions))
    socket.io.opts.query = versions
  },
)

// ------------------------------------
// Reducer
// ------------------------------------
interface UserState {
  userId: number | null
  username: string | null
  name: string | null
  roomId: number | null
  isAdmin: boolean
  isGuest: boolean
  dateCreated: number
  dateUpdated: number
  /** the language they chose; null means "follow the phone" */
  locale: string | null
}

const initialState: UserState = {
  userId: null,
  username: null,
  name: null,
  roomId: null,
  isAdmin: false,
  isGuest: false,
  dateCreated: 0,
  dateUpdated: 0,
  locale: null,
}

const userReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(receiveAccount, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(LOGOUT, () => ({
      ...initialState,
    }))
    .addCase(SOCKET_AUTH_ERROR, () => ({
      ...initialState,
    }))
})

export default persistReducer({
  key: 'user',
  storage,
}, userReducer)
