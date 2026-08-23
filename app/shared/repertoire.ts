/**
 * The file a singer carries their repertoire in, from one Karaoke Propio
 * installation to another.
 *
 * What travels is deliberately not the music: a manifest naming the songs, and
 * one person's pitch for each of them. The songs themselves already exist at
 * the other end, or can be fetched there the same way they were fetched here —
 * the pitch cannot. It took a party and a pitch assistant to learn, and there
 * is nowhere else in the world to get it back from.
 *
 * The join key across installations is the source upload's id, which lives in
 * every acquired filename ("Artist - Title---<id>.mp4") and is the only thing
 * two libraries can agree on: songId, mediaId and artistId are local numbers
 * that mean something else on the other machine. Artist and title travel too,
 * for the songs that have no source id and for the ones the destination holds
 * under a different upload.
 */

import { isValidPitch } from './pitch.js'
import type { PitchPrefSource } from './types.js'

export const REPERTOIRE_FORMAT = 'karaoke-propio/repertoire'
export const REPERTOIRE_VERSION = 1

/** enough for a library several times the size of any home installation */
export const MAX_SONGS = 10000
/** a real repertoire is a few kilobytes; this is the ceiling for a hostile one */
export const MAX_BYTES = 1024 * 1024

const MAX_TEXT_LENGTH = 300
const SOURCE_ID_RE = /^[\w-]{11}$/
const PITCH_SOURCES: PitchPrefSource[] = ['assistant', 'manual', 'inferred']

export interface RepertoireSong {
  /** the source upload's id ("---<id>" in the filename); null when unknown */
  sourceId?: string | null
  artist: string
  title: string
}

export interface RepertoirePitch {
  /** index into songs[] */
  song: number
  pitchSemitones: number
  source: PitchPrefSource
  /**
   * The upload this number was worked out against, which is not always the
   * song's own: a library can hold two recordings of one song, and karaoke
   * uploads are transposed against each other constantly. Null when the origin
   * no longer knows, and then the pitch can only ever arrive as a guess.
   */
  sourceId?: string | null
  /**
   * when the origin last changed it. Carried so a re-import cannot undo a
   * correction made at the destination after the file was written.
   */
  dateUpdated: number
}

export interface RepertoireSinger {
  name: string
  pitches: RepertoirePitch[]
  /** indices into songs[] */
  starredSongs: number[]
  /** by name: an artistId means nothing on the other side */
  starredArtists: string[]
}

export interface Repertoire {
  format: typeof REPERTOIRE_FORMAT
  version: number
  dateCreated: number
  songs: RepertoireSong[]
  /**
   * Absent in a library-only export, which is the same file with nobody in
   * it: an admin handing another installation their catalogue, no personal
   * data attached.
   */
  singer?: RepertoireSinger
}

const text = (value: unknown, what: string, { required = true } = {}): string => {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${what} is missing`)
    return ''
  }

  if (typeof value !== 'string') throw new Error(`${what} must be text`)

  const trimmed = value.trim()
  if (required && !trimmed) throw new Error(`${what} is empty`)

  return trimmed.slice(0, MAX_TEXT_LENGTH)
}

const index = (value: unknown, length: number, what: string): number => {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= length) {
    throw new Error(`${what} points at a song that isn't in the file`)
  }

  return value as number
}

/**
 * Read a repertoire file, or say why it cannot be read.
 *
 * Everything here arrives from another machine and, in the URL form, from
 * somewhere nobody has authenticated at all — so nothing is trusted: every
 * field is checked, every string is bounded, and anything unrecognised is
 * dropped rather than carried through to a database write. The errors are
 * written to be read by the person who chose the file, not by a developer.
 */
