import { describe, expect, it } from 'vitest'
import { corroborate } from './corroborate.js'
import { TransientLookupError, type MusicBrainzClient } from '../Categories/MusicBrainzClient.js'
import { buildLibraryMatchIndex } from '../../shared/playlistMatch.js'

const index = buildLibraryMatchIndex([
  { songId: 1, title: 'Riders on the Storm', artist: 'Doors, The' },
])

/**
 * What MusicBrainz actually answered for these titles, measured live on
 * 2026-08-22: the right way round scores 100, the wrong way round returns
 * nothing at all. Recorded here rather than queried, so the test says what the
 * code does with an answer instead of whether the internet is up.
 */
const oracle = (real: Record<string, string>): MusicBrainzClient => ({
  findRecording: async (artist: string, title: string) =>
    real[`${artist}|${title}`]
      ? { artist: real[`${artist}|${title}`], title, score: 100 }
      : null,
} as unknown as MusicBrainzClient)

const ambiguous = (artist: string, title: string) => ({ artist, title, isAmbiguous: true })

describe('corroborate', () => {
  // the real failure: a classic rock playlist into a Spanish-language library,
  // which recognised nobody and assumed "Artist - Title" for all of them
  it('turns a reversed title the right way round', async () => {
    const mb = oracle({ 'Free|All Right Now': 'Free' })

    expect(await corroborate(ambiguous('All Right Now', 'Free'), index, mb))
      .toEqual({ artist: 'Free', title: 'All Right Now', isAmbiguous: false })
  })

  it('leaves a title that was already the right way round', async () => {
    const mb = oracle({ 'Mountain|Mississippi Queen': 'Mountain' })

    expect(await corroborate(ambiguous('Mountain', 'Mississippi Queen'), index, mb))
      .toEqual({ artist: 'Mountain', title: 'Mississippi Queen', isAmbiguous: false })
  })

  // a song lands beside the others by the same performer or it does not land
  it('prefers the library\'s spelling of a name it already has', async () => {
    const mb = oracle({ 'Doors|Roadhouse Blues': 'The Doors' })

    expect((await corroborate(ambiguous('Doors', 'Roadhouse Blues'), index, mb)).artist)
      .toBe('Doors, The')
  })

  it('takes MusicBrainz\'s spelling of a name the library does not have', async () => {
    const mb = oracle({ 'Derek and the Dominos|Layla': 'Derek and the Dominos' })

    expect((await corroborate(ambiguous('Layla', 'Derek and the Dominos'), index, mb)).artist)
      .toBe('Derek and the Dominos')
  })

  // MusicBrainz returns equal-scoring recordings in no particular order, so
  // the same artist came back spelled two ways on two runs — which is two
  // artists in a library. The library's own spelling settles it either way.
  it('does not mind which way MusicBrainz spelled the ampersand', async () => {
    const withIndia = buildLibraryMatchIndex([{ songId: 2, title: 'Vivir Mi Vida', artist: 'Marc Anthony & La India' }])
    const mb = oracle({ 'Marc Anthony and La India|Nadie Como Ella': 'Marc Anthony and La India' })

    expect((await corroborate(ambiguous('Nadie Como Ella', 'Marc Anthony and La India'), withIndia, mb)).artist)
      .toBe('Marc Anthony & La India')
  })

  it('does not ask about a reading the library already settled', async () => {
    let asked = false
    const mb = {
      findRecording: async () => {
        asked = true
        return null
      },
    } as unknown as MusicBrainzClient
    const settled = { artist: 'Luis Miguel', title: 'La Barca', isAmbiguous: false }

    expect(await corroborate(settled, index, mb)).toEqual(settled)
    expect(asked).toBe(false)
  })

  it('leaves the reading alone when MusicBrainz recognises both ways, or neither', async () => {
    const neither = oracle({})
    expect(await corroborate(ambiguous('Mountain', 'Mississippi Queen'), index, neither))
      .toEqual(ambiguous('Mountain', 'Mississippi Queen'))

    const both = oracle({ 'A|B': 'A', 'B|A': 'B' })
    expect(await corroborate(ambiguous('A', 'B'), index, both)).toEqual(ambiguous('A', 'B'))
  })

  // an unlucky moment must never be recorded as an answer — the same rule
  // TransientLookupError exists for in the category scan
  it('changes nothing when MusicBrainz cannot be reached', async () => {
    const offline = {
      findRecording: async () => { throw new TransientLookupError('rate limited') },
    } as unknown as MusicBrainzClient

    expect(await corroborate(ambiguous('All Right Now', 'Free'), index, offline))
      .toEqual(ambiguous('All Right Now', 'Free'))
  })
})
