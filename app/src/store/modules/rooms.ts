import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import { AppThunk, RootState } from 'store/store'
import type { IRoomPrefs, Room } from 'shared/types'
import {
  ROOMS_MINE_REQUEST,
  ROOMS_RECEIVE,
  ROOMS_REQUEST,
  ROOM_EDITOR_OPEN,
  ROOM_EDITOR_CLOSE,
  ROOM_FILTER_STATUS,
  ROOM_UPDATE,
  ROOM_CREATE,
  ROOM_REMOVE,
  ROOM_DEDICATIONS_PUSH,
  ROOM_DEDICATIONS_SET,
  ROOM_PREFS_PUSH,
  ROOM_PREFS_PUSH_REQUEST,
  LOGOUT,
  SOCKET_AUTH_ERROR,
} from 'shared/actionTypes'

import HttpApi from 'lib/HttpApi'
import { translate } from 'lib/i18n'
const api = new HttpApi('rooms')

// ------------------------------------
// Actions
// ------------------------------------
export const receiveRooms = createAction<object>(ROOMS_RECEIVE)

export const fetchRooms = createAsyncThunk(
  ROOMS_REQUEST,
  async () => await api.get(''),
)

export const fetchCurrentRoom = createAsyncThunk<object, void, { state: RootState }>(
  ROOMS_REQUEST,
  async (_, thunkAPI) => {
    const roomId = thunkAPI.getState().user.roomId

    if (typeof roomId !== 'number') {
      return Promise.reject(translate('errors.signIntoARoom'))
    }

    return await api.get(`/${roomId}`)
  },
)

/**
 * The rooms this person may enter, and which one is preselected.
 *
 * Kept apart from the room list above rather than merged into it: that one is
 * the admin's inventory — every room, open or closed, with its prefs and how
 * many people are in it — and the Rooms panel renders it. This is the answer
 * to "where may I go", which is a different question with a different answer
 * for the same person.
 */
export interface MyRooms {
  result: number[]
  entities: Record<number, Room>
  /** always one of `result`, unless there are none */
  preferredRoomId: number | null
}

const userApi = new HttpApi('')

export const fetchMyRooms = createAsyncThunk<MyRooms | null>(
  ROOMS_MINE_REQUEST,
  async () => {
    try {
      return await userApi.get<MyRooms>('user/rooms')
    } catch {
      // Quietly. A session that died while this tab was closed answers 401
      // here, and the socket is being told the same thing at the same moment —
      // which resets the account and puts the sign-in screen up. An "Oops:
      // Unauthorized" over the top of that explains nothing to anyone, and it
      // is what every other rejected thunk would raise.
      return null
    }
  },
)

export const createRoom = createAsyncThunk(
  ROOM_CREATE,
  async (data: object, thunkAPI) => {
    const response = await api.post('', {
      body: data,
    })

    thunkAPI.dispatch(receiveRooms(response))
    thunkAPI.dispatch(closeRoomEditor())
  },
)

export const updateRoom = createAsyncThunk(
  ROOM_UPDATE,
  async ({
    roomId,
    data,
  }: {
    roomId: number
    data: object
  }, thunkAPI) => {
    const response = await api.put(`/${roomId}`, {
      body: data,
    })

    thunkAPI.dispatch(receiveRooms(response))
    thunkAPI.dispatch(closeRoomEditor())
  },
)

export const removeRoom = createAsyncThunk(
  ROOM_REMOVE,
  async (roomId: number, thunkAPI) => {
    const response = await api.delete(`/${roomId}`)

    thunkAPI.dispatch(receiveRooms(response))
    thunkAPI.dispatch(closeRoomEditor())
  },
)

export const openRoomEditor = createAction(ROOM_EDITOR_OPEN)
export const closeRoomEditor = createAction(ROOM_EDITOR_CLOSE)
export const filterByStatus = createAction<boolean | string>(ROOM_FILTER_STATUS)
const roomPrefsPush = createAction<{ roomId: number, prefs: IRoomPrefs }>(ROOM_PREFS_PUSH)
const roomDedicationsPush = createAction<{ isEnabled: boolean }>(ROOM_DEDICATIONS_PUSH)

