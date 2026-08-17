import { createAction, createReducer } from '@reduxjs/toolkit'
import {
  SET_SONG_PITCH_PREF,
  CLEAR_SONG_PITCH_PREF,
  PITCH_PREFS_PUSH,
  SOCKET_AUTH_ERROR,
  LOGOUT,
} from 'shared/actionTypes'
import type { SongPitchPrefs } from 'shared/types'

// ------------------------------------
// Actions
// ------------------------------------
export const setSongPitchPref = createAction(SET_SONG_PITCH_PREF, (
  songId: number,
  pitchSemitones: number,
  mediaId?: number | null,
) => ({
  payload: { songId, pitchSemitones, mediaId: mediaId ?? null },
  meta: { isOptimistic: true },
}))

export const clearSongPitchPref = createAction(CLEAR_SONG_PITCH_PREF, (songId: number) => ({
  payload: { songId },
  meta: { isOptimistic: true },
}))

const pitchPrefsPush = createAction<SongPitchPrefs>(PITCH_PREFS_PUSH)

// ------------------------------------
// Reducer
// ------------------------------------
/**
 * The pitch this user sings each song best in, keyed by songId.
 *
 * Only ever this user's own: the server sends each person their own saved
 * pitches and nobody else's, because two singers' answers for the same song
 * are different numbers and neither is the song's "real" pitch.
 */
const initialState: SongPitchPrefs = {}

const userPitchPrefsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(setSongPitchPref, (state, { payload }) => {
      // optimistic; the server's PITCH_PREFS_PUSH is the real answer
      state[payload.songId] = {
        pitchSemitones: payload.pitchSemitones,
        source: 'manual',
        mediaId: payload.mediaId,
        dateUpdated: Math.floor(Date.now() / 1000),
      }
    })
    .addCase(clearSongPitchPref, (state, { payload }) => {
      delete state[payload.songId]
    })
    .addCase(pitchPrefsPush, (state, { payload }) => payload)
    .addCase(LOGOUT, () => ({ ...initialState }))
    .addCase(SOCKET_AUTH_ERROR, () => ({ ...initialState }))
})

export default userPitchPrefsReducer
