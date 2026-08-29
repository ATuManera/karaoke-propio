import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n from './i18n'
import { categoryFromLabel, categoryLabel } from './categoryLabel'

// the closed vocabularies, as the app would hold them
const GENRES = ['Ballad', 'Pop', 'Peruvian Waltz', 'Classical', 'Sertanejo']
const VOICES = ['Male', 'Female', 'Duet', 'Group', 'Mixed']

describe('categoryLabel / categoryFromLabel', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('es')
  })

  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('writes a closed vocabulary in the reader\'s language', () => {
    expect(categoryLabel('genre', 'Ballad')).toBe('Balada')
    expect(categoryLabel('genre', 'Classical')).toBe('Clásica')
    expect(categoryLabel('voice', 'Mixed')).toBe('Mixto')
    expect(categoryLabel('language', 'English')).toBe('Inglés')
  })

  // a decade is digits, and a name an admin typed is theirs
  it('leaves a decade and anything unrecognised exactly as stored', () => {
    expect(categoryLabel('decade', '70\'s')).toBe('70\'s')
    expect(categoryLabel('genre', 'Chicha')).toBe('Chicha')
  })

  // the whole point: picking "Balada" must not open a second genre next to
  // the stored "Ballad" the shipped reference table is written in
  it('maps a translated label back to the name that is stored', () => {
    expect(categoryFromLabel('genre', 'Balada', GENRES)).toBe('Ballad')
    expect(categoryFromLabel('genre', 'Vals peruano', GENRES)).toBe('Peruvian Waltz')
    expect(categoryFromLabel('voice', 'Mixto', VOICES)).toBe('Mixed')
  })

  it('is not fussy about case or stray spaces', () => {
    expect(categoryFromLabel('genre', '  balada ', GENRES)).toBe('Ballad')
  })

  // inventing a category is allowed; duplicating one is what is not
  it('hands back anything the library has no answer for', () => {
    expect(categoryFromLabel('genre', 'Chicha', GENRES)).toBe('Chicha')
  })

  it('round-trips every name it is given', () => {
    for (const name of [...GENRES, ...VOICES]) {
      const type = GENRES.includes(name) ? 'genre' : 'voice'
      expect(categoryFromLabel(type, categoryLabel(type, name), [...GENRES, ...VOICES])).toBe(name)
    }
  })

  it('speaks English once the reader does', async () => {
    await i18n.changeLanguage('en')

    expect(categoryLabel('genre', 'Ballad')).toBe('Ballad')
    expect(categoryFromLabel('genre', 'Ballad', GENRES)).toBe('Ballad')
  })
})