/**
 * Flip the dedication switch for the room this admin is in — the same room
 * pref the Edit Room form writes, reached from the playback menu instead.
 *
 * Not optimistic: the server answers with a push to the whole room, and the
 * checkbox showing "off" on one phone while everyone else's still offers to
 * write would be worse than a moment's delay.
 */
export const setRoomDedications = createAction<{ isEnabled: boolean }>(ROOM_DEDICATIONS_SET)

export function requestPrefsPush (roomId: number, prefs: IRoomPrefs): AppThunk {
  return (dispatch) => {
    dispatch({
      type: ROOM_PREFS_PUSH_REQUEST,
      payload: {
        roomId,
        prefs,
      },
      meta: {
        throttle: {
          wait: 200,
          leading: true,
        },
      },
    })
  }
}

// ------------------------------------
// Reducer
// ------------------------------------
interface RoomsState {
  result: number[]
  entities: Record<number, Room>
  filterStatus: boolean | string
  isEditorOpen: boolean
  /**
   * Whether the room this client is in is taking dedications. Kept here
   * rather than read off that room's prefs because only the Player ever
   * fetches those, and every phone in the room needs the answer — so the
   * server pushes it on connect and whenever an admin saves the room.
   *
   * True until told otherwise, which is the same default the rest of the
   * feature uses: a room that has never been asked is one where dedications
   * were already appearing.
   */
  areDedicationsEnabled: boolean
  /**
   * The rooms this client may enter. Empty until asked for, which happens on
   * the screen that asks which room — so `isFetched` is what tells "no rooms
   * yet" from "nobody has asked yet", and the two must not look alike: one is
   * a message telling someone to go find an admin.
   */
  mine: {
    result: number[]
    entities: Record<number, Room>
    preferredRoomId: number | null
    isFetched: boolean
  }
}

const initialState: RoomsState = {
  result: [],
  entities: {},
  filterStatus: 'open',
  isEditorOpen: false,
  areDedicationsEnabled: true,
  mine: {
    result: [],
    entities: {},
    preferredRoomId: null,
    isFetched: false,
  },
}

const roomsReducer = createReducer(initialState, (builder) => {
  builder
    // handles both fetchRooms and fetchCurrentRoom
    .addCase(fetchRooms.fulfilled, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(fetchMyRooms.fulfilled, (state, { payload }) => {
      // Left untouched when the answer never came: an empty list means "an
      // admin has given you nothing", which is a thing to tell somebody, and
      // a failed request must not be able to say it.
      if (payload) state.mine = { ...payload, isFetched: true }
    })
    .addCase(receiveRooms, (state, { payload }) => ({
      ...state,
      ...payload,
    }))
    .addCase(openRoomEditor, (state) => {
      state.isEditorOpen = true
    })
    .addCase(closeRoomEditor, (state) => {
      state.isEditorOpen = false
    })
    .addCase(filterByStatus, (state, { payload }) => {
      state.filterStatus = payload
    })
    .addCase(roomPrefsPush, (state, { payload }) => {
      const roomId = payload.roomId

      if (state.entities[roomId]) {
        state.entities[roomId].prefs = payload.prefs
      }
    })
    .addCase(roomDedicationsPush, (state, { payload }) => {
      state.areDedicationsEnabled = payload.isEnabled
    })
    .addCase(LOGOUT, () => ({
      ...initialState,
    }))
    // A session can end without anyone pressing Sign Out — an expired cookie,
    // a rotated key, an admin deleting the account — and this list is the one
    // piece of state that says which rooms a particular person may enter. Left
    // behind, the next person to sign in on that tab would be shown the last
    // one's rooms until something refetched.
    .addCase(SOCKET_AUTH_ERROR, () => ({
      ...initialState,
    }))
})

export default roomsReducer
