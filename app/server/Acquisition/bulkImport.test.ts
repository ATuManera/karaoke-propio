import { describe, expect, it } from 'vitest'
import AcquisitionManager, { asFilenamePart } from './AcquisitionManager.js'
import MetaParser from '../Scanner/MetaParser/MetaParser.js'
import { stripSourceIdSuffix, withSourceIdSuffix } from '../lib/util.js'
import { buildLibraryMatchIndex } from '../../shared/playlistMatch.js'
import type { PlaylistImport, PlaylistImportEntry } from '../../shared/types.js'

const index = buildLibraryMatchIndex([
  { songId: 1, title: 'El reloj', artist: 'Luis Miguel' },
  { songId: 2, title: 'La Barca', artist: 'Luis Miguel' },
  { songId: 3, title: 'Vivir Mi Vida', artist: 'Marc Anthony' },
])

const plan = (entries: PlaylistImportEntry[]) =>
  AcquisitionManager.planBulk({ playlistId: 'PL1', title: 'Fiesta', entries, total: entries.length, read: entries.length } as PlaylistImport, index)

describe('AcquisitionManager.planBulk', () => {
  // the whole point of the feature: a bulk import must not re-download what is
  // already on disk under a slightly different name
  it('skips a song the library already has, however the uploader wrote it', () => {
    const items = plan([
      { id: 'aaaaaaaaaaa', title: 'Karaoke Luis Miguel La Barca', uploader: 'karaoke Gratis' },
      { id: 'bbbbbbbbbbb', title: 'Marc Anthony - Vivir Mi Vida - KARAOKE Tono Bajo', uploader: 'Movida Musical Karaoke' },
    ])

    expect(items.map(item => item.state)).toEqual(['skipped', 'skipped'])
    expect(items[0].detail).toMatch(/already in the library/)
  })

  it('downloads what is genuinely missing, under a name the library will agree with', () => {
    const items = plan([
      { id: 'ccccccccccc', title: 'Somos Novios - luis miguel | Karaoke Version | KaraFun', uploader: 'KaraFun Karaoke' },
    ])

    expect(items).toEqual([{
      id: 'ccccccccccc',
      artist: 'Luis Miguel',
      title: 'Somos Novios',
      isAmbiguous: false,
      state: 'waiting',
      detail: undefined,
    }])
  })

  // an original recording cannot be sung to, and choosing a karaoke version of
  // one unattended means taking whatever a search returned first
  it('leaves the songs that are not karaoke tracks alone', () => {
    const items = plan([
      { id: 'ddddddddddd', title: 'Queen – Bohemian Rhapsody (Official Video)', uploader: 'Queen Official' },
      { id: 'eeeeeeeeeee', title: 'Aerosmith - Crazy (Karaoke Version)', uploader: 'Sing King' },
    ])

    expect(items.map(item => item.id)).toEqual(['eeeeeeeeeee'])
  })

  it('downloads a song listed twice only once', () => {
    const items = plan([
      { id: 'fffffffffff', title: 'Aerosmith - Crazy (Karaoke Version)', uploader: 'Sing King' },
      { id: 'fffffffffff', title: 'Aerosmith - Crazy (Karaoke Version)', uploader: 'Sing King' },
    ])

    expect(items).toHaveLength(1)
  })

  // nothing reaches a URL that is not a YouTube video id, whatever a client
  // decides to send
  it('refuses an id that is not a YouTube video id', () => {
    expect(plan([{ id: '../../etc/passwd', title: 'Karaoke something', uploader: null }])).toEqual([])
  })

  // a first-time artist looks exactly like a misread one, and only a human can
  // tell them apart — so it is flagged rather than guessed at silently
  it('flags a reading the library could not corroborate', () => {
    const [item] = plan([
      { id: 'ggggggggggg', title: 'TU AMOR ME HACE BIEN TONO BAJO KARAOKE FULL SONIDO', uploader: 'Andres Mendez music' },
    ])

    expect(item.isAmbiguous).toBe(true)
    expect(item.artist).toBe('')
    expect(item.title).toBe('TU AMOR ME HACE BIEN')
  })
})

// The filename is the whole game: it is what a library rescan re-derives the
// artist from, so anything that survives the download has to survive being
// written down and read back too.
describe('what a bulk-imported song is filed as', () => {
  const roundTrip = (artist: string, title: string) => {
    const base = `${asFilenamePart(artist)} - ${asFilenamePart(title)}`
    return MetaParser(undefined)({
      dir: '/library',
      dirSep: '/',
      name: stripSourceIdSuffix(withSourceIdSuffix(base, 'lgG-Uz9_8ic')),
      meta: {},
    })
  }

  // the library writes "Beatles, The", and filing a second "Beatles The"
  // beside it is the duplication this feature exists to avoid
  it('reads back the name the library gave it, comma and all', () => {
    expect(roundTrip('Beatles, The', 'Something')).toMatchObject({ artist: 'Beatles, The', title: 'Something' })
    expect(roundTrip('Guns N\' Roses', 'Knockin\' on Heaven\'s Door'))
      .toMatchObject({ artist: 'Guns N\' Roses', title: 'Knockin\' on Heaven\'s Door' })
  })

  // a dash inside a title is a second delimiter, and MetaParser's longest-match
  // rule picked it: "Queen - Bohemian Rhapsody - Live Aid" came back as artist
  // "Queen-Bohemian Rhapsody"
  it('keeps a dash inside the title from being read as the separator', () => {
    expect(roundTrip('Queen', 'Bohemian Rhapsody - Live Aid'))
      .toMatchObject({ artist: 'Queen', title: 'Bohemian Rhapsody – Live Aid' })
  })

  // a filename with no " - " in it cannot be parsed at all — MetaParser throws
  it('gives a nameless song something parseable to be filed under', () => {
    expect(roundTrip('Unknown Artist', 'De vuelta pa la vuelta'))
      .toMatchObject({ artist: 'Unknown Artist', title: 'De vuelta pa la vuelta' })
  })
})
