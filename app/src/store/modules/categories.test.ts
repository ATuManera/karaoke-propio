import { configureStore } from '@reduxjs/toolkit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import categories, { addSongCategory } from './categories'

const payload = {
  categories: {
    result: [43],
    entities: { 43: { categoryId: 43, name: '80\'s', type: 'decade' as const, songCount: 1 } },
  },
  songCategories: { 1057: [43] },
}

describe('manual categories', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the mutation response instead of following a successful save with a second fetch', async () => {
    vi.stubGlobal('document', { baseURI: 'http://karaoke/' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const store = configureStore({ reducer: categories })

    await store.dispatch(addSongCategory({ songId: 1057, name: '80\'s', type: 'decade' })).unwrap()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('http://karaoke/api/song/1057/categories', expect.objectContaining({ method: 'POST' }))
    expect(store.getState().songCategories[1057]).toEqual([43])
    expect(store.getState().entities[43].name).toBe('80\'s')
  })

  it('leaves the current categories intact when the save cannot reach the server', async () => {
    vi.stubGlobal('document', { baseURI: 'http://karaoke/' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    const store = configureStore({ reducer: categories })

    await expect(store.dispatch(addSongCategory({ songId: 1057, name: '80\'s', type: 'decade' })).unwrap())
      .rejects.toThrow('Failed to fetch')

    expect(store.getState().songCategories).toEqual({})
  })
})
