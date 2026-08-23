import sql from 'sqlate'
import { db } from '../lib/Database.js'
import getLogger from '../lib/Log.js'
import Library from '../Library/Library.js'
import PitchPrefs from '../Pitch/PitchPrefs.js'
import { sourceIdFromPath } from '../lib/util.js'
import { buildLibraryMatchIndex, matchInLibrary } from '../../shared/playlistMatch.js'
import { REPERTOIRE_FORMAT, REPERTOIRE_VERSION } from '../../shared/repertoire.js'
import type { Repertoire as RepertoireFile, RepertoireSong } from '../../shared/repertoire.js'

const log = getLogger('Repertoire')

export interface MissingSong {
  artist: string
  title: string
  /** the upload it came from at the origin; null when it never had one */
  sourceId: string | null
}

export interface ImportReport {
  /** the name the file carries; null for a library-only file */
  singer: string | null
  songs: {
    total: number
    matched: number
    /** here under a different upload than the origin's, so a saved pitch is not transferable */
    matchedByName: number
    missing: MissingSong[]
  }
  pitches: {
    applied: number
    /** applied, but against a different recording, so only as a starting point */
    approximated: number
    /** the song is not in this library */
    unmatched: number
    /** a decision made here is newer than the one in the file */
    kept: number
  }
  stars: {
    songs: number
  }
}

interface LocalSong {
  songId: number
  artist: string
  title: string
  /** every source id any of this song's media came from */
  sources: { sourceId: string, mediaId: number }[]
}

/**
 * Every song in the library with the source ids its media carry.
 *
 * One song can have several: two karaoke uploads of "Chiquitita" are two media
 * rows under one song, and either of them is a legitimate way for the other
 * installation to be talking about it.
 */
function localSongs (songIds?: number[]): LocalSong[] {
  const query = sql`
    SELECT songs.songId, songs.title, artists.name AS artist, media.mediaId, media.relPath
    FROM songs
      INNER JOIN artists USING (artistId)
      LEFT JOIN media USING (songId)
    ${songIds ? sql`WHERE songs.songId IN ${sql.tuple(songIds)}` : sql``}
    ORDER BY media.isPreferred DESC, media.mediaId ASC
  `
  const rows = db.all<{ songId: number, title: string, artist: string, mediaId: number | null, relPath: string | null }>(
    String(query), query.parameters,
  )

  const songs = new Map<number, LocalSong>()

  for (const row of rows) {
    let song = songs.get(row.songId)

    if (!song) {
      song = { songId: row.songId, artist: row.artist, title: row.title, sources: [] }
      songs.set(row.songId, song)
    }

    const sourceId = row.relPath ? sourceIdFromPath(row.relPath) : null
    if (sourceId && row.mediaId) song.sources.push({ sourceId, mediaId: row.mediaId })
  }

  return [...songs.values()]
}

const toRepertoireSong = (song: LocalSong): RepertoireSong => ({
  // the preferred media's, since that is the one this library plays and so the
  // one a pitch was almost certainly learned against
  sourceId: song.sources[0]?.sourceId ?? null,
  artist: song.artist,
  title: song.title,
})

/**
 * One singer's repertoire, as a file they can carry to another installation.
 *
 * Only the songs their repertoire actually refers to: this is not a copy of
 * the library, it is the list of songs this person has an opinion about, and
 * the opinions themselves.
 */
export function exportForUser (userId: number): RepertoireFile {
  const user = db.get<{ name: string }>('SELECT name FROM users WHERE userId = ?', [userId])

  if (!user) throw new Error(`unknown userId: ${userId}`)

  const prefs = PitchPrefs.get(userId)
  const { starredSongs, starredArtists } = Library.getUserStars(userId)

  // which upload each saved pitch was worked out against — not necessarily the
  // song's preferred one, and the difference is the whole meaning of the number
  const mediaIds = [...new Set(Object.values(prefs).map(pref => pref.mediaId).filter(id => typeof id === 'number'))]
  const sourceOfMedia = new Map<number, string | null>(
    mediaIds.length
      ? db.all<{ mediaId: number, relPath: string }>(
          `SELECT mediaId, relPath FROM media WHERE mediaId IN (${mediaIds.map(() => '?').join(',')})`, mediaIds,
        ).map(row => [row.mediaId, sourceIdFromPath(row.relPath)])
      : [],
  )

  const songIds = [...new Set([...Object.keys(prefs).map(Number), ...starredSongs])]
  const songs = songIds.length ? localSongs(songIds) : []
  // songs are written in the order they are listed here, so an index into
  // the file is this position
  const refOf = new Map(songs.map((song, i) => [song.songId, i]))

  const artistNames = starredArtists.length
    ? db.all<{ name: string }>(
        `SELECT name FROM artists WHERE artistId IN (${starredArtists.map(() => '?').join(',')})`, starredArtists,
      ).map(row => row.name)
    : []

  return {
    format: REPERTOIRE_FORMAT,
    version: REPERTOIRE_VERSION,
    dateCreated: Math.floor(Date.now() / 1000),
    songs: songs.map(toRepertoireSong),
    singer: {
      name: user.name,
      pitches: Object.entries(prefs)
        .filter(([songId]) => refOf.has(Number(songId)))
        .map(([songId, pref]) => ({
          song: refOf.get(Number(songId)) as number,
          pitchSemitones: pref.pitchSemitones,
          source: pref.source,
          sourceId: pref.mediaId === null ? null : sourceOfMedia.get(pref.mediaId) ?? null,
          dateUpdated: pref.dateUpdated,
        })),
      starredSongs: starredSongs.filter(songId => refOf.has(songId)).map(songId => refOf.get(songId) as number),
      starredArtists: artistNames,
    },
  }
}

