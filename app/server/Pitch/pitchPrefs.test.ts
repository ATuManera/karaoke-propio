import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import PitchPrefs from './PitchPrefs.js'
import Media from '../Media/Media.js'
import Prefs from '../Prefs/Prefs.js'
import Library from '../Library/Library.js'

// Same live-binding trick as Queue.test.ts: Database.ts reassigns its exported
// `db` on open(), so the statically-imported modules follow whichever SQLite
// file is open at call time.

let tmpDir: string
let songId: number
let otherSongId: number
let mediaId: number
let fernandoId: number
let anaId: number

const addUser = (username: string, name: string): number => db.db.run(
  `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES (?, 'x', ?, 0, 0, 1)`,
  [username, name],
).lastID as number

describe('PitchPrefs (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-pitchprefs-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    const pathId = Prefs.addPath(tmpDir)

    songId = Library.matchSong({
      artist: 'Bee Gees', artistNorm: 'bee gees', title: 'I Started a Joke', titleNorm: 'i started a joke',
    }).songId

    otherSongId = Library.matchSong({
      artist: 'ABBA', artistNorm: 'abba', title: 'Fernando', titleNorm: 'fernando',
    }).songId

    mediaId = Media.add({
      songId,
      pathId,
      relPath: 'joke.mp4',
      duration: 180,
      dateAdded: Math.floor(Date.now() / 1000),
    })

    fernandoId = addUser('fernando', 'Fernando')
    anaId = addUser('ana', 'Ana')
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves and returns a pitch for one user and song', () => {
    expect(PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual', mediaId })).toBe(true)

    const pref = PitchPrefs.getForSong(fernandoId, songId)
    expect(pref?.pitchSemitones).toBe(-4)
    expect(pref?.source).toBe('manual')
    expect(pref?.mediaId).toBe(mediaId)
  })

  // The whole point of the feature: the comfortable key belongs to the voice,
  // not to the song. If these two ever collided, the table would be modelling
  // something that does not exist.
  it('keeps each user\'s pitch for the same song independent', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })
    PitchPrefs.set({ userId: anaId, songId, pitchSemitones: 2, source: 'manual' })

    expect(PitchPrefs.getForSong(fernandoId, songId)?.pitchSemitones).toBe(-4)
    expect(PitchPrefs.getForSong(anaId, songId)?.pitchSemitones).toBe(2)
  })

  it('keeps one user\'s pitches for different songs independent', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })
    PitchPrefs.set({ userId: fernandoId, songId: otherSongId, pitchSemitones: 1, source: 'manual' })

    const prefs = PitchPrefs.get(fernandoId)
    expect(prefs[songId].pitchSemitones).toBe(-4)
    expect(prefs[otherSongId].pitchSemitones).toBe(1)
  })

  it('get() returns only the asking user\'s pitches', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })
    PitchPrefs.set({ userId: anaId, songId: otherSongId, pitchSemitones: 2, source: 'manual' })

    expect(Object.keys(PitchPrefs.get(fernandoId))).toEqual([String(songId)])
    expect(Object.keys(PitchPrefs.get(anaId))).toEqual([String(otherSongId)])
  })

  it('overwrites a pitch for the same (user, song) rather than adding a row', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -3, source: 'manual' })

    expect(Object.keys(PitchPrefs.get(fernandoId))).toHaveLength(1)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.pitchSemitones).toBe(-3)
  })

  // Precedence: queueing a song is evidence, but a decision outranks it.
  it('does not let an inferred pitch overwrite a decided one', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })

    expect(PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -1, source: 'inferred' })).toBe(false)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.pitchSemitones).toBe(-4)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.source).toBe('manual')

    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -5, source: 'assistant' })
    expect(PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -1, source: 'inferred' })).toBe(false)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.pitchSemitones).toBe(-5)
  })

  it('lets an inferred pitch replace another inferred one', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -2, source: 'inferred' })

    expect(PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'inferred' })).toBe(true)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.pitchSemitones).toBe(-4)
  })

  it('lets a decided pitch replace an inferred one', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -2, source: 'inferred' })

    expect(PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })).toBe(true)
    expect(PitchPrefs.getForSong(fernandoId, songId)?.source).toBe('manual')
  })

  it('rejects out-of-range, non-integer pitch and unknown sources', () => {
    expect(() => PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: 13, source: 'manual' })).toThrow()
    expect(() => PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -13, source: 'manual' })).toThrow()
    expect(() => PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: 1.5, source: 'manual' })).toThrow()
    // @ts-expect-error deliberately invalid source
    expect(() => PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: 1, source: 'guessed' })).toThrow()
  })

  it('clear() removes only that user\'s pitch for that song', () => {
    PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -4, source: 'manual' })
    PitchPrefs.set({ userId: anaId, songId, pitchSemitones: 2, source: 'manual' })

    expect(PitchPrefs.clear(fernandoId, songId)).toBe(1)
    expect(PitchPrefs.getForSong(fernandoId, songId)).toBeNull()
    expect(PitchPrefs.getForSong(anaId, songId)?.pitchSemitones).toBe(2)

    // clearing something that isn't there is not an error
    expect(PitchPrefs.clear(fernandoId, songId)).toBe(0)
  })

  it('forgets a guest\'s saved pitches when the account is swept', () => {
    PitchPrefs.set({ userId: anaId, songId, pitchSemitones: 2, source: 'manual' })

    db.db.run('DELETE FROM users WHERE userId = ?', [anaId])

    expect(PitchPrefs.get(anaId)).toEqual({})
  })
})
