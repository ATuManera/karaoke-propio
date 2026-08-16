import { createAction, createReducer } from '@reduxjs/toolkit'
import {
  ACQUISITION_SEARCH,
  ACQUISITION_PREVIEW,
  ACQUISITION_ADD,
  ACQUISITION_PUSH,
  LOGOUT,
} from 'shared/actionTypes'
import type { AcquisitionRequest, AcquisitionSearchResult, AcquisitionSource } from 'shared/types'

// ------------------------------------
// Actions
// ------------------------------------
const logout = createAction(LOGOUT)

export const searchAcquisition = createAction(
  ACQUISITION_SEARCH,
  (query: string, source: AcquisitionSource, karaokeOnly = true) => ({
    payload: { query, source, karaokeOnly },
  }),
)

// resolves a YouTube video id to embed as a preview BEFORE committing to a
// download — the user confirms the version is good on their own screen
// (this modal), not the room's shared Player
export const previewAcquisition = createAction(ACQUISITION_PREVIEW, (source: AcquisitionSource, resultId: string) => ({
  payload: { source, resultId },
}))

export const clearPreview = createAction('acquisition/CLEAR_PREVIEW')

export const acquireResult = createAction(ACQUISITION_ADD, (
  source: AcquisitionSource,
  resultId: string,
  title: string,
  pitchSemitones: number,
  query: string,
  // user-confirmed metadata; decides the artist this song files under
  artist?: string,
  songTitle?: string,
  viewCount?: number | null,
) => ({
  payload: { source, resultId, title, pitchSemitones, query, artist, songTitle, viewCount },
}))

// pushed by the server as an acquisition moves through its pipeline
export const acquisitionPush = createAction<AcquisitionRequest>(ACQUISITION_PUSH)

// ------------------------------------
// Reducer
// ------------------------------------

// shapes of the socket ack actions the server sends back (see
// server/Acquisition/socket.ts's acknowledge() calls) — not created via a
// local action creator, so typed here for the addCase(string, ...) cases
interface SearchSuccessAction {
  type: string
  payload: { results: AcquisitionSearchResult[] }
}

interface PreviewSuccessAction {
  type: string
  payload: { videoId: string }
}

interface AckErrorAction {
  type: string
  error: string
}

interface AcquisitionState {
  isSearching: boolean
  searchError: string | null
  results: AcquisitionSearchResult[]
  /** the query/source `results` came from, so reopening the modal can reuse them instead of re-running the search */
  resultsQuery: string | null
  resultsSource: AcquisitionSource | null
  /** query/source of the search currently in flight; promoted to results* on success */
  pendingQuery: string | null
  pendingSource: AcquisitionSource | null
  isPreviewLoading: boolean
  previewError: string | null
  /** null until ACQUISITION_PREVIEW resolves — the resolved YouTube video id (used for the "Watch on YouTube" fallback link) */
  previewVideoId: string | null
  /** the most recent in-flight/finished request this client knows about */
  activeRequest: AcquisitionRequest | null
  addError: string | null
}

const initialState: AcquisitionState = {
  isSearching: false,
  searchError: null,
  results: [],
  resultsQuery: null,
  resultsSource: null,
  pendingQuery: null,
  pendingSource: null,
  isPreviewLoading: false,
  previewError: null,
  previewVideoId: null,
  activeRequest: null,
  addError: null,
}

const isSearchSuccess = (action: { type: string }): action is SearchSuccessAction =>
  action.type === `${ACQUISITION_SEARCH}_SUCCESS`
const isSearchError = (action: { type: string }): action is AckErrorAction =>
  action.type === `${ACQUISITION_SEARCH}_ERROR`
const isPreviewSuccess = (action: { type: string }): action is PreviewSuccessAction =>
  action.type === `${ACQUISITION_PREVIEW}_SUCCESS`
const isPreviewError = (action: { type: string }): action is AckErrorAction =>
  action.type === `${ACQUISITION_PREVIEW}_ERROR`
const isAddError = (action: { type: string }): action is AckErrorAction =>
  action.type === `${ACQUISITION_ADD}_ERROR`

const acquisitionReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(searchAcquisition, (state, { payload }) => {
      state.isSearching = true
      state.searchError = null
      state.pendingQuery = payload.query
      state.pendingSource = payload.source
    })
    .addCase(previewAcquisition, (state) => {
      state.isPreviewLoading = true
      state.previewError = null
      state.previewVideoId = null
    })
    .addCase(clearPreview, (state) => {
      state.isPreviewLoading = false
      state.previewError = null
      state.previewVideoId = null
    })
    .addCase(acquireResult, (state) => {
      state.addError = null
    })
    .addCase(acquisitionPush, (state, { payload }) => {
      state.activeRequest = payload
    })
    .addCase(logout, () => initialState)
    // ack actions the server sends back over the socket (see
    // server/Acquisition/socket.ts's acknowledge() calls) — not created via
    // a local action creator, so matched here by type string instead of
    // addCase's stricter action-creator-shape requirement
    .addMatcher(isSearchSuccess, (state, action) => {
      state.isSearching = false
      state.results = action.payload.results
      state.resultsQuery = state.pendingQuery
      state.resultsSource = state.pendingSource
    })
    .addMatcher(isSearchError, (state, action) => {
      state.isSearching = false
      state.searchError = action.error
    })
    .addMatcher(isPreviewSuccess, (state, action) => {
      state.isPreviewLoading = false
      state.previewVideoId = action.payload.videoId
    })
    .addMatcher(isPreviewError, (state, action) => {
      state.isPreviewLoading = false
      state.previewError = action.error
    })
    .addMatcher(isAddError, (state, action) => {
      state.addError = action.error
    })
})

export default acquisitionReducer
