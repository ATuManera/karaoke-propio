import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import Queue from './Queue.js'
import Media from '../Media/Media.js'
import Prefs from '../Prefs/Prefs.js'
import Library from '../Library/Library.js'

// `db` is a live ES module binding (Database.ts reassigns its exported `db`
// let on every open()), so Queue/Media/Prefs/Library — all imported once,
// statically, above — transparently follow whichever SQLite file is open at
// call time. No need to re-import them per test.

let tmpDir: string
let roomId: number
let userId: number
let songId: number
let mediaId: number

describe('Queue (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-queue-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    const pathId = Prefs.addPath(tmpDir)
    const match = Library.matchSong({ artist: 'Test Artist', artistNorm: 'test artist', title: 'Test Song', titleNorm: 'test song' })
    songId = match.songId

    mediaId = Media.add({
      songId,
      pathId,
      relPath: 'test.mp4',
      duration: 180,
      dateAdded: Math.floor(Date.now() / 1000),
    })

    // minimal room + user rows via raw SQL (no dedicated test helpers upstream)
    const roomRes = db.db.run(
      `INSERT INTO rooms (name, status, dateCreated, data) VALUES ('Test Room', 'open', 0, '{}')`,
    )
    roomId = roomRes.lastID as number

    const userRes = db.db.run(
      `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES ('test', 'x', 'Test', 0, 0, 1)`,
    )
    userId = userRes.lastID as number
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('Queue.add persists pitchSemitones and returns the new queueId', () => {
    const queueId = Queue.add({ roomId, songId, userId, pitchSemitones: 3 })
    expect(Number.isInteger(queueId)).toBe(true)

    const row = Queue.getRow(queueId)
    expect(row.pitchSemitones).toBe(3)
    expect(row.songId).toBe(songId)
    expect(row.roomId).toBe(roomId)
  })

  it('Queue.add defaults pitchSemitones to 0', () => {
    const queueId = Queue.add({ roomId, songId, userId })
    expect(Queue.getRow(queueId).pitchSemitones).toBe(0)
  })

  it('Queue.add rejects out-of-range or non-integer pitch (server never trusts the client)', () => {
    expect(() => Queue.add({ roomId, songId, userId, pitchSemitones: 13 })).toThrow()
    expect(() => Queue.add({ roomId, songId, userId, pitchSemitones: 1.5 })).toThrow()
    expect(() => Queue.add({ roomId, songId, userId, pitchSemitones: -13 })).toThrow()
  })

  it('Queue.get reports pitchStatus="ready" for pitch=0 and "preparing" for unknown non-zero pitch', () => {
    const zeroId = Queue.add({ roomId, songId, userId, pitchSemitones: 0 })
    const nonZeroId = Queue.add({ roomId, songId, userId, pitchSemitones: 5 })

    const state = Queue.get(roomId)
    expect(state.entities[zeroId].pitchStatus).toBe('ready')
    // no PitchManager registered in this unit test -> falls back to the
    // "unknown non-zero pitch is never silently ready" default
    expect(state.entities[nonZeroId].pitchStatus).toBe('preparing')
  })

  it('two singers can queue the same song with two different pitches as distinct queueIds', () => {
    const a = Queue.add({ roomId, songId, userId, pitchSemitones: -2 })
    const b = Queue.add({ roomId, songId, userId, pitchSemitones: 3 })

    expect(a).not.toBe(b)

    const state = Queue.get(roomId)
    expect(state.entities[a].pitchSemitones).toBe(-2)
    expect(state.entities[b].pitchSemitones).toBe(3)
  })

  it('Queue.get never leaks sourceFingerprint to the client payload', () => {
    const queueId = Queue.add({ roomId, songId, userId, pitchSemitones: 0 })
    const state = Queue.get(roomId)
    expect('sourceFingerprint' in state.entities[queueId]).toBe(false)
  })

  it('mediaId sanity: the media row used across this suite resolves back to the same song', () => {
    const res = Media.search({ mediaId })
    expect(res.entities[mediaId].songId).toBe(songId)
  })
})
