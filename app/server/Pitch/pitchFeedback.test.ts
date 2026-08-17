import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as db from '../lib/Database.js'
import Library from '../Library/Library.js'
import Media from '../Media/Media.js'
import PitchFeedback from './PitchFeedback.js'
import PitchPrefs from './PitchPrefs.js'
import PitchSocket from './socket.js'
import PlayerSocket from '../Player/socket.js'
import Prefs from '../Prefs/Prefs.js'
import Queue from '../Queue/Queue.js'
import { PITCH_FEEDBACK_TTL_MS } from '../../shared/pitchFeedback.js'
import {
  PITCH_FEEDBACK_PUSH,
  PITCH_FEEDBACK_RESPOND,
  PITCH_FEEDBACK_RESOLVED,
  PITCH_PREFS_PUSH,
  PLAYER_EMIT_ENDED,
  _ERROR,
  _SUCCESS,
} from '../../shared/actionTypes.js'

// Same live-binding trick as Queue.test.ts: Database.ts reassigns its exported
// `db` on open(), so the statically-imported modules follow whichever SQLite
// file is open at call time.

let tmpDir: string
let pathId: number
let roomId: number
let otherRoomId: number
let fernandoId: number
let anaId: number
let songId: number
let mediaId: number

interface SocketAction {
  type: string
  payload?: unknown
}

interface FakeSocket {
  id: string
  user: { userId: number, roomId: number, name: string }
  server?: unknown
  emit(event: string, action: SocketAction): void
}

let emitted: { socketId: string, action: SocketAction }[]

/** Minimal stand-in for the socket.io server: it only has to route by user. */
function connect (socks: FakeSocket[]): void {
  const server = {
    of: () => ({ sockets: new Map(socks.map(s => [s.id, s])) }),
    to: (socketId: string) => ({
      emit: (event: string, action: SocketAction) => emitted.push({ socketId, action }),
    }),
  }

  for (const s of socks) {
    s.server = server
    s.emit = (event: string, action: SocketAction) => emitted.push({ socketId: s.id, action })
  }
}

function makeSocket (id: string, userId: number, roomId: number): FakeSocket {
  return { id, user: { userId, roomId, name: id }, emit: () => {} }
}

const actionsFor = (socketId: string) => emitted.filter(e => e.socketId === socketId).map(e => e.action)

const addUser = (username: string): number => db.db.run(
  `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES (?, 'x', ?, 0, 0, 1)`,
  [username, username],
).lastID as number

const addRoom = (name: string): number => db.db.run(
  `INSERT INTO rooms (name, status, dateCreated, data) VALUES (?, 'open', 0, '{}')`,
  [name],
).lastID as number

