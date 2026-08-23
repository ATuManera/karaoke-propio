import { describe, expect, it } from 'vitest'
import i18n from './i18n'
import { formatDate, formatDateTime, formatDuration, formatSeconds, formatTime } from './dateTime'

describe('formatDate', () => {
  it('reports the local calendar day, not the UTC one', () => {
    // 2026-08-16T04:57:06Z is still 2026-08-15 in Lima (UTC-5). Formatting the
    // UTC day here while formatTime() reports the local hour produced
    // "2026-08-16 11:57p": tomorrow's date on tonight's time.
    const d = new Date('2026-08-16T04:57:06.000Z')

    expect(formatDate(d)).toBe(new Intl.DateTimeFormat(i18n.language, {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d))
  })

  it('agrees with formatTime about which day it is', () => {
    const d = new Date('2026-08-16T04:57:06.000Z')

    expect(formatDateTime(d)).toBe(`${formatDate(d)} ${formatTime(d)}`)
  })
})

describe('formatTime', () => {
  it('writes the clock the way the reader\'s language writes it', async () => {
    const d = new Date(2026, 7, 16, 23, 57)

    await i18n.changeLanguage('en')
    expect(formatTime(d)).toMatch(/^11:57\s?PM$/i)

    // Spanish reads the same instant off a 24-hour clock
    await i18n.changeLanguage('es')
    expect(formatTime(d)).toMatch(/^23:57$/)

    await i18n.changeLanguage('en')
  })
})

describe('formatDuration', () => {
  it('is digits and a colon in every language', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(600)).toBe('10:00')
  })
})

describe('formatSeconds', () => {
  it('says the units in the reader\'s language', async () => {
    await i18n.changeLanguage('en')
    expect(formatSeconds(45)).toBe('45s')
    expect(formatSeconds(125)).toBe('2m 5s')
    expect(formatSeconds(125, true)).toBe('2m')

    await i18n.changeLanguage('es')
    expect(formatSeconds(45)).toBe('45 s')
    expect(formatSeconds(125)).toBe('2 min 5 s')
    expect(formatSeconds(125, true)).toBe('2 min')

    await i18n.changeLanguage('en')
  })
})
