import { describe, expect, it } from 'vitest'
import {
  buildLibraryMatchIndex,
  guessTrackMeta,
  matchInLibrary,
  normalizeForMatch,
  type MatchableSong,
} from './playlistMatch.js'

describe('normalizeForMatch', () => {
  it('ignores accents, case and punctuation', () => {
    expect(normalizeForMatch('Flor Pálida')).toBe(normalizeForMatch('FLOR PALIDA'))
    // the apostrophe is routinely lost on the way to a filename, so it cannot
    // be what decides a match
    expect(normalizeForMatch('Don\'t Stop Me Now')).toBe(normalizeForMatch('Dont Stop Me Now'))
    expect(normalizeForMatch('Don’t Stop Me Now')).toBe(normalizeForMatch('Don\'t Stop Me Now'))
    expect(normalizeForMatch('Corazón Partío')).toBe('corazon partio')
  })

  it('ignores anything in brackets', () => {
    expect(normalizeForMatch('Bohemian Rhapsody (Official Video Remastered)')).toBe('bohemian rhapsody')
    expect(normalizeForMatch('Africa [Live at Wembley]')).toBe('africa')
  })

  it('ignores featured artists', () => {
    expect(normalizeForMatch('Despacito ft. Daddy Yankee')).toBe('despacito')
    expect(normalizeForMatch('Beautiful feat. Snoop Dogg')).toBe('beautiful')
  })

  // the library stores a leading article at the end, so without this the most
  // ordinary English-language playlist reads as almost entirely missing
  it('sees "The Beatles" and "Beatles, The" as the same name', () => {
    expect(normalizeForMatch('The Beatles')).toBe(normalizeForMatch('Beatles, The'))
    expect(normalizeForMatch('The Show Must Go On')).toBe(normalizeForMatch('Show Must Go On, The'))
  })
})

describe('guessTrackMeta', () => {
  it('splits a title written with any kind of dash', () => {
    // real titles from YouTube, hyphen and en dash, same channel convention
    expect(guessTrackMeta({ title: 'Queen – Bohemian Rhapsody (Official Video Remastered)' }))
      .toEqual({ artist: 'Queen', title: 'Bohemian Rhapsody' })
    expect(guessTrackMeta({ title: 'Queen - Don\'t Stop Me Now (Official Video)' }))
      .toEqual({ artist: 'Queen', title: 'Don\'t Stop Me Now' })
  })

  // YouTube Music's auto-generated uploads put the bare song name in the title
  // and the artist only in the channel
  it('falls back to the channel when the title has no artist in it', () => {
    expect(guessTrackMeta({ title: 'Somebody To Love', uploader: 'Queen - Topic' }))
      .toEqual({ artist: 'Queen', title: 'Somebody To Love' })
  })

  it('drops the words channels append to their own name', () => {
    expect(guessTrackMeta({ title: 'Radio Ga Ga', uploader: 'Queen Official' }).artist).toBe('Queen')
    expect(guessTrackMeta({ title: 'Vivir Mi Vida', uploader: 'MarcAnthonyVEVO' }).artist).toBe('MarcAnthonyVEVO')
    expect(guessTrackMeta({ title: 'Vivir Mi Vida', uploader: 'Marc Anthony VEVO' }).artist).toBe('Marc Anthony')
  })

  it('leaves the artist empty when nothing names one', () => {
    expect(guessTrackMeta({ title: 'Unchained Melody', uploader: null }))
      .toEqual({ artist: '', title: 'Unchained Melody' })
  })
})

describe('matchInLibrary', () => {
  const library: MatchableSong[] = [
    { songId: 1, title: 'Bohemian Rhapsody', artist: 'Queen' },
    { songId: 2, title: 'Here Comes The Sun', artist: 'Beatles, The' },
    { songId: 3, title: 'Hero', artist: 'Enrique Iglesias' },
    { songId: 4, title: 'Hero', artist: 'Mariah Carey' },
    { songId: 5, title: 'Flor Pálida', artist: 'Marc Anthony' },
  ]
  const index = buildLibraryMatchIndex(library)

  it('finds a song written the way the playlist writes it', () => {
    expect(matchInLibrary(guessTrackMeta({ title: 'Queen – Bohemian Rhapsody (Official Video)' }), index)).toBe(1)
    expect(matchInLibrary(guessTrackMeta({ title: 'Flor Palida', uploader: 'Marc Anthony - Topic' }), index)).toBe(5)
  })

  it('finds it through the article the library moved to the end', () => {
    expect(matchInLibrary({ artist: 'The Beatles', title: 'Here Comes The Sun' }, index)).toBe(2)
  })

  // "Here Comes The Sun - The Beatles" is written the other way round and
  // there is no way to tell up front, so both readings are tried
  it('finds it with the artist and title the wrong way round', () => {
    expect(matchInLibrary(guessTrackMeta({ title: 'Here Comes The Sun - The Beatles' }), index)).toBe(2)
  })

  it('does not confuse two songs that only share a title', () => {
    expect(matchInLibrary({ artist: 'Enrique Iglesias', title: 'Hero' }, index)).toBe(3)
    expect(matchInLibrary({ artist: 'Chad Kroeger', title: 'Hero' }, index)).toBeNull()
  })

  it('will not guess between same-titled songs when the artist is unknown', () => {
    expect(matchInLibrary({ artist: '', title: 'Hero' }, index)).toBeNull()
    // …but a title only one song carries is enough on its own
    expect(matchInLibrary({ artist: '', title: 'Bohemian Rhapsody' }, index)).toBe(1)
  })

  it('reports a song that is not there', () => {
    expect(matchInLibrary({ artist: 'Soda Stereo', title: 'De Música Ligera' }, index)).toBeNull()
  })
})
