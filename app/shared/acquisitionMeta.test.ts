import { describe, expect, it } from 'vitest'
import { cleanSongText, guessArtistTitle } from './acquisitionMeta.js'

// every input below is a real YouTube title that landed in the library during
// live testing (see git history for the mess they produced)
describe('cleanSongText', () => {
  it('drops karaoke/lyrics noise in parens and brackets', () => {
    expect(cleanSongText('Piano Man (Karaoke Version)')).toBe('Piano Man')
    expect(cleanSongText('Robarte un Beso [KARAOKE]')).toBe('Robarte un Beso')
    expect(cleanSongText('Robarte Un Beso (Versión Karaoke)')).toBe('Robarte Un Beso')
    expect(cleanSongText('Flor Pálida (Letra_Lyrics)')).toBe('Flor Pálida')
    expect(cleanSongText('Unchained Melody (Karaoke & Lyrics)')).toBe('Unchained Melody')
  })

  it('drops trailing channel tags, however many are chained', () => {
    expect(cleanSongText('Marc Anthony _ Karaoke Versión _ Karaoke Latino')).toBe('Marc Anthony')
  })

  it('leaves a clean title untouched', () => {
    expect(cleanSongText('Cuando pase el temblor')).toBe('Cuando pase el temblor')
    expect(cleanSongText('Here Comes The Sun')).toBe('Here Comes The Sun')
  })
})

describe('guessArtistTitle', () => {
  it('splits the common "Artist - Title" order', () => {
    expect(guessArtistTitle('Billy Joel - Piano Man (Karaoke Version)'))
      .toEqual({ artist: 'Billy Joel', title: 'Piano Man' })
    expect(guessArtistTitle('Jeanette - Soy Rebelde (Versión Karaoke)'))
      .toEqual({ artist: 'Jeanette', title: 'Soy Rebelde' })
  })

  it('cannot tell a reversed title apart — which is exactly why the user confirms it', () => {
    // "Here Comes The Sun" is the song, not the artist; guessing puts it in the
    // artist field and only the user can catch that
    expect(guessArtistTitle('Here Comes The Sun - The Beatles (Acoustic Karaoke)'))
      .toEqual({ artist: 'Here Comes The Sun', title: 'The Beatles' })
  })

  it('never splits on a hyphen that belongs to a name', () => {
    expect(guessArtistTitle('Blink-182')).toEqual({ artist: '', title: 'Blink-182' })
  })

  it('returns an empty artist when there is no separator at all', () => {
    expect(guessArtistTitle('Unchained Melody')).toEqual({ artist: '', title: 'Unchained Melody' })
  })
})
