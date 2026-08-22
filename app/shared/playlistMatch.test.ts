import { describe, expect, it } from 'vitest'
import {
  buildLibraryMatchIndex,
  guessTrackMeta,
  isKaraokeUpload,
  matchInLibrary,
  normalizeForMatch,
  resolveTrackMeta,
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

  // three spellings in circulation, not two: a YouTube title, a MusicBrainz
  // credit and a filename that lost the ampersand on the way to disk
  it('reads "&", "and" and nothing at all as the same joining word', () => {
    const forms = ['Simon & Garfunkel', 'Simon and Garfunkel', 'Simon Garfunkel']
    expect(new Set(forms.map(name => normalizeForMatch(name))).size).toBe(1)

    // the library holds this one; a playlist writing it either other way has
    // to keep finding it
    expect(normalizeForMatch('Marc Anthony & La India')).toBe(normalizeForMatch('Marc Anthony La India'))
    expect(normalizeForMatch('Marc Anthony & La India')).toBe(normalizeForMatch('Marc Anthony y La India'))
  })

  // dropping the connector must not be allowed to empty a name out
  it('leaves a song that is only a connector alone', () => {
    expect(normalizeForMatch('Y')).toBe('y')
    expect(normalizeForMatch('And')).toBe('and')
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

  // a karaoke channel published the upload; it did not perform the song, and
  // filing Marc Anthony's catalogue under "karaoke Vinotinto" helps nobody
  it('never takes a karaoke channel for the artist', () => {
    expect(guessTrackMeta({ title: 'De vuelta pa la vuelta karaoke tono bajo VINOTINTO MUSIC', uploader: 'karaoke Vinotinto' }))
      .toEqual({ artist: '', title: 'De vuelta pa la vuelta' })
    expect(guessTrackMeta({ title: 'TU AMOR ME HACE BIEN TONO BAJO KARAOKE FULL SONIDO', uploader: 'Movida Musical Karaoke' }).artist)
      .toBe('')
  })

  it('leaves the artist empty when nothing names one', () => {
    expect(guessTrackMeta({ title: 'Unchained Melody', uploader: null }))
      .toEqual({ artist: '', title: 'Unchained Melody' })
  })
})

describe('isKaraokeUpload', () => {
  // it decides what the entry is for: the version someone already chose, or a
  // song that still needs a karaoke version found for it
  it('recognises a karaoke upload by its title or its channel', () => {
    expect(isKaraokeUpload({ title: 'Marc Anthony - Vivir Mi Vida - KARAOKE Tono Bajo' })).toBe(true)
    expect(isKaraokeUpload({ title: 'Por Que Les Mientes', uploader: 'karaoke Vinotinto' })).toBe(true)
    expect(isKaraokeUpload({ title: 'Vivir Mi Vida (Instrumental)' })).toBe(true)
  })

  it('leaves an ordinary music video alone', () => {
    expect(isKaraokeUpload({ title: 'Queen – Bohemian Rhapsody (Official Video)', uploader: 'Queen Official' })).toBe(false)
    expect(isKaraokeUpload({ title: 'Vivir Mi Vida', uploader: 'Marc Anthony - Topic' })).toBe(false)
    expect(isKaraokeUpload({ title: null, uploader: null })).toBe(false)
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

// Everything below came from a real import that reported three songs missing
// which were sitting in the library the whole time.
describe('matchInLibrary, when the artist runs into the title', () => {
  const library: MatchableSong[] = [
    { songId: 1, title: 'El reloj', artist: 'Luis Miguel' },
    { songId: 2, title: 'La Barca', artist: 'Luis Miguel' },
    { songId: 3, title: 'Hasta que me olvides', artist: 'Luis Miguel' },
    { songId: 4, title: 'Tú y yo', artist: 'Luis Miguel' },
    { songId: 5, title: 'Tú', artist: 'Luis Miguel' },
    { songId: 6, title: 'Price Tag', artist: 'Jessie J ft. B.o.B' },
  ]
  const index = buildLibraryMatchIndex(library)
  const match = (title: string, uploader = 'karaoke Gratis') =>
    matchInLibrary(guessTrackMeta({ title, uploader }), index)

  // a karaoke channel writes both names as one run of words, and no split can
  // tell where one ends and the other begins — but the library knows both
  it('finds the song sitting inside the whole string', () => {
    expect(match('Karaoke Luis Miguel La Barca')).toBe(2)
    expect(match('Hasta que me olvides-Luis miguel karaoke')).toBe(3)
  })

  // the library writes the article, the playlist does not
  it('does not mind a missing Spanish article', () => {
    expect(normalizeForMatch('El reloj')).toBe(normalizeForMatch('Reloj'))
    expect(match('Karaoke Luis Miguel Reloj')).toBe(1)
  })

  it('takes the longest title that fits, not the first', () => {
    expect(match('Karaoke Luis Miguel Tú y yo')).toBe(4)
    expect(match('Karaoke Luis Miguel Tú')).toBe(5)
  })

  // dropping the guests is right for a name and wrong for a whole title: the
  // song comes after the "ft." and would go with them
  it('keeps looking past a featured artist', () => {
    expect(match('Karaoke Jessie J ft. B.o.B Price Tag')).toBe(6)
  })

  it('needs the artist too, not just a title that happens to be in there', () => {
    expect(match('Karaoke Los Panchos La Barca')).toBeNull()
    expect(match('Una tarde en la barca del abuelo', 'Cuentos')).toBeNull()
  })
})

// Every title below is real, from the two playlists that produced this
// feature. A bulk import has no human to correct it, so what these resolve to
// is what ends up in the filename — and the filename is what a rescan reads
// the artist back out of.
describe('resolveTrackMeta', () => {
  const library: MatchableSong[] = [
    { songId: 1, title: 'El reloj', artist: 'Luis Miguel' },
    { songId: 2, title: 'La Barca', artist: 'Luis Miguel' },
    { songId: 3, title: 'Hasta que me olvides', artist: 'Luis Miguel' },
    { songId: 4, title: 'Flor Pálida', artist: 'Marc Anthony' },
    { songId: 5, title: 'Vivir Mi Vida', artist: 'Marc Anthony' },
    { songId: 6, title: 'Deja que te bese', artist: 'Alejandro Sanz' },
    { songId: 7, title: 'Here Comes The Sun', artist: 'Beatles, The' },
  ]
  const index = buildLibraryMatchIndex(library)
  const resolve = (title: string, uploader: string | null = null) => resolveTrackMeta({ title, uploader }, index)

  it('reads the artist off whichever side of the dash it is on', () => {
    expect(resolve('Luis Miguel - La Bikina (Versión Karaoke)'))
      .toEqual({ artist: 'Luis Miguel', title: 'La Bikina', isAmbiguous: false })
    expect(resolve('El Reloj - Luis Miguel (Karaoke)'))
      .toEqual({ artist: 'Luis Miguel', title: 'El Reloj', isAmbiguous: false })
    expect(resolve('KARAOKE MALA - MARC ANTHONY'))
      .toEqual({ artist: 'Marc Anthony', title: 'MALA', isAmbiguous: false })
  })

  // the library's spelling, not the uploader's: filing a second "MARC ANTHONY"
  // beside "Marc Anthony" is exactly the duplication this is meant to prevent
  it('files under the name the library already uses', () => {
    expect(resolve('Somos Novios - luis miguel | Karaoke Version | KaraFun').artist).toBe('Luis Miguel')
    expect(resolve('Here Comes The Sun - The Beatles (Karaoke)').artist).toBe('Beatles, The')
  })

  it('finds a name that no separator marks off', () => {
    expect(resolve('Karaoke Luis Miguel La Barca'))
      .toEqual({ artist: 'Luis Miguel', title: 'La Barca', isAmbiguous: false })
    expect(resolve('Marc Anthony Flor Palida Nueva Version Karaoke'))
      .toEqual({ artist: 'Marc Anthony', title: 'Flor Palida', isAmbiguous: false })
    // no space around the hyphen, so nothing splits on it
    expect(resolve('Hasta que me olvides-Luis miguel karaoke'))
      .toEqual({ artist: 'Luis Miguel', title: 'Hasta que me olvides', isAmbiguous: false })
  })

  it('does not hand the song to the guest artist', () => {
    expect(resolve('Karaoke Alejandro Sanz feat Marc Anthony Deja que te bese'))
      .toEqual({ artist: 'Alejandro Sanz', title: 'Deja que te bese', isAmbiguous: false })
  })

  // a karaoke channel is a publisher; filing Marc Anthony's catalogue under
  // whoever uploaded it is how one artist's songs get scattered
  it('never lets the channel name the artist', () => {
    expect(resolve('TU AMOR ME HACE BIEN TONO BAJO KARAOKE FULL SONIDO', 'Andres Mendez music'))
      .toEqual({ artist: '', title: 'TU AMOR ME HACE BIEN', isAmbiguous: true })
    expect(resolve('De vuelta pa la vuelta karaoke tono bajo VINOTINTO MUSIC', 'karaoke Vinotinto'))
      .toEqual({ artist: '', title: 'De vuelta pa la vuelta', isAmbiguous: true })
  })

  // the answer a first-time artist gets, and the reason every bulk import is
  // held for review rather than trusted
  it('says so when the library has nothing to corroborate the reading', () => {
    expect(resolve('Aerosmith - I Don\'t Want To Miss A Thing (Karaoke Version)'))
      .toEqual({ artist: 'Aerosmith', title: 'I Don\'t Want To Miss A Thing', isAmbiguous: true })
    expect(resolve('Por Que Les Mientes Tito el Bambino Marc Anthony1 Las as Ro').isAmbiguous).toBe(true)
  })
})
