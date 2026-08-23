import { describe, expect, it } from 'vitest'
import { parseRepertoire, repertoireFileName, REPERTOIRE_FORMAT, MAX_SONGS } from './repertoire.js'

const file = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  format: REPERTOIRE_FORMAT,
  version: 1,
  dateCreated: 1700000000,
  songs: [
    { sourceId: '1gRQKAivLns', artist: 'ABBA', title: 'Chiquitita' },
    { sourceId: null, artist: 'Soda Stereo', title: 'De música ligera' },
  ],
  singer: {
    name: 'Fernando',
    pitches: [{ song: 0, pitchSemitones: -4, source: 'assistant', dateUpdated: 1700000001 }],
    starredSongs: [1],
    starredArtists: ['ABBA'],
  },
  ...overrides,
})

describe('parseRepertoire', () => {
  it('reads a well-formed file', () => {
    const parsed = parseRepertoire(file())

    expect(parsed.songs).toHaveLength(2)
    expect(parsed.songs[0].sourceId).toBe('1gRQKAivLns')
    expect(parsed.singer?.name).toBe('Fernando')
    expect(parsed.singer?.pitches[0]).toEqual({ song: 0, pitchSemitones: -4, source: 'assistant', sourceId: null, dateUpdated: 1700000001 })
    expect(parsed.singer?.starredSongs).toEqual([1])
  })

  it('reads the recording a pitch was learned against, when the file names one', () => {
    const parsed = parseRepertoire(file({
      singer: {
        name: 'Fernando',
        pitches: [{ song: 0, pitchSemitones: -4, source: 'assistant', sourceId: 'fJ9rUzIMcZQ', dateUpdated: 1 }],
        starredSongs: [],
        starredArtists: [],
      },
    }))

    expect(parsed.singer?.pitches[0].sourceId).toBe('fJ9rUzIMcZQ')
  })

  it('drops a malformed recording id on a pitch rather than trusting it', () => {
    const parsed = parseRepertoire(file({
      singer: {
        name: 'Fernando',
        pitches: [{ song: 0, pitchSemitones: -4, source: 'assistant', sourceId: 'nope', dateUpdated: 1 }],
        starredSongs: [],
        starredArtists: [],
      },
    }))

    expect(parsed.singer?.pitches[0].sourceId).toBeNull()
  })

  it('rejects anything that is not one of ours', () => {
    expect(() => parseRepertoire('not json')).toThrow(/not valid JSON/)
    expect(() => parseRepertoire('[]')).toThrow(/not a repertoire/)
    expect(() => parseRepertoire(JSON.stringify({ format: 'something/else', version: 1, songs: [] }))).toThrow(/Karaoke Propio/)
  })

  it('refuses a file from a future version rather than guessing at it', () => {
    expect(() => parseRepertoire(file({ version: 99 }))).toThrow(/newer version/)
  })

  // a library-only export: the same format with nobody in it
  it('accepts a file with no singer', () => {
    const parsed = parseRepertoire(file({ singer: undefined }))

    expect(parsed.singer).toBeUndefined()
    expect(parsed.songs).toHaveLength(2)
  })

  it('drops a malformed source id but keeps the song', () => {
    const parsed = parseRepertoire(file({
      songs: [{ sourceId: '../../etc/passwd', artist: 'ABBA', title: 'Fernando' }],
    }))

    expect(parsed.songs[0]).toEqual({ sourceId: null, artist: 'ABBA', title: 'Fernando' })
  })

  it('will not let a pitch point outside the song list', () => {
    expect(() => parseRepertoire(file({
      singer: { name: 'x', pitches: [{ song: 7, pitchSemitones: 0, source: 'manual', dateUpdated: 0 }] },
    }))).toThrow(/isn't in the file/)
  })

  it('will not carry a pitch the app cannot play', () => {
    expect(() => parseRepertoire(file({
      singer: { name: 'x', pitches: [{ song: 0, pitchSemitones: 400, source: 'manual', dateUpdated: 0 }] },
    }))).toThrow(/not a usable number/)
  })

  it('keeps the first of two pitches for the same song', () => {
    const parsed = parseRepertoire(file({
      singer: {
        name: 'x',
        pitches: [
          { song: 0, pitchSemitones: -4, source: 'manual', dateUpdated: 2 },
          { song: 0, pitchSemitones: 3, source: 'manual', dateUpdated: 1 },
        ],
      },
    }))

    expect(parsed.singer?.pitches).toHaveLength(1)
    expect(parsed.singer?.pitches[0].pitchSemitones).toBe(-4)
  })

  it('ignores stars that point nowhere, and repeats', () => {
    const parsed = parseRepertoire(file({
      singer: { name: 'x', pitches: [], starredSongs: [0, 0, 9, -1, 'a'], starredArtists: ['ABBA', 'ABBA', ''] },
    }))

    expect(parsed.singer?.starredSongs).toEqual([0])
    expect(parsed.singer?.starredArtists).toEqual(['ABBA'])
  })

  it('refuses a file too big to be anybody\'s repertoire', () => {
    const songs = Array.from({ length: MAX_SONGS + 1 }, () => ({ artist: 'a', title: 't' }))

    expect(() => parseRepertoire(file({ songs }))).toThrow(/more than/)
  })

  it('bounds the strings it accepts', () => {
    const parsed = parseRepertoire(file({
      songs: [{ artist: 'a'.repeat(5000), title: 't'.repeat(5000) }],
      singer: undefined,
    }))

    expect(parsed.songs[0].artist).toHaveLength(300)
    expect(parsed.songs[0].title).toHaveLength(300)
  })

  it('needs a title to have anything to match on', () => {
    expect(() => parseRepertoire(file({ songs: [{ artist: 'ABBA', title: '  ' }], singer: undefined }))).toThrow(/title is empty/)
  })
})

describe('repertoireFileName', () => {
  it('names the download after the singer', () => {
    expect(repertoireFileName('Fernando')).toBe('fernando.karaoke-propio.json')
    expect(repertoireFileName('José María')).toBe('jose-maria.karaoke-propio.json')
  })

  it('never produces a name from punctuation alone', () => {
    expect(repertoireFileName('***')).toBe('repertoire.karaoke-propio.json')
  })
})
