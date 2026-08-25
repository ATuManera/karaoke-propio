import { describe, expect, it } from 'vitest'
import getSearchResults from './getSearchResults'
import type { RootState } from 'store/store'
import type { PendingSong } from 'store/modules/songReview'

const songs = [
  { songId: 1, title: 'La Barca', artistId: 10 },
  { songId: 2, title: 'El reloj', artistId: 10 },
  { songId: 3, title: 'Vivir Mi Vida', artistId: 20 },
]
const artists = [
  { artistId: 10, name: 'Luis Miguel', songIds: [1, 2] },
  { artistId: 20, name: 'Marc Anthony', songIds: [3] },
]

const entitiesOf = <T extends Record<string, unknown>>(rows: T[], key: string) =>
  Object.fromEntries(rows.map(row => [row[key], row]))

const state = (overrides: { pending?: number[], isFiltering?: boolean, filterStr?: string } = {}) => ({
  songs: { result: songs.map(s => s.songId), entities: entitiesOf(songs, 'songId') },
  artists: { result: artists.map(a => a.artistId), entities: entitiesOf(artists, 'artistId') },
  library: { filterStr: overrides.filterStr ?? '', filterStarred: false, sort: 'name' },
  userStars: { starredArtists: [], starredSongs: [] },
  categories: { selected: [], songCategories: {} },
  songReview: {
    pending: (overrides.pending ?? []).map((songId): PendingSong => ({ songId, sourceTitle: '', playlistId: null, isAmbiguous: 0, dateCreated: 0, origin: 'scan' })),
    isFiltering: overrides.isFiltering ?? false,
  },
} as unknown as RootState)

describe('getSearchResults, filtering by what still needs review', () => {
  it('shows everything while the filter is off', () => {
    expect(getSearchResults(state({ pending: [1] })).songsResult).toEqual([1, 2, 3])
  })

  // the point of the flag: find the songs a bulk import brought in
  it('narrows to the songs waiting to be checked', () => {
    expect(getSearchResults(state({ pending: [1, 3], isFiltering: true })).songsResult).toEqual([1, 3])
  })

  // expanding an artist would reveal its old songs alongside the new one
  it('uses a direct song worklist rather than expandable artist rows', () => {
    expect(getSearchResults(state({ pending: [3], isFiltering: true })).artistsResult).toEqual([])
  })

  it('narrows a search as well as the whole library', () => {
    expect(getSearchResults(state({ pending: [2], isFiltering: true, filterStr: 'luis miguel la barca' })).songsResult)
      .toEqual([])
    expect(getSearchResults(state({ pending: [1], isFiltering: true, filterStr: 'luis miguel la barca' })).songsResult)
      .toEqual([1])
  })
})
