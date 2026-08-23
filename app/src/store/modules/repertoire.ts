import { createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import HttpApi from 'lib/HttpApi'
import { LOGOUT } from 'shared/actionTypes'
import { translate } from 'lib/i18n'

const api = new HttpApi()

/** what a repertoire file turned out to be worth here */
export interface ImportReport {
  singer: string | null
  songs: {
    total: number
    matched: number
    matchedByName: number
    missing: { artist: string, title: string, sourceId: string | null }[]
  }
  pitches: {
    applied: number
    /** applied against a different recording, so a starting point rather than the answer */
    approximated: number
    unmatched: number
    kept: number
  }
  stars: { songs: number }
}

export interface ImportParams {
  /** the file the singer picked on their phone */
  file?: File | null
  /** ...or a link to one they keep somewhere public */
  url?: string
  /** admin only: apply it to somebody else's account */
  userId?: number
}

export const importRepertoire = createAsyncThunk<ImportReport, ImportParams>(
  'repertoire/IMPORT',
  async ({ file, url, userId }) => {
    const data = new FormData()

    if (file) data.append('repertoire', file)
    else if (url) data.append('url', url.trim())

    if (typeof userId === 'number') data.append('userId', String(userId))

    return await api.post<ImportReport>('repertoire/import', { body: data })
  },
)

/**
 * Ask the server to fetch the songs the file named and this library lacks.
 * Admin only; progress arrives through the same bulk-import pushes a playlist
 * import uses.
 */
export const fetchMissingSongs = createAsyncThunk<unknown, { songs: ImportReport['songs']['missing'], title?: string }>(
  'repertoire/FETCH_MISSING',
  async ({ songs, title }) => await api.post('repertoire/fetch-missing', {
    body: { songs: songs.filter(song => song.sourceId), title },
  }),
)

export const clearImportReport = createAction('repertoire/CLEAR')

interface RepertoireState {
  isImporting: boolean
  report: ImportReport | null
  error: string | null
  isFetchingMissing: boolean
}

const initialState: RepertoireState = {
  isImporting: false,
  report: null,
  error: null,
  isFetchingMissing: false,
}

const repertoireReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(importRepertoire.pending, (state) => {
      state.isImporting = true
      state.error = null
      state.report = null
    })
    .addCase(importRepertoire.fulfilled, (state, { payload }) => {
      state.isImporting = false
      state.report = payload
    })
    .addCase(importRepertoire.rejected, (state, action) => {
      state.isImporting = false
      state.error = action.error.message ?? translate('repertoire.couldNotRead')
    })
    .addCase(fetchMissingSongs.pending, (state) => {
      state.isFetchingMissing = true
    })
    .addCase(fetchMissingSongs.fulfilled, (state) => {
      state.isFetchingMissing = false
    })
    .addCase(fetchMissingSongs.rejected, (state, action) => {
      state.isFetchingMissing = false
      state.error = action.error.message ?? null
    })
    .addCase(clearImportReport, (state) => {
      state.report = null
      state.error = null
    })
    .addCase(createAction(LOGOUT), () => initialState)
})

export default repertoireReducer
