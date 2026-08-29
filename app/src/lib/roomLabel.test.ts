import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import i18n from './i18n'
import type { Translate } from 'shared/i18n'
import { roomOptionLabel, roomStateLabel } from './roomLabel'

const t = ((key, values) => i18n.t(key, values)) as Translate

const room = (numUsers: number, status: 'open' | 'closed' = 'open') => ({
  name: 'Sala_Fernando',
  status,
  numUsers,
})

describe('what a room\'s line says', () => {
  it('counts an empty room as none, not as nothing', () => {
    expect(roomStateLabel(room(0), t)).toBe('0 people here')
  })

  it('counts one person in the singular', () => {
    expect(roomStateLabel(room(1), t)).toBe('1 person here')
  })

  it('counts a roomful in the plural', () => {
    expect(roomStateLabel(room(2), t)).toBe('2 people here')
    expect(roomStateLabel(room(11), t)).toBe('11 people here')
  })

  // an older server, or a room list fetched before the count existed
  it('reads a missing count as an empty room rather than as NaN', () => {
    expect(roomStateLabel({ status: 'open' } as never, t)).toBe('0 people here')
  })

  // a closed room's occupancy is not the thing being asked about it
  it('says a closed room is closed', () => {
    expect(roomStateLabel(room(3, 'closed'), t)).toBe('closed')
  })

  it('names the room first, so a picker reads as a list of rooms', () => {
    expect(roomOptionLabel(room(1), t)).toBe('Sala_Fernando — 1 person here')
  })
})

describe('in Spanish', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('es')
  })

  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('agrees in number, both ways', () => {
    expect(roomStateLabel(room(0), t)).toBe('0 personas conectadas')
    expect(roomStateLabel(room(1), t)).toBe('1 persona conectada')
    expect(roomStateLabel(room(4), t)).toBe('4 personas conectadas')
  })

  it('leaves the room\'s own name alone', () => {
    expect(roomOptionLabel(room(2), t)).toBe('Sala_Fernando — 2 personas conectadas')
  })
})