describe('PitchFeedback (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-pitchfeedback-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    pathId = Prefs.addPath(tmpDir)

    songId = Library.matchSong({
      artist: 'Bee Gees', artistNorm: 'bee gees', title: 'I Started a Joke', titleNorm: 'i started a joke',
    }).songId

    mediaId = Media.add({
      songId,
      pathId,
      relPath: 'joke.mp4',
      duration: 180,
      dateAdded: Math.floor(Date.now() / 1000),
    })

    roomId = addRoom('Test Room')
    otherRoomId = addRoom('Another Room')
    fernandoId = addUser('fernando')
    anaId = addUser('ana')

    emitted = []
    PitchFeedback._reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('a performance that ended', () => {
    it('asks its singer, using the pitch and version that actually played', () => {
      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      const created = PitchFeedback.create(Queue.getPerformance(queueId))

      expect(created.pending.userId).toBe(fernandoId)
      expect(created.pending.songId).toBe(songId)
      expect(created.pending.performedPitch).toBe(-3)
      expect(created.pending.mediaId).toBe(mediaId)
      expect(created.replacedFeedbackId).toBeNull()
    })

    it('keeps only the most recent question per singer', () => {
      const first = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      const second = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: 1 })

      const a = PitchFeedback.create(Queue.getPerformance(first))
      const b = PitchFeedback.create(Queue.getPerformance(second))

      expect(b.replacedFeedbackId).toBe(a.pending.feedbackId)
      expect(PitchFeedback.getPending(fernandoId).feedbackId).toBe(b.pending.feedbackId)
    })

    it('ignores a duplicate end event for the same performance', () => {
      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      const performance = Queue.getPerformance(queueId)

      const first = PitchFeedback.create(performance)
      expect(PitchFeedback.create(performance)).toBeNull()
      expect(PitchFeedback.getPending(fernandoId).feedbackId).toBe(first.pending.feedbackId)
    })

    it('lapses after 15 minutes', () => {
      vi.useFakeTimers()

      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      PitchFeedback.create(Queue.getPerformance(queueId))

      vi.advanceTimersByTime(PITCH_FEEDBACK_TTL_MS - 1000)
      expect(PitchFeedback.getPending(fernandoId)).not.toBeNull()

      vi.advanceTimersByTime(2000)
      expect(PitchFeedback.getPending(fernandoId)).toBeNull()
    })

    it('is still there for a phone that reconnects in time', () => {
      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      const created = PitchFeedback.create(Queue.getPerformance(queueId))

      expect(PitchFeedback.getPending(fernandoId)).not.toBeNull()
      expect(PitchFeedback.toPrompt(PitchFeedback.getPending(fernandoId))).toEqual({
        feedbackId: created.pending.feedbackId,
        queueId,
        songId,
        pitchSemitones: -3,
        expiresAt: created.pending.expiresAt,
      })
    })

    // the prompt is what one person is being asked; the version it was filed
    // against is nobody else's business and isn't needed to answer
    it('never exposes mediaId to the client', () => {
      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      const created = PitchFeedback.create(Queue.getPerformance(queueId))

      expect('mediaId' in PitchFeedback.toPrompt(created.pending)).toBe(false)
    })
  })

  describe('answering', () => {
    let feedbackId: string

    beforeEach(() => {
      const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
      feedbackId = PitchFeedback.create(Queue.getPerformance(queueId)).pending.feedbackId
    })

    it('saves the adjusted pitch as a deliberate decision', () => {
      const res = PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'slightly_high' })

      expect(res.error).toBeUndefined()
      const pref = PitchPrefs.getForSong(fernandoId, songId)
      expect(pref.pitchSemitones).toBe(-4)
      expect(pref.source).toBe('assistant')
      expect(pref.mediaId).toBe(mediaId)
    })

    it('resolves the question, so it is not asked again', () => {
      PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'good' })
      expect(PitchFeedback.getPending(fernandoId)).toBeNull()
    })

    it('writes nothing for "not sure", leaving an existing pitch alone', () => {
      PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: 2, source: 'manual' })

      PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'unsure' })

      const pref = PitchPrefs.getForSong(fernandoId, songId)
      expect(pref.pitchSemitones).toBe(2)
      expect(pref.source).toBe('manual')
      expect(PitchFeedback.getPending(fernandoId)).toBeNull()
    })

    // an answer given on purpose outranks one merely observed from a queue add
    it('replaces a pitch that was only inferred', () => {
      PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: -1, source: 'inferred' })

      PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'much_too_low' })

      const pref = PitchPrefs.getForSong(fernandoId, songId)
      expect(pref.pitchSemitones).toBe(-1)
      expect(pref.source).toBe('assistant')
    })

    it('replaces a pitch the singer had set by hand', () => {
      PitchPrefs.set({ userId: fernandoId, songId, pitchSemitones: 5, source: 'manual' })

      PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'slightly_low' })

      const pref = PitchPrefs.getForSong(fernandoId, songId)
      expect(pref.pitchSemitones).toBe(-2)
      expect(pref.source).toBe('assistant')
    })

    it('refuses an answer from anybody else', () => {
      const res = PitchFeedback.respond({ userId: anaId, feedbackId, choice: 'good' })

      expect(res.error).toBeTruthy()
      expect(PitchPrefs.getForSong(anaId, songId)).toBeNull()
      // and Fernando is still being asked
      expect(PitchFeedback.getPending(fernandoId)).not.toBeNull()
    })

    it('refuses a choice that is not one of the offered answers', () => {
      expect(PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: 'perfect' }).error).toBeTruthy()
      expect(PitchFeedback.respond({ userId: fernandoId, feedbackId, choice: -4 }).error).toBeTruthy()
      expect(PitchFeedback.respond({ userId: fernandoId, feedbackId: 42, choice: 'good' }).error).toBeTruthy()
      expect(PitchFeedback.getPending(fernandoId)).not.toBeNull()
    })

    it('refuses an unknown or lapsed feedbackId', () => {
      expect(PitchFeedback.respond({ userId: fernandoId, feedbackId: 'nope', choice: 'good' }).error).toBeTruthy()
      expect(PitchPrefs.getForSong(fernandoId, songId)).toBeNull()
    })
  })

  it('saves a confirmed 0, which is a pitch and not an absence of one', () => {
    const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: 0 })
    const { pending } = PitchFeedback.create(Queue.getPerformance(queueId))

    PitchFeedback.respond({ userId: fernandoId, feedbackId: pending.feedbackId, choice: 'good' })

    const pref = PitchPrefs.getForSong(fernandoId, songId)
    expect(pref.pitchSemitones).toBe(0)
    expect(pref.source).toBe('assistant')
  })
})

