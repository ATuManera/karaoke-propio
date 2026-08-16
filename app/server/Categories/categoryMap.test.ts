import { describe, expect, it } from 'vitest'
import { decadeFromYear, looksLikeCollaboration, namesMatch, primaryArtist, toCategories, voiceFromArtist, yearFromDate } from './categoryMap.js'

describe('decadeFromYear', () => {
  it('formats last-century decades the way people say them', () => {
    expect(decadeFromYear(1971)).toBe('70\'s')
    expect(decadeFromYear(1989)).toBe('80\'s')
    expect(decadeFromYear(1990)).toBe('90\'s')
  })

  it('spells out 2000s decades in full to avoid an ambiguous "10\'s"', () => {
    expect(decadeFromYear(2013)).toBe('2010\'s')
    expect(decadeFromYear(2001)).toBe('2000\'s')
  })

  it('rejects nonsense years rather than inventing a decade', () => {
    expect(decadeFromYear(1200)).toBeNull()
    expect(decadeFromYear(NaN)).toBeNull()
  })
})

describe('yearFromDate', () => {
  it('accepts the partial dates MusicBrainz returns', () => {
    expect(yearFromDate('2013-07-22')).toBe(2013)
    expect(yearFromDate('1971')).toBe(1971)
    expect(yearFromDate(undefined)).toBeNull()
    expect(yearFromDate('')).toBeNull()
  })
})

describe('voiceFromArtist', () => {
  it('maps a person\'s gender', () => {
    expect(voiceFromArtist('Person', 'female')).toBe('Female')
    expect(voiceFromArtist('Person', 'male')).toBe('Male')
  })

  it('calls a band "Grupo" — MusicBrainz reports no gender for one', () => {
    expect(voiceFromArtist('Group', undefined)).toBe('Group')
  })

  it('stays silent when nothing is known', () => {
    expect(voiceFromArtist(undefined, undefined)).toBeNull()
  })
})

describe('toCategories', () => {
  // real MusicBrainz payloads, captured live 2026-08-14
  it('categorises "Flor Pálida" (Marc Anthony)', () => {
    const result = toCategories({
      tags: ['pop', 'vocal', 'salsa', 'ballad', 'latin pop', 'latin', 'american'],
      artistType: 'Person',
      artistGender: 'male',
      year: 2013,
    })

    expect(result).toEqual([
      { name: 'Pop', type: 'genre' },
      { name: 'Salsa', type: 'genre' },
      { name: 'Ballad', type: 'genre' },
      // inferred: a latin genre outweighs the artist's US country
      { name: 'Spanish', type: 'language' },
      { name: 'Male', type: 'voice' },
      { name: '2010\'s', type: 'decade' },
    ])
  })

  it('categorises "Soy Rebelde" (Jeanette), including language', () => {
    const result = toCategories({
      tags: ['pop', 'spanish', 'vocal', 'ballad', 'latin', 'oldies'],
      artistType: 'Person',
      artistGender: 'female',
      year: 1971,
    })

    expect(result).toContainEqual({ name: 'Spanish', type: 'language' })
    expect(result).toContainEqual({ name: 'Female', type: 'voice' })
    expect(result).toContainEqual({ name: '70\'s', type: 'decade' })
  })

  it('drops tags outside the curated set instead of guessing', () => {
    // MusicBrainz tags are crowd-edited: these sit on The Beatles' artist page
    const result = toCategories({ tags: ['80s', 'experimental', 'orchestral', 'british'], artistType: 'Group' })

    expect(result).toEqual([{ name: 'Group', type: 'voice' }])
    // "80s" as a *tag* must not become a decade — only a real release year may
    expect(result.some(c => c.type === 'decade')).toBe(false)
  })

  it('never repeats a category when several tags map to the same one', () => {
    const result = toCategories({ tags: ['pop', 'latin pop', 'pop rock'] })
    expect(result.filter(c => c.type === 'genre')).toEqual([{ name: 'Pop', type: 'genre' }])
  })

  it('keeps at most three genres, strongest first', () => {
    // MusicBrainz returns genres ordered by vote count; a song wearing eight
    // chips is no more browsable than one wearing none
    const result = toCategories({ tags: ['rock', 'pop', 'ballad', 'salsa', 'tango', 'blues'] })
    const genres = result.filter(c => c.type === 'genre').map(c => c.name)

    expect(genres).toEqual(['Rock', 'Pop', 'Ballad'])
  })

  it('infers language from country when no genre gives it away', () => {
    expect(toCategories({ tags: ['rock'], artistCountry: 'GB' }))
      .toContainEqual({ name: 'English', type: 'language' })
    expect(toCategories({ tags: ['rock'], artistCountry: 'AR' }))
      .toContainEqual({ name: 'Spanish', type: 'language' })
  })

  it('leaves language unset when nothing indicates it', () => {
    const result = toCategories({ tags: ['rock'], artistCountry: 'JP' })
    expect(result.some(c => c.type === 'language')).toBe(false)
  })
})

