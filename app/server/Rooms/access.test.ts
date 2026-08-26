import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseWrapper } from '../lib/Database.js'

/**
 * Who may enter which room.
 *
 * Worth testing against a real database rather than in the head: the rules are
 * three SQL statements and a fallback, and every one of them is the difference
 * between somebody singing tonight and somebody being told to find an admin.
 *
 * The module reads `db` at call time, so an in-memory database standing in for
 * the real one is enough — no schema migration, no server.
 */
const wrapper = new DatabaseWrapper(':memory:')

vi.mock('../lib/Database.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/Database.js')>()
  return {
    ...actual,
    get db () {
      return wrapper
    },
  }
})

const {
  canEnterRoom,
  forgetRoom,
  getAssignedRoomIds,
  getEnterableRooms,
  getPreferredRoomId,
  grantRoom,
  setAssignedRoomIds,
  setPreferredRoomId,
} = await import('./access.js')

const ADMIN = { userId: 1, isAdmin: true }
const SINGER = { userId: 2, isAdmin: false }

beforeEach(() => {
  wrapper.exec(`
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS userRooms;

    CREATE TABLE rooms (
      roomId integer PRIMARY KEY AUTOINCREMENT,
      name text NOT NULL,
      status text NOT NULL,
      password text,
      code text,
      dateCreated integer NOT NULL,
      data text NOT NULL DEFAULT('{}')
    );
    CREATE TABLE users (userId integer PRIMARY KEY AUTOINCREMENT, preferredRoomId integer);
    CREATE TABLE userRooms (userId integer NOT NULL, roomId integer NOT NULL, PRIMARY KEY (userId, roomId));
  `)

  // dateCreated descending is the order rooms come back in, so these are
  // deliberately staggered: "the first room they have access to" has to mean
  // something stable
  wrapper.run('INSERT INTO rooms (roomId, name, status, dateCreated) VALUES (1, ?, ?, 300)', ['Main', 'open'])
  wrapper.run('INSERT INTO rooms (roomId, name, status, dateCreated) VALUES (2, ?, ?, 200)', ['Terrace', 'open'])
  wrapper.run('INSERT INTO rooms (roomId, name, status, dateCreated) VALUES (3, ?, ?, 100)', ['Storeroom', 'closed'])

  wrapper.run('INSERT INTO users (userId) VALUES (1), (2)')
})

describe('room assignments', () => {
  it('let nobody in until an admin says so', () => {
    expect(getEnterableRooms(SINGER).result).toEqual([])
    expect(canEnterRoom(SINGER, 1)).toBe(false)
  })

  it('open every room to an admin, including the closed ones', () => {
    expect(getEnterableRooms(ADMIN).result).toEqual([1, 2, 3])
    expect(canEnterRoom(ADMIN, 3)).toBe(true)
  })

  it('are the whole list, so an unticked room is a revocation', () => {
    setAssignedRoomIds(SINGER.userId, [1, 2])
    expect(getAssignedRoomIds(SINGER.userId)).toEqual([1, 2])

    setAssignedRoomIds(SINGER.userId, [2])
    expect(getAssignedRoomIds(SINGER.userId)).toEqual([2])
  })

  it('do not open a closed room to a member who was assigned it', () => {
    setAssignedRoomIds(SINGER.userId, [1, 3])

    expect(getEnterableRooms(SINGER).result).toEqual([1])
    expect(canEnterRoom(SINGER, 3)).toBe(false)
  })

  it('are added to, not replaced, by an accepted invite', () => {
    setAssignedRoomIds(SINGER.userId, [1])
    grantRoom(SINGER.userId, 2)
    grantRoom(SINGER.userId, 2) // the same code, used twice

    expect(getAssignedRoomIds(SINGER.userId)).toEqual([1, 2])
  })
})

describe('the room somebody lands in', () => {
  it('is nothing at all when they have no rooms', () => {
    expect(getPreferredRoomId(SINGER)).toBeNull()
  })

  it('is their own choice while it is still theirs to make', () => {
    setAssignedRoomIds(SINGER.userId, [1, 2])
    setPreferredRoomId(SINGER.userId, 2)

    expect(getPreferredRoomId(SINGER)).toBe(2)
  })

  it('falls back to the first room they have rather than to nothing', () => {
    setAssignedRoomIds(SINGER.userId, [1, 2])
    setPreferredRoomId(SINGER.userId, 2)

    // an admin takes the terrace away
    setAssignedRoomIds(SINGER.userId, [1])

    expect(getPreferredRoomId(SINGER)).toBe(1)
  })

  it('survives the room being deleted', () => {
    setAssignedRoomIds(SINGER.userId, [1, 2])
    setPreferredRoomId(SINGER.userId, 2)

    wrapper.run('DELETE FROM rooms WHERE roomId = 2')
    forgetRoom(2)

    expect(getAssignedRoomIds(SINGER.userId)).toEqual([1])
    expect(getPreferredRoomId(SINGER)).toBe(1)
  })

  it('is never a room that is only closed for now', () => {
    setAssignedRoomIds(SINGER.userId, [2, 3])
    setPreferredRoomId(SINGER.userId, 3)

    expect(getPreferredRoomId(SINGER)).toBe(2)
  })
})
