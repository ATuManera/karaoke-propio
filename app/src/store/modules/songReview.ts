import { createAsyncThunk, createReducer, createAction } from '@reduxjs/toolkit'
import HttpApi from 'lib/HttpApi'
import { LOGOUT } from 'shared/actionTypes'

const api = new HttpApi()

/**
 * Songs a bulk playlist import brought in that nobody has looked at yet.
 *
 * Fetched over HTTP rather than pushed with the library, for the reason the
 * server keeps it out of LIBRARY_PUSH: this is one admin's worklist, not
 * something every phone in the room needs a copy of.
 */
export interface PendingSong {
  songId: number
  /** the YouTube title the artist and title were guessed from */
  sourceTitle: string
  playlistId: string | null
  /** 1 when nothing in the library corroborated the reading */
  isAmbiguous: number
  dateCreated: number
}

export const fetchPendingReview = createAsyncThunk(
  'songReview/FETCH',
  async () => await api.get<{ pending: PendingSong[] }>('review'),
)

export const markSongReviewed = createAsyncThunk(
  'songReview/MARK_REVIEWED',
  async (songId: number, thunkAPI) => {
    await api.request('DELETE', `review/${songId}`)
    await thunkAPI.dispatch(fetchPendingReview())
  },
)

/**
 * Read the names of everything still awaiting review again, and fix what is
 * the wrong way round. Minutes long and rate limited upstream, so it answers
 * 202 and reports itself through the library pushes that follow.
 */
export const recheckPendingNames = createAsyncThunk(
  'songReview/RECHECK',
  async () => await api.request('POST', 'review/recheck'),
)

/** show only the songs still waiting to be checked */
export const toggleFilterPendingReview = createAction('songReview/TOGGLE_FILTER')

interface SongReviewState {
  pending: PendingSong[]
  isFiltering: boolean
  isRechecking: boolean
}

const initialState: SongReviewState = {
  pending: [],
  isFiltering: false,
  isRechecking: false,
}

const songReviewReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(toggleFilterPendingReview, (state) => {
      state.isFiltering = !state.isFiltering
    })
    .addCase(recheckPendingNames.pending, (state) => {
      state.isRechecking = true
    })
    // the request only starts the job; it finishing means the job is running,
    // not that it is done
    .addCase(recheckPendingNames.fulfilled, (state) => {
      state.isRechecking = false
    })
    .addCase(recheckPendingNames.rejected, (state) => {
      state.isRechecking = false
    })
    .addCase(fetchPendingReview.fulfilled, (state, { payload }) => {
      state.pending = payload.pending
    })
    // a non-admin gets a 401 here, which is the normal answer rather than a
    // problem; the filter simply never has anything to show
    .addCase(fetchPendingReview.rejected, (state) => {
      state.pending = []
    })
    .addCase(createAction(LOGOUT), () => initialState)
})

export default songReviewReducer
