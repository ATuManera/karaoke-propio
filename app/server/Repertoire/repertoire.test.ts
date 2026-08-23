import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import Library from '../Library/Library.js'
import Media from '../Media/Media.js'
import PitchPrefs from '../Pitch/PitchPrefs.js'
import Prefs from '../Prefs/Prefs.js'
import { exportForUser, exportLibrary, importForUser } from './Repertoire.js'
import { parseRepertoire } from '../../shared/repertoire.js'

// Same live-binding trick as PitchPrefs.test.ts: Database.ts reassigns its
// exported `db` on open(), so statically-imported modules follow whichever
// SQLite file is open at call time.

let tmpDir: string
let pathId: number
let fernandoId: number
let anaId: number

const addUser = (username: string, name: string): number => db.db.run(
  `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES (?, 'x', ?, 0, 0, 1)`,
  [username, name],
).lastID as number

const addSong = ({ artist, title, relPath }: { artist: string, title: string, relPath: string }) => {
  const { songId } = Library.matchSong({
    artist, artistNorm: artist.toLowerCase(), title, titleNorm: title.toLowerCase(),
  })

  const mediaId = Media.add({
    songId,
    pathId,
    relPath,
    duration: 180,
    dateAdded: Math.floor(Date.now() / 1000),
  })

  return { songId, mediaId }
}

