import { createSelector } from '@reduxjs/toolkit'
import { RootState } from 'store/store'

const getArtists = (state: RootState) => state.artists
const getSongs = (state: RootState) => state.songs
const getSort = (state: RootState) => state.library.sort

/** Most-watched first; unknown popularity sorts last ("unmeasured" ≠ "unpopular"). */
function comparePopularity (a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return b - a
}

/**
 * Artists in the order the user chose, INCLUDING the songs nested under each.
 *
 * The server sends artists alphabetically and each artist's songIds by title,
 * so both levels have to be reordered here. Sorting only the outer list left
 * an artist's own tracks stubbornly alphabetical once expanded — the same
 * oversight, one level down.
 *
 * Shared by browsing and search results so the two can never disagree.
 */
const getBrowseArtists = createSelector(
  [getArtists, getSongs, getSort],
  (artists, songs, sort) => {
    if (sort !== 'popular') return artists

    const entities: typeof artists.entities = {}

    for (const artistId of artists.result) {
      const artist = artists.entities[artistId]
      entities[artistId] = {
        ...artist,
        // copy before sorting: these arrays belong to the store
        songIds: [...artist.songIds].sort((a, b) =>
          comparePopularity(songs.entities[a]?.viewCount, songs.entities[b]?.viewCount)),
      }
    }

    const result = [...artists.result].sort((a, b) =>
      comparePopularity(artists.entities[a]?.viewCount, artists.entities[b]?.viewCount))

    return { ...artists, result, entities }
  },
)

export default getBrowseArtists
