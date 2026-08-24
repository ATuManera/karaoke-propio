import { createAction, createReducer } from '@reduxjs/toolkit'
import { RootState, AppDispatch, AppThunk } from 'store/store'
import getUpcoming from '../selectors/getUpcoming'
import {
  QUEUE_ADD,
  QUEUE_MOVE,
  QUEUE_PUSH,
  QUEUE_REMOVE,
  QUEUE_DEDICATION_SET,
  QUEUE_DEDICATION_REMOVE,
  LOGOUT,
} from 'shared/actionTypes'
import type { QueueItem, OptimisticQueueItem } from 'shared/types'
import { PITCH_DEFAULT } from 'shared/pitch'

// ------------------------------------
// Actions
// ------------------------------------
const logout = createAction(LOGOUT)
export const moveItem = createAction<{ queueId: number, prevQueueId: number }>(QUEUE_MOVE)
export const removeItem = createAction<{ queueId: number | number[] }>(QUEUE_REMOVE)
export const queuePush = createAction<QueueState>(QUEUE_PUSH)

/**
 * Write a message over a queued performance.
 *
 * Not optimistic, unlike queueSong: the server sanitizes the text (see
 * shared/dedication.ts), so showing the phone its own draft would briefly
 * display something other than what the television is about to. The round
 * trip is a queue push, which arrives in the same breath.
 *
 * `dedicationId` addresses an existing message, which is how an admin edits
 * someone else's without taking it over. Left out, the sender writes their
 * own message on that song, replacing whatever they said before.
 */
export const setDedication = createAction(QUEUE_DEDICATION_SET, (
  queueId: number,
  text: string,
  dedicationId?: number,
) => ({
  payload: { queueId, text, dedicationId: dedicationId ?? null },
}))

export const removeDedication = createAction<{ dedicationId: number }>(QUEUE_DEDICATION_REMOVE)

export const queueSong = createAction(QUEUE_ADD, (
  songId: number,
  pitchSemitones: number = PITCH_DEFAULT,
  // which recording to play, when the song has more than one (see VersionModal)
  mediaId?: number,
  /**
   * Pass false when the singer just asked to forget their pitch for this song
   * (see SongList). The server otherwise records every non-zero pitch as an
   * observation, which would immediately undo the forgetting.
   */
  rememberPitch: boolean = true,
  /** the dedication written in the same breath, if any (see PitchModal) */
  dedication: string = '',
) => ({
  payload: { songId, pitchSemitones, mediaId: mediaId ?? null, rememberPitch, dedication },
  meta: { isOptimistic: true },
}))

export const removeUpcomingItems = (userId: number): AppThunk => (dispatch: AppDispatch, getState: () => RootState) => {
  const upcomingQueueIds = getUpcoming(getState(), userId)
  dispatch(removeItem({ queueId: upcomingQueueIds }))
}

// ------------------------------------
// Reducer
// ------------------------------------
interface QueueState {
  isLoading: boolean
  result: number[] // queueIds
  entities: Record<number, QueueItem | OptimisticQueueItem>
}

const initialState: QueueState = {
  isLoading: true,
  result: [],
  entities: {},
}

const queueReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(queueSong, (state, { payload }) => {
      // optimistic
      const nextQueueId = state.result.length ? (state.result[state.result.length - 1] as number) + 1 : 1

      state.result.push(nextQueueId)
      state.entities[nextQueueId] = {
        ...payload,
        queueId: nextQueueId,
        prevQueueId: nextQueueId - 1 || null,
        isOptimistic: true,
      }
    })
    .addCase(queuePush, (state, { payload }) => ({
      isLoading: false,
      result: payload.result,
      entities: payload.entities,
    }))
    .addCase(logout, (state) => {
      state.result = []
      state.entities = {}
    })
})

export default queueReducer
