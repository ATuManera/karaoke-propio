/**
 * Searching the library for a song by artist AND title in one breath.
 *
 * The library is indexed twice — once by artist name, once by song title — and
 * each searcher only ever sees its own field. That is right for "beatles" and
 * right for "something", and wrong for "beatles something", which is how people
 * actually look for a song they half remember: it matches neither key and the
 * library reports the song missing while it sits on disk.
 *
 * So songs are also indexed under "<artist> <title>". Running that index
 * unconditionally would undo a deliberate choice, though — searching an
 * artist's name is supposed to produce their artist row and no song rows (see
 * the "empty section is noise" note in SearchResults), and "beatles" against
 * this index returns all 49 of them, duplicating what is already inside the row
 * above. It therefore only runs when the query says more than a name does.
 */

import { Searcher, fuzzy } from 'fast-fuzzy'
import { stripArticles } from 'shared/articles'

/** the score below which fast-fuzzy stops calling something a match */
const THRESHOLD = 0.8

export interface SearchableSong {
  songId: number
  title: string
  artist: string
}

export interface SongSearchers {
  byTitle: SongSearcher
  byArtistAndTitle: SongSearcher
}

// fast-fuzzy is typed for string or object candidates; these are song ids, and
// the surrounding selectors cast the same way
type SongSearcher = Searcher<object, { threshold: number }>

function indexBy (songs: SearchableSong[], key: (song: SearchableSong) => string): SongSearcher {
  const byId = new Map(songs.map(song => [song.songId, song]))

  return new Searcher(songs.map(song => song.songId) as unknown as object[], {
    keySelector: ((songId: number) => key(byId.get(songId))) as unknown as (s: object) => string,
    threshold: THRESHOLD,
  })
}

export function createSongSearchers (songs: SearchableSong[]): SongSearchers {
  return {
    byTitle: indexBy(songs, song => stripArticles(song.title)),
    // both sides article-stripped separately: the library writes "Beatles, The
    // Here Comes The Sun", and nobody types the comma
    byArtistAndTitle: indexBy(songs, song => `${stripArticles(song.artist)} ${stripArticles(song.title)}`),
  }
}

function hits (searcher: SongSearcher, str: string): number[] {
  return searcher.search(str, { returnMatchData: true }).map(match => match.item as unknown as number)
}

function countWords (str: string): number {
  return str.split(/\s+/).filter(Boolean).length
}

/**
 * Whether the query is, end to end, just somebody's name.
 *
 * `useSellers` is what the searchers normally rely on to find the query inside
 * a longer key; turned off, both strings have to account for each other, so
 * "luis miguel" still recognises Luis Miguel while "luis miguel la barca" no
 * longer does. Comparing word counts instead was tried and got this wrong for
 * every artist credited alongside others: "enrique iglesias hero" is three
 * words and "Enrique Iglesias & Descemer Bueno & Gente De Zona" is more, so the
 * query looked like a name and Hero stayed hidden.
 */
function isArtistName (str: string, artistNames: string[]): boolean {
  return artistNames.some(name => fuzzy(str, stripArticles(name), { useSellers: false }) >= THRESHOLD)
}

/**
 * The songs matching this query, given the artists it already matched.
 *
 * Additive: whatever the title index alone would have returned is still here,
 * in the same order, with cross-field matches after it.
 */
export function searchSongs (str: string, searchers: SongSearchers, artistNames: string[]): number[] {
  const byTitle = hits(searchers.byTitle, str)

  // one word cannot span two fields, and letting it try is expensive: a single
  // letter picks up every artist whose name contains it, and with it their
  // whole catalogue
  if (countWords(str) < 2) return byTitle
  if (isArtistName(str, artistNames)) return byTitle

  return [...new Set([...byTitle, ...hits(searchers.byArtistAndTitle, str)])]
}
