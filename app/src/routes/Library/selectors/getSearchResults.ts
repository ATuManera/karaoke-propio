import { ensureState } from 'redux-optimistic-ui'
import { createSelector } from '@reduxjs/toolkit'
import { Searcher } from 'fast-fuzzy'
import { RootState } from 'store/store'
import { stripArticles } from 'shared/articles'
import { createSongSearchers, searchSongs } from './songSearch'

const getArtists = (state: RootState) => state.artists
const getSongs = (state: RootState) => state.songs
// matched against article-stripped keys, so "The Eagles" finds "Eagles, The"
const getFilterStrForSearch = (state: RootState) => stripArticles(state.library.filterStr.trim().toLowerCase())
const getFilterStarred = (state: RootState) => state.library.filterStarred
const getStarredArtists = (state: RootState) => ensureState(state.userStars).starredArtists
const getStarredSongs = (state: RootState) => ensureState(state.userStars).starredSongs
const getSelectedCategories = (state: RootState) => state.categories.selected
const getSongCategories = (state: RootState) => state.categories.songCategories
const getSort = (state: RootState) => state.library.sort
const getPendingReviewIds = createSelector(
  [(state: RootState) => state.songReview.pending],
  pending => new Set(pending.map(row => row.songId)),
)
const getFilterPendingReview = (state: RootState) => state.songReview.isFiltering

const getArtistSearcher = createSelector(
  [getArtists],
  artists => new Searcher(artists.result as unknown as object[], {
    keySelector: ((artistId: number) => stripArticles(artists.entities[artistId].name)) as unknown as (s: object) => string,
    threshold: 0.8,
  }),
)

// indexed by title and by "<artist> <title>" both, so a song can be found by
// the two things people remember about it at once — see songSearch.ts
const getSongSearchers = createSelector(
  [getSongs, getArtists],
  (songs, artists) => createSongSearchers(songs.result.map(songId => ({
    songId,
    title: songs.entities[songId].title,
    artist: artists.entities[songs.entities[songId].artistId]?.name ?? '',
  }))),
)

// #1: keyword filters
const getArtistsByKeyword = createSelector(
  [getArtists, getFilterStrForSearch, getArtistSearcher],
  (artists, str, searcher) => {
    if (!str) return artists.result

    return searcher.search(str, {
      returnMatchData: true,
    }).map(match => match.item as unknown as number)
  })

const getSongsByKeyword = createSelector(
  [getSongs, getArtists, getFilterStrForSearch, getSongSearchers, getArtistsByKeyword],
  (songs, artists, str, searchers, artistsWithKeyword) => {
    if (!str) return songs.result

    // the artists this same query matched: what tells "beatles" (a name, whose
    // songs belong under the artist row) from "beatles something" (a song)
    return searchSongs(str, searchers, artistsWithKeyword.map(artistId => artists.entities[artistId].name))
  })

// #2: starred/hidden filters
const getArtistsByView = createSelector(
  [getArtistsByKeyword, getFilterStarred, getStarredArtists],
  (artistsWithKeyword, filterStarred, starredArtists) =>
    artistsWithKeyword.filter((artistId) => {
      return filterStarred ? starredArtists.includes(artistId) : true
    }),
)

// Several selected categories narrow rather than widen (Balada AND 80's), which
// is what someone hunting for a specific kind of song expects; an OR would just
// return more of what they were trying to filter out.
const getSongsByView = createSelector(
  [getSongsByKeyword, getFilterStarred, getStarredSongs, getSelectedCategories, getSongCategories,
    getFilterPendingReview, getPendingReviewIds],
  (songsWithKeyword, filterStarred, starredSongs, selected, songCategories, filterPending, pending) =>
    songsWithKeyword.filter((songId) => {
      if (filterStarred && !starredSongs.includes(songId)) return false
      // songs a scan or bulk import brought in that nobody has checked yet —
      // an admin worklist, narrowing the library the same way starred does
      if (filterPending && !pending.has(songId)) return false
      if (!selected.length) return true

      const own = songCategories[songId]
      return !!own && selected.every(categoryId => own.includes(categoryId))
    }),
)

/**
 * Popularity ordering, most-watched first. Entries with no view count sort
 * last rather than as zero: "unknown" is not "unpopular", and burying an
 * unmeasured song among the least popular would be misleading.
 */
function byPopularity (ids: number[], viewCountOf: (id: number) => number | null | undefined): number[] {
  return [...ids].sort((a, b) => {
    const va = viewCountOf(a)
    const vb = viewCountOf(b)
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    return vb - va
  })
}

const getSearchResults = createSelector(
  [getArtistsByView, getSongsByView, getSelectedCategories, getSongs, getArtists, getSort, getFilterPendingReview],
  (artistsResult, songsResult, selected, songs, artists, sort, filterPending) => ({
    // with a filter on that songs can fail, only show artists that still have
    // a matching song — otherwise the artist list contradicts the list below it
    artistsResult: (() => {
      // Review is a song worklist, not an artist browse: showing an artist row
      // would expand to all of that artist's songs, including old ones that do
      // not belong to the scan/import being reviewed.
      if (filterPending) return []

      const filtered = selected.length
        ? artistsResult.filter(artistId =>
            songsResult.some(songId => songs.entities[songId]?.artistId === artistId))
        : artistsResult
      return sort === 'popular' ? byPopularity(filtered, id => artists.entities[id]?.viewCount) : filtered
    })(),
    songsResult: sort === 'popular'
      ? byPopularity(songsResult, id => songs.entities[id]?.viewCount)
      : songsResult,
  }),
)

export default getSearchResults
