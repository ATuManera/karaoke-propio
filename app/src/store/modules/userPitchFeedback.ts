import { createAction, createReducer } from '@reduxjs/toolkit'
import {
  PITCH_FEEDBACK_PUSH,
  PITCH_FEEDBACK_RESPOND,
  PITCH_FEEDBACK_RESOLVED,
  SOCKET_AUTH_ERROR,
  LOGOUT,
  _ERROR,
} from 'shared/actionTypes'
import type { PitchFeedbackChoice, PitchFeedbackPrompt, PitchFeedbackResolved } from 'shared/pitchFeedback'

// ------------------------------------
// Actions
// ------------------------------------
/**
 * Answer the question. Only the choice travels — the server knows which song,
 * which version and which pitch it asked about, and works out the number
 * itself, so no device can talk it into saving something else.
 */
export const respondPitchFeedback = createAction(PITCH_FEEDBACK_RESPOND, (
  feedbackId: string,
  choice: PitchFeedbackChoice,
) => ({
  payload: { feedbackId, choice },
}))

/** Stop showing a question locally (it lapsed, or its answer was acknowledged). */
export const clearPitchFeedback = createAction('pitchFeedback/CLEAR')

const pitchFeedbackPush = createAction<PitchFeedbackPrompt>(PITCH_FEEDBACK_PUSH)
const pitchFeedbackResolved = createAction<PitchFeedbackResolved>(PITCH_FEEDBACK_RESOLVED)
const pitchFeedbackRespondError = createAction(PITCH_FEEDBACK_RESPOND + _ERROR)

// ------------------------------------
// Reducer
// ------------------------------------
export interface UserPitchFeedbackState {
  /** the one question this singer is being asked, if any */
  prompt: PitchFeedbackPrompt | null
  /** what came of answering it, kept just long enough to say so */
  resolution: PitchFeedbackResolved | null
  isSubmitting: boolean
}

/**
 * "How was that pitch?" — transient, and only ever about this user.
 *
 * The answer itself belongs in `userPitchPrefs`, which is where the saved pitch
 * arrives by the usual PITCH_PREFS_PUSH. Nothing here is persisted: a question
 * nobody got round to is not worth restoring hours later.
 */
const initialState: UserPitchFeedbackState = {
  prompt: null,
  resolution: null,
  isSubmitting: false,
}

const userPitchFeedbackReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(pitchFeedbackPush, (state, { payload }) => ({
      prompt: payload,
      resolution: null,
      isSubmitting: false,
    }))
    .addCase(respondPitchFeedback, (state) => {
      // five taps in a row on a slow phone would otherwise be five answers
      state.isSubmitting = true
    })
    .addCase(pitchFeedbackResolved, (state, { payload }) => {
      // could be about a question this device never saw (answered elsewhere,
      // or replaced by a newer performance) — leave the current one alone
      if (state.prompt?.feedbackId !== payload.feedbackId) return state

      // nothing saved and nothing to explain: just close it
      if (payload.pitchSemitones === null && payload.limit === null) {
        return { ...initialState }
      }

      return { ...state, resolution: payload, isSubmitting: false }
    })
    .addCase(pitchFeedbackRespondError, () => ({ ...initialState }))
    .addCase(clearPitchFeedback, () => ({ ...initialState }))
    .addCase(LOGOUT, () => ({ ...initialState }))
    .addCase(SOCKET_AUTH_ERROR, () => ({ ...initialState }))
})

export default userPitchFeedbackReducer