export function parseRepertoire (raw: string): Repertoire {
  if (raw.length > MAX_BYTES) {
    throw new Error('That file is too large to be a repertoire')
  }

  let data: Record<string, unknown>

  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error('That file is not a repertoire (it is not valid JSON)')
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('That file is not a repertoire')
  }

  if (data.format !== REPERTOIRE_FORMAT) {
    throw new Error('That file is not a Karaoke Propio repertoire')
  }

  if (!Number.isInteger(data.version) || (data.version as number) < 1) {
    throw new Error('That repertoire has no version')
  }

  if ((data.version as number) > REPERTOIRE_VERSION) {
    throw new Error('That repertoire was written by a newer version of Karaoke Propio')
  }

  if (!Array.isArray(data.songs)) {
    throw new Error('That repertoire lists no songs')
  }

  if (data.songs.length > MAX_SONGS) {
    throw new Error(`A repertoire may not list more than ${MAX_SONGS} songs`)
  }

  const songs: RepertoireSong[] = data.songs.map((song: Record<string, unknown>, i: number) => {
    if (!song || typeof song !== 'object') throw new Error(`Song ${i + 1} is not readable`)

    const sourceId = text(song.sourceId, `song ${i + 1} source id`, { required: false })

    return {
      // a malformed id is dropped rather than rejected: the artist and title
      // are still enough to find the song at the other end
      sourceId: SOURCE_ID_RE.test(sourceId) ? sourceId : null,
      artist: text(song.artist, `song ${i + 1} artist`, { required: false }),
      title: text(song.title, `song ${i + 1} title`),
    }
  })

  const repertoire: Repertoire = {
    format: REPERTOIRE_FORMAT,
    version: data.version as number,
    dateCreated: Number.isFinite(data.dateCreated) ? data.dateCreated as number : 0,
    songs,
  }

  if (data.singer === undefined || data.singer === null) return repertoire

  const singer = data.singer as Record<string, unknown>

  if (typeof singer !== 'object' || Array.isArray(singer)) {
    throw new Error('That repertoire has an unreadable singer')
  }

  const pitches: RepertoirePitch[] = []
  const seen = new Set<number>()

  for (const entry of Array.isArray(singer.pitches) ? singer.pitches as Record<string, unknown>[] : []) {
    if (!entry || typeof entry !== 'object') continue

    const song = index(entry.song, songs.length, 'A saved pitch')

    // one pitch per song is what the origin's table can hold; a file offering
    // two for the same song is malformed, and the first is as good a choice
    // as any
    if (seen.has(song)) continue
    seen.add(song)

    if (!isValidPitch(entry.pitchSemitones)) {
      throw new Error(`The pitch saved for "${songs[song].title}" is not a usable number`)
    }

    const sourceId = text(entry.sourceId, 'a saved pitch\'s source id', { required: false })

    pitches.push({
      song,
      pitchSemitones: entry.pitchSemitones as number,
      source: PITCH_SOURCES.includes(entry.source as PitchPrefSource) ? entry.source as PitchPrefSource : 'manual',
      sourceId: SOURCE_ID_RE.test(sourceId) ? sourceId : null,
      dateUpdated: Number.isFinite(entry.dateUpdated) ? entry.dateUpdated as number : 0,
    })
  }

  const starredSongs = (Array.isArray(singer.starredSongs) ? singer.starredSongs : [])
    .filter(song => Number.isInteger(song) && song >= 0 && song < songs.length) as number[]

  const starredArtists = (Array.isArray(singer.starredArtists) ? singer.starredArtists : [])
    .filter((name): name is string => typeof name === 'string' && !!name.trim())
    .slice(0, MAX_SONGS)
    .map(name => name.trim().slice(0, MAX_TEXT_LENGTH))

  repertoire.singer = {
    name: text(singer.name, 'The singer\'s name'),
    pitches,
    starredSongs: [...new Set(starredSongs)],
    starredArtists: [...new Set(starredArtists)],
  }

  return repertoire
}

/** The filename offered when a repertoire is downloaded. */
export function repertoireFileName (name: string): string {
  const slug = (name || 'library')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)

  return `${slug || 'repertoire'}.karaoke-propio.json`
}
