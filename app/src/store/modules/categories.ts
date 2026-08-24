import { createAsyncThunk, createReducer, createAction } from '@reduxjs/toolkit'
import HttpApi from 'lib/HttpApi'
import { CATEGORIES_PUSH, LIBRARY_PUSH } from 'shared/actionTypes'

const api = new HttpApi()

export type CategoryType = 'genre' | 'decade' | 'voice' | 'language'

export interface CategoryRow {
  categoryId: number
  name: string
  type: CategoryType
  songCount: number
}

interface CategoriesPayload {
  categories: { result: number[], entities: Record<number, CategoryRow> }
  songCategories: Record<number, number[]>
}

export const fetchCategories = createAsyncThunk(
  'categories/FETCH',
  async () => await api.get<CategoriesPayload>('categories'),
)

export const startCategoryScan = createAsyncThunk(
  'categories/SCAN',
  async (force: boolean = false) => await api.request('POST', 'categories/scan', { body: { force } }),
)

export const addSongCategory = createAsyncThunk(
  'categories/ADD_TO_SONG',
  async ({ songId, name, type }: { songId: number, name: string, type: CategoryType }) =>
    await api.request<CategoriesPayload>('POST', `song/${songId}/categories`, { body: { name, type } }),
)

export const removeSongCategory = createAsyncThunk(
  'categories/REMOVE_FROM_SONG',
  async ({ songId, categoryId }: { songId: number, categoryId: number }) =>
    await api.request<CategoriesPayload>('DELETE', `song/${songId}/categories/${categoryId}`),
)

/** which categories the user is filtering by; empty means "show everything" */
export const toggleCategoryFilter = createAction<number>('categories/TOGGLE_FILTER')
export const clearCategoryFilters = createAction('categories/CLEAR_FILTERS')

interface CategoriesState {
  result: number[]
  entities: Record<number, CategoryRow>
  songCategories: Record<number, number[]>
  selected: number[]
  isScanning: boolean
}

const initialState: CategoriesState = {
  result: [],
  entities: {},
  songCategories: {},
  selected: [],
  isScanning: false,
}

const categoriesPush = createAction<CategoriesPayload>(CATEGORIES_PUSH)

const applyPayload = (state: CategoriesState, payload: CategoriesPayload) => {
  state.result = payload.categories.result
  state.entities = payload.categories.entities
  state.songCategories = payload.songCategories
  state.selected = state.selected.filter(id => state.result.includes(id))
}

const categoriesReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(fetchCategories.fulfilled, (state, { payload }) => {
      applyPayload(state, payload)
    })
    .addCase(addSongCategory.fulfilled, (state, { payload }) => { applyPayload(state, payload) })
    .addCase(removeSongCategory.fulfilled, (state, { payload }) => { applyPayload(state, payload) })
    .addCase(categoriesPush, (state, { payload }) => { applyPayload(state, payload) })
    .addCase(startCategoryScan.pending, (state) => {
      state.isScanning = true
    })
    .addCase(startCategoryScan.fulfilled, (state) => {
      state.isScanning = false
    })
    .addCase(startCategoryScan.rejected, (state) => {
      state.isScanning = false
    })
    .addCase(toggleCategoryFilter, (state, { payload }) => {
      state.selected = state.selected.includes(payload)
        ? state.selected.filter(id => id !== payload)
        : [...state.selected, payload]
    })
    .addCase(clearCategoryFilters, (state) => {
      state.selected = []
    })
    // the library changing can mean songs/categories changed too
    .addMatcher(action => action.type === LIBRARY_PUSH, () => undefined)
})

export default categoriesReducer
