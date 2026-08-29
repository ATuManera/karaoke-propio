import { AnyAction, createAction, createAsyncThunk, createReducer } from '@reduxjs/toolkit'
import {
  CLEAR_ERROR_MESSAGE,
  FOOTER_HEIGHT_CHANGE,
  HEADER_HEIGHT_CHANGE,
  PITCH_FEEDBACK_RESPOND,
  SHOW_ERROR_MESSAGE,
  UI_WINDOW_RESIZE,
  _ERROR,
} from 'shared/actionTypes'
import { RootState } from 'store/store'

const MAX_CONTENT_WIDTH = 768
let scrollLockTimer: ReturnType<typeof setTimeout> | null

// ------------------------------------
// Actions
// ------------------------------------
export const clearErrorMessage = createAction(CLEAR_ERROR_MESSAGE)
export const showErrorMessage = createAction<string>(SHOW_ERROR_MESSAGE)

export const setHeaderHeight = createAsyncThunk<void, number, { state: RootState }>('ui/SET_HEADER_HEIGHT', async (height: number, { dispatch, getState }) => {
  if (getState().ui.headerHeight === height) return
  dispatch({
    type: HEADER_HEIGHT_CHANGE,
    payload: height ?? 0, // height might be undefined if Header renders nothing
  })
})

export const setFooterHeight = createAsyncThunk<void, number, { state: RootState }>('ui/SET_HEADER_HEIGHT', async (height: number, { dispatch, getState }) => {
  if (getState().ui.footerHeight === height) return
  dispatch({
    type: FOOTER_HEIGHT_CHANGE,
    payload: height ?? 0, // height might be undefined if Header renders nothing
  })
})

export const windowResize = createAction(UI_WINDOW_RESIZE, window => ({
  payload: window,
  meta: {
    throttle: {
      wait: 200,
      leading: false,
    },
  },
}))

// does not dispatch anything (only affects the DOM)
export const lockScrolling = (lock: boolean) => {
  if (lock) {
    clearTimeout(scrollLockTimer)
    scrollLockTimer = null
    document.body.classList.add('scroll-lock')
  } else if (!scrollLockTimer) {
    scrollLockTimer = setTimeout(() => {
      scrollLockTimer = null
      document.body.classList.remove('scroll-lock')
    }, 200)
  }
}
const footerHeightChange = createAction<number>(FOOTER_HEIGHT_CHANGE)
const headerHeightChange = createAction<number>(HEADER_HEIGHT_CHANGE)

// ------------------------------------
// Reducer
// ------------------------------------
export interface UIState {
  isErrored: boolean
  errorMessage: string | null
  footerHeight: number
  headerHeight: number
  innerWidth: number
  innerHeight: number
  contentWidth: number
}

const initialState: UIState = {
  isErrored: false,
  errorMessage: null,
  footerHeight: 0,
  headerHeight: 0,
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
  contentWidth: Math.min(window.innerWidth, MAX_CONTENT_WIDTH),
}

/**
 * Failures that belong beside the thing that failed, or nowhere at all.
 *
 * Everything else with an `error` raises the global dialog, which is right for
 * a failure the singer has to know about and wrong for one they caused by
 * finishing with something.
 */
const QUIET_ERRORS = new Set<string>([
  // Category additions keep their error beside the value that failed, so the
  // song dialog remains open and the admin can retry it. Raising the global
  // dialog here used to cover that editor and make it look closed.
  'categories/ADD_TO_SONG/rejected',

  // Dismissing "How was that pitch?" for a question the server no longer
  // holds — it lapsed, it was answered on another device, or the server was
  // restarted, since the question is kept in memory only. The singer asked for
  // it to go away and it is going away; telling them it was already gone
  // answers a question nobody asked, in a dialog they then have to dismiss too.
  PITCH_FEEDBACK_RESPOND + _ERROR,
])

const uiReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(headerHeightChange, (state, { payload }) => {
      state.headerHeight = payload
    })
    .addCase(footerHeightChange, (state, { payload }) => {
      state.footerHeight = payload
    })
    .addCase(showErrorMessage, (state, { payload }) => {
      state.isErrored = true
      state.errorMessage = payload
    })
    .addCase(clearErrorMessage, (state) => {
      state.isErrored = false
    })
    .addCase(windowResize, (state, { payload }) => {
      state.innerWidth = payload.innerWidth
      state.innerHeight = payload.innerHeight
      state.contentWidth = Math.min(payload.innerWidth, MAX_CONTENT_WIDTH)
    })
    .addMatcher(
      (action): action is AnyAction => !!action.error && !QUIET_ERRORS.has(action.type),
      (state, { error }) => {
        state.isErrored = true
        state.errorMessage = error.message ?? error
      },
    )
})

export default uiReducer