describe('pitch feedback over sockets', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-pitchfeedback-socket-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    pathId = Prefs.addPath(tmpDir)

    songId = Library.matchSong({
      artist: 'ABBA', artistNorm: 'abba', title: 'Fernando', titleNorm: 'fernando',
    }).songId

    mediaId = Media.add({
      songId,
      pathId,
      relPath: 'fernando.mp4',
      duration: 180,
      dateAdded: Math.floor(Date.now() / 1000),
    })

    roomId = addRoom('Test Room')
    otherRoomId = addRoom('Another Room')
    fernandoId = addUser('fernando')
    anaId = addUser('ana')

    emitted = []
    PitchFeedback._reset()
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('asks only the singer, on every device they have open', () => {
    const player = makeSocket('player', anaId, roomId)
    const phone = makeSocket('phone', fernandoId, roomId)
    const tablet = makeSocket('tablet', fernandoId, roomId)
    const ana = makeSocket('ana-phone', anaId, roomId)
    connect([player, phone, tablet, ana])

    const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: { queueId } })

    for (const s of ['phone', 'tablet']) {
      const [action] = actionsFor(s)
      expect(action.type).toBe(PITCH_FEEDBACK_PUSH)
      expect(action.payload).toMatchObject({ songId, pitchSemitones: -3, queueId })
    }

    // not the room, not the next singer, not the Player
    expect(actionsFor('ana-phone')).toHaveLength(0)
    expect(actionsFor('player')).toHaveLength(0)
  })

  it('ignores a queueId from another room', () => {
    const player = makeSocket('player', anaId, otherRoomId)
    const phone = makeSocket('phone', fernandoId, roomId)
    connect([player, phone])

    const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: { queueId } })

    expect(emitted).toHaveLength(0)
    expect(PitchFeedback.getPending(fernandoId)).toBeNull()
  })

  it('ignores a nonsense payload', () => {
    const player = makeSocket('player', fernandoId, roomId)
    connect([player])

    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: {} })
    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: { queueId: 'x' } })
    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: null })

    expect(emitted).toHaveLength(0)
  })

  it('closes the question on the singer\'s other devices and pushes the saved pitch', () => {
    const player = makeSocket('player', anaId, roomId)
    const phone = makeSocket('phone', fernandoId, roomId)
    const tablet = makeSocket('tablet', fernandoId, roomId)
    const ana = makeSocket('ana-phone', anaId, roomId)
    connect([player, phone, tablet, ana])

    const queueId = Queue.add({ roomId, songId, userId: fernandoId, pitchSemitones: -3 })
    PlayerSocket[PLAYER_EMIT_ENDED](player, { payload: { queueId } })

    const { feedbackId } = PitchFeedback.getPending(fernandoId)
    const acks: { type: string }[] = []
    PitchSocket[PITCH_FEEDBACK_RESPOND](phone, {
      payload: { feedbackId, choice: 'slightly_high' },
    }, (action: { type: string }) => acks.push(action))

    expect(acks[0].type).toBe(PITCH_FEEDBACK_RESPOND + _SUCCESS)

    for (const s of ['phone', 'tablet']) {
      const types = actionsFor(s).map(a => a.type)
      expect(types).toEqual([PITCH_FEEDBACK_PUSH, PITCH_FEEDBACK_RESOLVED, PITCH_PREFS_PUSH])

      const resolved = actionsFor(s)[1]
      expect(resolved.payload).toEqual({ feedbackId, pitchSemitones: -4, limit: null })
    }

    expect(actionsFor('ana-phone')).toHaveLength(0)
  })

  it('reports a rejected answer to the caller and nobody else', () => {
    const phone = makeSocket('phone', fernandoId, roomId)
    connect([phone])

    const acks: { type: string, error?: string }[] = []
    PitchSocket[PITCH_FEEDBACK_RESPOND](phone, {
      payload: { feedbackId: 'nope', choice: 'good' },
    }, action => acks.push(action))

    expect(acks[0].type).toBe(PITCH_FEEDBACK_RESPOND + _ERROR)
    expect(emitted).toHaveLength(0)
  })
})