/**
 * The whole catalogue with nobody attached: what an admin hands another
 * installation so it can fetch the same songs.
 */
export function exportLibrary (): RepertoireFile {
  return {
    format: REPERTOIRE_FORMAT,
    version: REPERTOIRE_VERSION,
    dateCreated: Math.floor(Date.now() / 1000),
    songs: localSongs().map(toRepertoireSong),
  }
}

interface Match {
  songId: number
  /** the local media that came from the same upload; null on a name-only match */
  mediaId: number | null
}

type SourceIndex = Map<string, Match>

/**
 * Which local song each song in the file is, if any.
 *
 * Two questions, and the difference between them decides what a pitch is worth.
 * The same source id is the same upload: the number of semitones means exactly
 * what it meant at the origin. The same artist and title is only the same
 * *song*, and karaoke uploads are transposed against each other all the time —
 * so "-4" against another recording is a wrong number, not an approximate one
 * (migration 012 says so at length). Both are matches; only the first is
 * evidence.
 */
function matchSongs (songs: RepertoireSong[]): { matches: (Match | null)[], bySourceId: SourceIndex } {
  const local = localSongs()
  const bySourceId: SourceIndex = new Map()

  for (const song of local) {
    for (const source of song.sources) {
      if (!bySourceId.has(source.sourceId)) {
        bySourceId.set(source.sourceId, { songId: song.songId, mediaId: source.mediaId })
      }
    }
  }

  const index = buildLibraryMatchIndex(local.map(song => ({
    songId: song.songId,
    title: song.title,
    artist: song.artist,
  })))

  const matches = songs.map((song) => {
    if (song.sourceId) {
      const exact = bySourceId.get(song.sourceId)
      if (exact) return exact
    }

    const songId = matchInLibrary({ artist: song.artist, title: song.title }, index)

    return songId === null ? null : { songId, mediaId: null }
  })

  return { matches, bySourceId }
}

/**
 * Apply a repertoire file to one account.
 *
 * Everything it can apply, it applies; everything it cannot, it reports. A
 * library that is missing seven of someone's forty songs is still worth the
 * other thirty-three, and the seven are worth naming — that list is what an
 * admin decides whether to download.
 *
 * Nothing here downloads, queues or creates anything. It writes to exactly two
 * places: this user's saved pitches and this user's stars.
 */
export function importForUser ({ userId, repertoire }: {
  userId: number
  repertoire: RepertoireFile
}): ImportReport {
  const { matches, bySourceId } = matchSongs(repertoire.songs)

  const report: ImportReport = {
    singer: repertoire.singer?.name ?? null,
    songs: {
      total: repertoire.songs.length,
      matched: 0,
      matchedByName: 0,
      missing: [],
    },
    pitches: { applied: 0, approximated: 0, unmatched: 0, kept: 0 },
    stars: { songs: 0 },
  }

  matches.forEach((match, i) => {
    if (!match) {
      report.songs.missing.push({
        artist: repertoire.songs[i].artist,
        title: repertoire.songs[i].title,
        sourceId: repertoire.songs[i].sourceId ?? null,
      })
      return
    }

    report.songs.matched++
    if (match.mediaId === null) report.songs.matchedByName++
  })

  const singer = repertoire.singer
  if (!singer) return report

  for (const pitch of singer.pitches) {
    // The recording the number was learned against, if this library happens to
    // have that exact upload. Asked per pitch rather than per song: a song can
    // be here under a different upload than the one the singer learned on, and
    // can also be here under both.
    const exact = pitch.sourceId ? bySourceId.get(pitch.sourceId) : undefined
    const songMatch = matches[pitch.song]
    const match = exact ?? songMatch

    if (!match) {
      report.pitches.unmatched++
      continue
    }

    // A pitch already saved here and changed since the file was written was
    // decided with this library's recordings in front of the singer. The file
    // is a copy of an older state of the same person's mind; it does not get
    // to undo that.
    const existing = PitchPrefs.getForSong(userId, match.songId)

    if (existing && existing.dateUpdated > pitch.dateUpdated) {
      report.pitches.kept++
      continue
    }

    // Without the same upload here, what the singer decided about theirs is
    // downgraded to something merely observed: it is the right place to start,
    // it loses to any decision made here, and the pitch assistant corrects it
    // the first time they sing it.
    //
    // A pitch that names no recording at all inherits its song's answer rather
    // than being downgraded on principle: most saved pitches never recorded a
    // version (PitchPrefs.set defaults mediaId to null), and treating all of
    // those as guesses would throw away the case this whole feature is for —
    // the same upload sitting in both libraries.
    const isExact = exact ? true : (!pitch.sourceId && !!songMatch && songMatch.mediaId !== null)

    const applied = PitchPrefs.set({
      userId,
      songId: match.songId,
      pitchSemitones: pitch.pitchSemitones,
      source: isExact ? pitch.source : 'inferred',
      mediaId: isExact ? match.mediaId : null,
      dateUpdated: pitch.dateUpdated || undefined,
    })

    if (applied) {
      report.pitches.applied++
      if (!isExact) report.pitches.approximated++
    } else {
      report.pitches.kept++
    }
  }

  for (const ref of singer.starredSongs) {
    const match = matches[ref]
    if (match) report.stars.songs += Library.starSong(match.songId, userId)
  }

  // singer.starredArtists is deliberately not applied. The app has no way to
  // remove an artist star — `artistStars` is read by Library.getUserStars and
  // written by nothing, the star buttons being song-only — so importing them
  // would create state their owner could never undo. The file still carries
  // them, so nothing is lost the day an unstar exists.

  log.info('imported repertoire for userId %s: %s of %s songs matched, %s pitches applied',
    userId, report.songs.matched, report.songs.total, report.pitches.applied)

  return report
}