describe('looksLikeCollaboration', () => {
  it('spots credits naming more than one performer', () => {
    expect(looksLikeCollaboration('Marc Anthony & La India')).toBe(true)
    expect(looksLikeCollaboration('Carlos Vives & Sebastián Yatra')).toBe(true)
    expect(looksLikeCollaboration('Sebastián Yatra ft. Carlos Vives')).toBe(true)
    expect(looksLikeCollaboration('Shakira feat. Alejandro Sanz')).toBe(true)
    expect(looksLikeCollaboration('Pimpinela con Dyango')).toBe(true)
  })

  it('does not mistake this app\'s "X, The" convention for a duet', () => {
    // artists are stored with the article moved to the end, so a comma must
    // never count as a separator
    expect(looksLikeCollaboration('Beatles, The')).toBe(false)
    expect(looksLikeCollaboration('Righteous Brothers, The')).toBe(false)
  })

  it('leaves ordinary artists alone', () => {
    expect(looksLikeCollaboration('Marc Anthony')).toBe(false)
    expect(looksLikeCollaboration('Soda Stereo')).toBe(false)
  })
})

describe('namesMatch', () => {
  it('rejects the partial match that mislabeled a duet', () => {
    // MusicBrainz answers this query with "India" at score 100; trusting it
    // tagged "Vivir Lo Nuestro" as Mujer using half the credit
    expect(namesMatch('Marc Anthony & La India', 'India')).toBe(false)
  })

  it('accepts the same name written differently', () => {
    expect(namesMatch('Beatles, The', 'The Beatles')).toBe(true)
    expect(namesMatch('Sebastián Yatra', 'Sebastian Yatra')).toBe(true)
  })

  it('still rejects a different artist entirely', () => {
    expect(namesMatch('Queen', 'Queens of the Stone Age')).toBe(false)
  })
})

describe('toCategories with collaborations', () => {
  it('files a duet as Dúo instead of a gender', () => {
    const result = toCategories({
      tags: ['salsa'],
      isCollaboration: true,
      // gender that came from matching only one half of the credit
      artistType: 'Person',
      artistGender: 'female',
    })

    expect(result).toContainEqual({ name: 'Duet', type: 'voice' })
    expect(result).not.toContainEqual({ name: 'Female', type: 'voice' })
  })

  it('keeps the gender for a solo artist', () => {
    const result = toCategories({ tags: [], artistType: 'Person', artistGender: 'male' })
    expect(result).toContainEqual({ name: 'Male', type: 'voice' })
  })
})

describe('primaryArtist', () => {
  it('takes the lead performer out of a joint credit', () => {
    expect(primaryArtist('Marc Anthony & La India')).toBe('Marc Anthony')
    expect(primaryArtist('Carlos Vives & Sebastián Yatra')).toBe('Carlos Vives')
    expect(primaryArtist('Sebastián Yatra ft. Carlos Vives')).toBe('Sebastián Yatra')
  })

  it('leaves a solo credit untouched', () => {
    expect(primaryArtist('Marc Anthony')).toBe('Marc Anthony')
    expect(primaryArtist('Beatles, The')).toBe('Beatles, The')
  })
})
