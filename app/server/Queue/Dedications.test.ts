import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import Dedications from './Dedications.js'
import Queue from './Queue.js'
import Media from '../Media/Media.js'
import Prefs from '../Prefs/Prefs.js'
import Rooms from '../Rooms/Rooms.js'
import Library from '../Library/Library.js'
import { DEDICATION_MAX_LENGTH } from '../../shared/dedication.js'

// see Queue.test.ts: `db` is a live ES module binding, so the statically
// imported classes follow whichever SQLite file is open at call time

let tmpDir: string
let roomId: number
let otherRoomId: number
let singerId: number
let adminId: number
let songId: number

describe('Dedications (integration, real SQLite)', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-dedications-test-'))
    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })

    const pathId = Prefs.addPath(tmpDir)
    songId = Library.matchSong({ artist: 'Test Artist', artistNorm: 'test artist', title: 'Test Song', titleNorm: 'test song' }).songId

    Media.add({
      songId,
      pathId,
      relPath: 'test.mp4',
      duration: 180,
      dateAdded: Math.floor(Date.now() / 1000),
    })

    roomId = db.db.run(
      `INSERT INTO rooms (name, status, dateCreated, data) VALUES ('Test Room', 'open', 0, '{}')`,
    ).lastID as number

    otherRoomId = db.db.run(
      `INSERT INTO rooms (name, status, dateCreated, data) VALUES ('Other Room', 'open', 0, '{}')`,
    ).lastID as number

    singerId = db.db.run(
      `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES ('ana', 'x', 'Ana', 0, 0, 1)`,
    ).lastID as number

    adminId = db.db.run(
      `INSERT INTO users (username, password, name, dateCreated, dateUpdated, roleId) VALUES ('admin', 'x', 'Admin', 0, 0, 1)`,
    ).lastID as number
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('stores a singer\'s dedication and reads it back with its author\'s name', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis, que cumple hoy' })

    const [dedication] = Dedications.getForRoom(roomId)[queueId]
    expect(dedication.text).toBe('Para Luis, que cumple hoy')
    expect(dedication.userId).toBe(singerId)
    expect(dedication.userDisplayName).toBe('Ana')
  })

  it('sanitizes on the way in, so the stored text is what the banner can show', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: `  Para Ana\ny Luis  ${'!'.repeat(DEDICATION_MAX_LENGTH)}` })

    const [dedication] = Dedications.getForRoom(roomId)[queueId]
    expect(dedication.text.startsWith('Para Ana y Luis')).toBe(true)
    expect([...dedication.text]).toHaveLength(DEDICATION_MAX_LENGTH)
  })

  it('replaces the author\'s own message instead of adding a second one', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Primera' })
    Dedications.set({ queueId, userId: singerId, text: 'Corregida' })

    const list = Dedications.getForRoom(roomId)[queueId]
    expect(list).toHaveLength(1)
    expect(list[0].text).toBe('Corregida')
  })

  it('keeps an admin\'s message alongside the singer\'s, oldest first', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })
    Dedications.set({ queueId, userId: adminId, text: 'El buffet ya está servido' })

    const list = Dedications.getForRoom(roomId)[queueId]
    expect(list.map(d => d.text)).toEqual(['Para Luis', 'El buffet ya está servido'])
  })

  it('an admin rewriting a dedication leaves it signed by the singer', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luiz' })

    const [before] = Dedications.getForRoom(roomId)[queueId]
    Dedications.update({ dedicationId: before.dedicationId, text: 'Para Luis' })

    const [after] = Dedications.getForRoom(roomId)[queueId]
    expect(after.text).toBe('Para Luis')
    expect(after.userId).toBe(singerId)
  })

  it('reads an emptied message as taking it down', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })
    Dedications.set({ queueId, userId: singerId, text: '   ' })

    expect(Dedications.getForRoom(roomId)[queueId]).toBeUndefined()
  })

  it('forgets what was said about a song removed from the queue', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })

    Queue.remove(queueId)

    expect(Dedications.getRow(1)).toBeUndefined()
    expect(Dedications.getForRoom(roomId)[queueId]).toBeUndefined()
  })

  it('never shows one room what was said in another', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })

    expect(Dedications.getForRoom(otherRoomId)).toEqual({})
  })

  it('attaches messages to the queue push the player already receives', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    const quietQueueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })

    const queue = Queue.get(roomId)
    expect(queue.entities[queueId].dedications.map(d => d.text)).toEqual(['Para Luis'])
    expect(queue.entities[quietQueueId].dedications).toBeUndefined()
  })

  it('takes dedications in a room that was never asked about them', () => {
    // every room that predates the switch is one where they were already
    // appearing; reading its silence as "off" would take the feature away
    expect(Rooms.areDedicationsEnabled(roomId)).toBe(true)
  })

  it('stops taking them once an admin turns them off, and takes them again after', () => {
    Rooms.set(roomId, { name: 'Test Room', status: 'open', prefs: { dedications: { isEnabled: false } } })
    expect(Rooms.areDedicationsEnabled(roomId)).toBe(false)

    Rooms.set(roomId, { name: 'Test Room', status: 'open', prefs: { dedications: { isEnabled: true } } })
    expect(Rooms.areDedicationsEnabled(roomId)).toBe(true)
  })

  it('keeps every message through a room being switched off and on', () => {
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })

    Rooms.set(roomId, { name: 'Test Room', status: 'open', prefs: { dedications: { isEnabled: false } } })
    Rooms.set(roomId, { name: 'Test Room', status: 'open', prefs: { dedications: { isEnabled: true } } })

    // the switch decides what is shown and who may write, never what is kept
    expect(Dedications.getForRoom(roomId)[queueId][0].text).toBe('Para Luis')
  })

  it('answers for a room that isn\'t there without inventing a decision', () => {
    expect(Rooms.areDedicationsEnabled(999_999)).toBe(true)
  })

  it('does not change which recording plays when several people write', () => {
    // a one-to-many join onto Queue.get() would multiply its media rows and
    // let MAX(isPreferred) land elsewhere; this is the regression that guards
    // against re-introducing one
    const queueId = Queue.add({ roomId, songId, userId: singerId })
    const before = Queue.get(roomId).entities[queueId].mediaId

    Dedications.set({ queueId, userId: singerId, text: 'Para Luis' })
    Dedications.set({ queueId, userId: adminId, text: 'Y para todos' })

    const after = Queue.get(roomId).entities[queueId]
    expect(after.mediaId).toBe(before)
    expect(after.dedications).toHaveLength(2)
  })
})
