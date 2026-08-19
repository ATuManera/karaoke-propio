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

// A karaoke publisher, in the title or the channel name. The acquisition worker
// carries its own copy of this idea (it runs standalone, outside this build) —
// the two are meant to agree, and both are kept deliberately broad, because
// mistaking a karaoke upload for an original song is the expensive direction.
const KARAOKE_RE = /karaok|instrumental|playback|pista|sing[\s-]?along|backing\s?track|minus\s?one/i

/**
 * Whether this playlist entry is already a karaoke track rather than the
 * original recording.
 *
 * It decides what the entry is *for*. A karaoke playlist is a list of versions
 * someone already chose and wants; an ordinary music playlist is a list of
 * songs that still need a karaoke version found for them. Offering the wrong
 * one of those two is what makes the list look nonsensical.
 */
export function isKaraokeUpload (entry: { title?: string | null, uploader?: string | null }): boolean {
  return KARAOKE_RE.test(`${entry.title ?? ''} ${entry.uploader ?? ''}`)
}

// "(Official Video)", "[Remastered 2011]", "(Live at Wembley)" — for matching,
// everything in brackets is noise, which is a stronger rule than the one
// cleanSongText applies (that one has to preserve enough to name a file by)
const BRACKETED_RE = /[([{][^)\]}]*[)\]}]/g

// "Despacito ft. Daddy Yankee" — the library files the song under its main
// artist, so the guests only get in the way
const FEATURING_RE = /\s+\b(feat|ft|featuring)\b\.?\s.*$/i

// combining marks, left behind by the NFD decomposition above
// matches nothing, so a replace() can be turned off without branching
const NOTHING_RE = /(?!)/

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

// stripArticles only knows the English ones, because that is all MetaParser
// shifts on the way in ("Show Must Go On, The"). A Spanish library never gets
// that treatment, so the two sides disagree the moment one of them writes the
// article and the other does not: "El reloj" on disk, "Reloj" in the playlist.
// Dropped from both sides here, where losing it costs nothing.
const LEADING_ARTICLE_RE = /^(el|la|los|las|lo|un|una|unos|unas)\s+/i

/**
 * The comparable form of a name or title: no brackets, no featured artists, no
 * accents, no punctuation, no leading/trailing article. Deliberately lossy —
 * it exists to be compared, never to be shown.
 *
 * `keepFeatured` is for the containment pass and nothing else. Dropping the
 * guests is right when the text is a name ("Jessie J ft. B.o.B" is filed under
 * Jessie J), and wrong when it is a whole entry title, because everything after
 * the "ft." goes with them — including the song. "Karaoke Jessie J ft. B.o.B
 * Price Tag" would be left as "jessie j", with the title thrown away.
 */
export function normalizeForMatch (text: string, keepFeatured = false): string {
  const bare = (text ?? '')
    .replace(BRACKETED_RE, ' ')
    .replace(keepFeatured ? NOTHING_RE : FEATURING_RE, '')
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/\s{2,}/g, ' ')
    .trim()

  // articles first: the library stores "Beatles, The", and the comma that marks
  // it would be gone by the time punctuation is stripped
  const words = stripArticles(bare)
    .replace(APOSTROPHE_RE, '')
    .replace(PUNCTUATION_RE, ' ')
    .trim()

  // never all the way to nothing: a song really called "La" is still a song
  return words.replace(LEADING_ARTICLE_RE, '') || words
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

  // "karaoke Vinotinto", "Movida Musical Karaoke" — a karaoke channel is a
  // publisher, and filing a song under one would put Marc Anthony's catalogue
  // under whoever happened to upload it
  if (KARAOKE_RE.test(entry.uploader ?? '')) return { artist: '', title: guess.title }

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
  /** every song in normalized form, for the containment pass */
  songs: MatchableSong[]
}

export function buildLibraryMatchIndex (songs: Iterable<MatchableSong>): LibraryMatchIndex {
  const index: LibraryMatchIndex = { byTitle: new Map(), artistOf: new Map(), songs: [] }

  for (const song of songs) {
    const title = normalizeForMatch(song.title)
    if (!title) continue

    const songIds = index.byTitle.get(title)
    if (songIds) songIds.push(song.songId)
    else index.byTitle.set(title, [song.songId])

    const artist = normalizeForMatch(song.artist)
    index.artistOf.set(song.songId, artist)
    index.songs.push({ songId: song.songId, title, artist })
  }

  return index
}

/** whole words only, so "reloj" does not match inside "relojero" */
function contains (haystack: string, needle: string): boolean {
  return !!needle && ` ${haystack} `.includes(` ${needle} `)
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
 * Last resort: the artist and the title are both in there somewhere, with
 * nothing to separate them.
 *
 * "Karaoke Luis Miguel La Barca", "Hasta que me olvides-Luis miguel" — a
 * karaoke channel runs the performer's name into the song's with no separator
 * any split can find, so neither half is ever going to be read correctly. But
 * a library that holds "Luis Miguel" and "La Barca" can still recognise both
 * of them sitting inside that string.
 *
 * Requiring BOTH to appear is what makes this safe enough to run at all; the
 * longest title wins, so "Tú y yo" beats "Tú", and a tie is left unmatched.
 */
function lookupContained (meta: PlaylistTrackMeta, index: LibraryMatchIndex): number | null {
  const text = normalizeForMatch(`${meta.artist} ${meta.title}`, true)
  if (!text) return null

  let best: { songId: number, length: number } | null = null
  let isTied = false

  for (const song of index.songs) {
    if (!contains(text, song.title) || !contains(text, song.artist)) continue

    if (!best || song.title.length > best.length) {
      best = { songId: song.songId, length: song.title.length }
      isTied = false
    } else if (song.title.length === best.length && song.songId !== best.songId) {
      isTied = true
    }
  }

  return best && !isTied ? best.songId : null
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
  return lookup(meta, index)
    ?? lookup({ artist: meta.title, title: meta.artist }, index)
    ?? lookupContained(meta, index)
}
