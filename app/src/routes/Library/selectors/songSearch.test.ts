import { describe, expect, it } from 'vitest'
import { createSongSearchers, searchSongs, type SearchableSong } from './songSearch'

// the library as it is actually stored: leading articles moved to the end
const library: SearchableSong[] = [
  { songId: 1, title: 'Something', artist: 'Beatles, The' },
  { songId: 2, title: 'Here Comes The Sun', artist: 'Beatles, The' },
  { songId: 3, title: 'Hey Jude', artist: 'Beatles, The' },
  { songId: 4, title: 'Love Me Do', artist: 'Beatles, The' },
  { songId: 5, title: 'Bohemian Rhapsody', artist: 'Queen' },
  { songId: 6, title: 'Love Of My Life', artist: 'Queen' },
  { songId: 7, title: 'Hero', artist: 'Enrique Iglesias' },
  { songId: 8, title: 'Bailando', artist: 'Enrique Iglesias & Descemer Bueno & Gente De Zona' },
  { songId: 9, title: 'La Barca', artist: 'Luis Miguel' },
  { songId: 10, title: 'Dancing Queen', artist: 'ABBA' },
]
const searchers = createSongSearchers(library)

// what the artist searcher would have returned for the same query
const artistsFor = (str: string) =>
  [...new Set(library.map(song => song.artist))].filter(name =>
    name.toLowerCase().replace(/,\s*the$/, '').includes(str.split(' ')[0]))

const search = (str: string, artistNames = artistsFor(str)) => searchSongs(str, searchers, artistNames)

describe('searchSongs', () => {
  // the reason this file exists: each index only ever saw one field, so the way
  // people actually look for a half-remembered song matched neither
  it('finds a song named by its artist and its title at once', () => {
    expect(search('beatles something')).toEqual([1])
    expect(search('queen bohemian')).toEqual([5])
    expect(search('luis miguel la barca')).toContain(9)
  })

  it('still finds a song by its title alone', () => {
    expect(search('something')).toEqual([1])
    expect(search('bohemian rhapsody')).toEqual([5])
  })

  // MetaParser stores "Beatles, The"; nobody searches for the comma
  it('does not mind which end the article is on', () => {
    expect(search('the beatles here comes the sun')).toEqual([2])
  })

  // an artist's name belongs to their artist row, which lists these songs
  // already — repeating all of them below it is noise, not results
  it('lists no songs for a query that is only an artist name', () => {
    expect(search('beatles')).toEqual([])
    expect(search('luis miguel')).toEqual([])
    expect(search('enrique iglesias')).toEqual([])
  })

  // "Dancing Queen" is a title that happens to contain a name; the artist row
  // for Queen handles the rest
  it('leaves a one-word query to the title index', () => {
    expect(search('queen')).toEqual([10])
  })

  // a long credit outscored the query on word count, so Hero stayed hidden
  it('is not fooled by an artist credited alongside others', () => {
    expect(search('enrique iglesias hero')).toContain(7)
  })

  it('narrows to one artist when the rest of the query is vague', () => {
    const result = search('beatles love')
    expect(result).toContain(4)
    expect(result).not.toContain(6)
  })

  it('reports nothing for a song that is not there', () => {
    expect(search('soda stereo de musica ligera')).toEqual([])
  })
})