describe('Repertoire (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-repertoire-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    pathId = Prefs.addPath(tmpDir)
    fernandoId = addUser('fernando', 'Fernando')
    anaId = addUser('ana', 'Ana')
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('export', () => {
    it('carries the songs a singer has an opinion about, and nothing else', () => {
      const chiquitita = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })
      addSong({ artist: 'Queen', title: 'Bohemian Rhapsody', relPath: 'Queen - Bohemian Rhapsody---fJ9rUzIMcZQ.mp4' })

      PitchPrefs.set({ userId: fernandoId, songId: chiquitita.songId, pitchSemitones: -4, source: 'assistant', mediaId: chiquitita.mediaId })

      const file = exportForUser(fernandoId)

      expect(file.songs).toHaveLength(1)
      expect(file.songs[0]).toEqual({ sourceId: '1gRQKAivLns', artist: 'ABBA', title: 'Chiquitita' })
      expect(file.singer?.name).toBe('Fernando')
      // the pitch names the upload it was learned against, not just the song
      expect(file.singer?.pitches[0]).toMatchObject({ song: 0, pitchSemitones: -4, source: 'assistant', sourceId: '1gRQKAivLns' })
    })

    it('carries starred songs even with no pitch saved for them', () => {
      const song = addSong({ artist: 'Soda Stereo', title: 'De música ligera', relPath: 'Soda Stereo - De musica ligera---T_FkEw27XJ0.mp4' })
      Library.starSong(song.songId, fernandoId)

      const file = exportForUser(fernandoId)

      expect(file.songs).toHaveLength(1)
      expect(file.singer?.starredSongs).toEqual([0])
    })

    it('writes a file another installation can read back', () => {
      const song = addSong({ artist: 'ABBA', title: 'Fernando', relPath: 'ABBA - Fernando---BcpOsRLTBZA.mp4' })
      PitchPrefs.set({ userId: fernandoId, songId: song.songId, pitchSemitones: 2, source: 'manual', mediaId: song.mediaId })

      const parsed = parseRepertoire(JSON.stringify(exportForUser(fernandoId)))

      expect(parsed.singer?.pitches).toHaveLength(1)
      expect(parsed.songs[0].sourceId).toBe('BcpOsRLTBZA')
    })

    it('a pitch against a recording nobody can name travels as a guess', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })
      // saved before versions were recorded against a pitch (mediaId null)
      PitchPrefs.set({ userId: fernandoId, songId: song.songId, pitchSemitones: -4, source: 'manual' })

      const file = exportForUser(fernandoId)

      expect(file.songs[0].sourceId).toBe('1gRQKAivLns')
      expect(file.singer?.pitches[0].sourceId).toBeNull()
    })

    it('a song with no source id still travels, by name', () => {
      const song = addSong({ artist: 'Los Kjarkas', title: 'Llorando se fue', relPath: 'Los Kjarkas - Llorando se fue.mp4' })
      PitchPrefs.set({ userId: fernandoId, songId: song.songId, pitchSemitones: 1, source: 'manual' })

      const file = exportForUser(fernandoId)

      expect(file.songs[0]).toEqual({ sourceId: null, artist: 'Los Kjarkas', title: 'Llorando se fue' })
    })

    it('the library export has a catalogue and nobody in it', () => {
      addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })
      addSong({ artist: 'Queen', title: 'Bohemian Rhapsody', relPath: 'Queen - Bohemian Rhapsody---fJ9rUzIMcZQ.mp4' })

      const file = exportLibrary()

      expect(file.songs).toHaveLength(2)
      expect(file.singer).toBeUndefined()
    })
  })

  describe('import', () => {
    it('applies a pitch to the same upload, keeping what the singer decided', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          // deliberately spelled differently from the local row: the source id
          // is what identifies it, not the text
          songs: [{ sourceId: '1gRQKAivLns', artist: 'Abba', title: 'Chiquitita (karaoke)' }],
          singer: { name: 'Fernando', pitches: [{ song: 0, pitchSemitones: -4, source: 'assistant', dateUpdated: 100 }], starredSongs: [], starredArtists: [] },
        })),
      })

      expect(report.songs).toMatchObject({ total: 1, matched: 1, matchedByName: 0, missing: [] })
      expect(report.pitches.applied).toBe(1)

      const saved = PitchPrefs.getForSong(anaId, song.songId)
      expect(saved).toMatchObject({ pitchSemitones: -4, source: 'assistant', mediaId: song.mediaId, dateUpdated: 100 })
    })

    it('a pitch learned against another recording arrives as observed, not decided', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---aaaaaaaaaaa.mp4' })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          songs: [{ sourceId: '1gRQKAivLns', artist: 'ABBA', title: 'Chiquitita' }],
          singer: { name: 'Fernando', pitches: [{ song: 0, pitchSemitones: -4, source: 'manual', sourceId: '1gRQKAivLns', dateUpdated: 100 }], starredSongs: [], starredArtists: [] },
        })),
      })

      expect(report.songs.matchedByName).toBe(1)
      expect(report.pitches).toMatchObject({ applied: 1, approximated: 1 })

      const saved = PitchPrefs.getForSong(anaId, song.songId)
      // 'inferred' is what makes the destination's own decisions outrank it
      expect(saved).toMatchObject({ pitchSemitones: -4, source: 'inferred', mediaId: null })
    })

    it('finds the recording a pitch was learned against even when the song has two', () => {
      // the same song here twice: the preferred upload, and the one the file's
      // pitch was actually learned against
      const preferred = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---aaaaaaaaaaa.mp4' })
      const learned = Media.add({
        songId: preferred.songId,
        pathId,
        relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4',
        duration: 180,
        dateAdded: Math.floor(Date.now() / 1000),
      })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          songs: [{ sourceId: 'aaaaaaaaaaa', artist: 'ABBA', title: 'Chiquitita' }],
          singer: {
            name: 'Fernando',
            pitches: [{ song: 0, pitchSemitones: -4, source: 'assistant', sourceId: '1gRQKAivLns', dateUpdated: 100 }],
            starredSongs: [],
            starredArtists: [],
          },
        })),
      })

      expect(report.pitches).toMatchObject({ applied: 1, approximated: 0 })
      expect(PitchPrefs.getForSong(anaId, preferred.songId)).toMatchObject({ source: 'assistant', mediaId: learned })
    })

    it('names the songs this library does not have, without touching anything else', () => {
      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          songs: [{ sourceId: 'fJ9rUzIMcZQ', artist: 'Queen', title: 'Bohemian Rhapsody' }],
          singer: { name: 'Fernando', pitches: [{ song: 0, pitchSemitones: -2, source: 'manual', dateUpdated: 100 }], starredSongs: [0], starredArtists: [] },
        })),
      })

      expect(report.songs.missing).toEqual([{ artist: 'Queen', title: 'Bohemian Rhapsody', sourceId: 'fJ9rUzIMcZQ' }])
      expect(report.pitches).toMatchObject({ applied: 0, unmatched: 1 })
      expect(report.stars.songs).toBe(0)
    })

    it('does not undo a correction made here after the file was written', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })
      PitchPrefs.set({ userId: anaId, songId: song.songId, pitchSemitones: 3, source: 'assistant', mediaId: song.mediaId, dateUpdated: 500 })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          songs: [{ sourceId: '1gRQKAivLns', artist: 'ABBA', title: 'Chiquitita' }],
          singer: { name: 'Fernando', pitches: [{ song: 0, pitchSemitones: -4, source: 'manual', dateUpdated: 100 }], starredSongs: [], starredArtists: [] },
        })),
      })

      expect(report.pitches).toMatchObject({ applied: 0, kept: 1 })
      expect(PitchPrefs.getForSong(anaId, song.songId)).toMatchObject({ pitchSemitones: 3 })
    })

    it('re-importing the same file changes nothing the second time', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })
      PitchPrefs.set({ userId: fernandoId, songId: song.songId, pitchSemitones: -4, source: 'assistant', mediaId: song.mediaId })
      Library.starSong(song.songId, fernandoId)

      const file = parseRepertoire(JSON.stringify(exportForUser(fernandoId)))

      const first = importForUser({ userId: anaId, repertoire: file })
      const second = importForUser({ userId: anaId, repertoire: file })

      expect(first.pitches.applied).toBe(1)
      expect(first.stars.songs).toBe(1)
      // the second pass finds its own work already there
      expect(second.pitches.applied + second.pitches.kept).toBe(1)
      expect(second.stars.songs).toBe(0)
      expect(PitchPrefs.getForSong(anaId, song.songId)).toMatchObject({ pitchSemitones: -4, source: 'assistant' })
    })

    it('carries song stars over, and leaves artist stars alone', () => {
      const song = addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify({
          format: 'karaoke-propio/repertoire',
          version: 1,
          dateCreated: 100,
          songs: [{ sourceId: '1gRQKAivLns', artist: 'ABBA', title: 'Chiquitita' }],
          singer: { name: 'Fernando', pitches: [], starredSongs: [0], starredArtists: ['abba'] },
        })),
      })

      expect(report.stars).toEqual({ songs: 1 })
      // artist stars are carried in the file but never written: nothing in the
      // app can remove one, so importing them would be a one-way door
      expect(Library.getUserStars(anaId)).toEqual({ starredSongs: [song.songId], starredArtists: [] })
    })

    it('a file with no singer in it applies nothing to anybody', () => {
      addSong({ artist: 'ABBA', title: 'Chiquitita', relPath: 'ABBA - Chiquitita---1gRQKAivLns.mp4' })

      const report = importForUser({
        userId: anaId,
        repertoire: parseRepertoire(JSON.stringify(exportLibrary())),
      })

      expect(report.singer).toBeNull()
      expect(report.songs.matched).toBe(1)
      expect(report.pitches.applied).toBe(0)
      expect(Library.getUserStars(anaId).starredSongs).toEqual([])
    })
  })
})
