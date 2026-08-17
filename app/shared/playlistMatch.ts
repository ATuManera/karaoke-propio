/**
 * Deciding whether a song in someone's YouTube playlist is already in the
 * library.
 *
 * The two sides describe the same song very differently. A playlist entry is
 * whatever the uploader typed ("Queen – Bohemian Rhapsody (Official Video
 * Remastered)"), while the library holds an artist and a title parsed from a
 * karaoke file ("Queen" / "Bohemian Rhapsody"). yt-dlp's structured
 * artist/track fields would settle it, but --flat-playlist never fills them in
 * — verified 2026-08-17 against a real playlist, where every entry came back
 * with artist: null, track: null. So the only material is the title string and
 * the channel name.
 *
 * A wrong answer costs something either way: a false match hides a song the
 * singer wanted, and a false miss downloads a second copy of a song already
 * on disk. Where the evidence is ambiguous this reports "not in the library" —
 * the search that follows shows the singer what is really there, and they can
 * still walk away.
 */

import { cleanSongText, guessArtistTitle } from './acquisitionMeta.js'
import { stripArticles } from './articles.js'

// "Queen - Topic" is YouTube Music's auto-generated channel for an artist, and
// "Queen Official"/"QueenVEVO" are the human ones; none of those words are part
// of anybody's name
const CHANNEL_SUFFIX_RE = /\s*[-–—]?\s*\b(topic|vevo|official|oficial|music)\b\s*$/i

// "(Official Video)", "[Remastered 2011]", "(Live at Wembley)" — for matching,
// everything in brackets is noise, which is a stronger rule than the one
// cleanSongText applies (that one has to preserve enough to name a file by)
const BRACKETED_RE = /[([{][^)\]}]*[)\]}]/g

// "Despacito ft. Daddy Yankee" — the library files the song under its main
// artist, so the guests only get in the way
const FEATURING_RE = /\s+\b(feat|ft|featuring)\b\.?\s.*$/i

// combining marks, left behind by the NFD decomposition above
const DIACRITICS_RE = /[̀-ͯ]/g

// removed rather than turned into a space, unlike every other mark: a filename
// on disk has usually lost it ("Dont Stop Me Now"), and splitting the word
// would leave that a word apart from the playlist's "Don't Stop Me Now"
const APOSTROPHE_RE = /['’‘`´]/g

// Punctuation and spacing are what differ between a YouTube title and a
// filename; letters are not. Listed rather than inverted on purpose, so a title
// in a script this happens not to think about survives instead of normalizing
// to nothing — \w is ASCII-only, and \p{L} needs a regex flag the client's
// TypeScript target rules out.
const PUNCTUATION_RE = /[\s!-/:-@[-`{-~¡¿“”„«»–—…·•]+/g

/**
 * The comparable form of a name or title: no brackets, no featured artists, no
 * accents, no punctuation, no leading/trailing article. Deliberately lossy —
 * it exists to be compared, never to be shown.
 */
export function normalizeForMatch (text: string): string {
  const bare = (text ?? '')
    .replace(BRACKETED_RE, ' ')
    .replace(FEATURING_RE, '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/\s{2,}/g, ' ')
    .trim()

  // articles first: the library stores "Beatles, The", and the comma that marks
  // it would be gone by the time punctuation is stripped
  return stripArticles(bare)
    .replace(APOSTROPHE_RE, '')
    .replace(PUNCTUATION_RE, ' ')
    .trim()
}

export interface PlaylistTrackMeta {
  artist: string
  title: string
}

/**
 * Who and what a playlist entry is about, as far as a flat playlist can tell.
 * Falls back to the channel name when the title carries no separator, which is
 * how YouTube Music's auto-generated uploads look: the title is the bare song
 * name and the artist is only in "<Artist> - Topic".
 */
export function guessTrackMeta (entry: { title: string, uploader?: string | null }): PlaylistTrackMeta {
  const guess = guessArtistTitle(entry.title ?? '')
  if (guess.artist) return guess

  let channel = cleanSongText(entry.uploader ?? '')
  let previous: string

  do {
    previous = channel
    channel = channel.replace(CHANNEL_SUFFIX_RE, '').trim()
  } while (channel !== previous)

  return { artist: channel, title: guess.title }
}

export interface MatchableSong {
  songId: number
  title: string
  artist: string
}

export interface LibraryMatchIndex {
  /** normalized title -> every song that carries it */
  byTitle: Map<string, number[]>
  /** songId -> normalized artist */
  artistOf: Map<number, string>
}

export function buildLibraryMatchIndex (songs: Iterable<MatchableSong>): LibraryMatchIndex {
  const index: LibraryMatchIndex = { byTitle: new Map(), artistOf: new Map() }

  for (const song of songs) {
    const title = normalizeForMatch(song.title)
    if (!title) continue

    const songIds = index.byTitle.get(title)
    if (songIds) songIds.push(song.songId)
    else index.byTitle.set(title, [song.songId])

    index.artistOf.set(song.songId, normalizeForMatch(song.artist))
  }

  return index
}

function lookup (meta: PlaylistTrackMeta, index: LibraryMatchIndex): number | null {
  const title = normalizeForMatch(meta.title)
  if (!title) return null

  const candidates = index.byTitle.get(title)
  if (!candidates?.length) return null

  const artist = normalizeForMatch(meta.artist)

  if (artist) {
    const match = candidates.find(songId => index.artistOf.get(songId) === artist)
    // an artist we know of and none of the candidates is them: "Hero" by
    // Mariah Carey is not "Hero" by Enrique Iglesias
    return match ?? null
  }

  // no artist to go on, so a title is only enough when it is unambiguous
  return candidates.length === 1 ? candidates[0] : null
}

/**
 * The library song this playlist entry is, or null.
 *
 * Tries the swapped reading too, because "Here Comes The Sun - The Beatles" is
 * a real and common way to write a title and there is no way to tell it apart
 * from "Artist - Title" up front. Nothing is filed under the swapped guess —
 * it is only ever used to recognise a song that is already here.
 */
export function matchInLibrary (meta: PlaylistTrackMeta, index: LibraryMatchIndex): number | null {
  return lookup(meta, index) ?? lookup({ artist: meta.title, title: meta.artist }, index)
}
