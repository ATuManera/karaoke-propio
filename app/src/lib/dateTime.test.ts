import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatTime } from './dateTime'

describe('formatDate', () => {
  it('reports the local calendar day, not the UTC one', () => {
    // 2026-08-16T04:57:06Z is still 2026-08-15 in Lima (UTC-5). Formatting the
    // UTC day here while formatTime() reports the local hour produced
    // "2026-08-16 11:57p": tomorrow's date on tonight's time.
    const d = new Date('2026-08-16T04:57:06.000Z')
    const localDay = String(d.getDate()).padStart(2, '0')

    expect(formatDate(d)).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${localDay}`)
  })

  it('agrees with formatTime about which day it is', () => {
    const d = new Date('2026-08-16T04:57:06.000Z')
    const [datePart] = formatDateTime(d).split(' ')

    expect(datePart).toBe(formatDate(d))
    expect(formatDateTime(d)).toBe(`${formatDate(d)} ${formatTime(d)}`)
  })

  it('pads month and day', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('formatTime', () => {
  it('formats 12-hour with a/p', () => {
    expect(formatTime(new Date(2026, 7, 16, 0, 5))).toBe('12:05a')
    expect(formatTime(new Date(2026, 7, 16, 13, 7))).toBe('1:07p')
    expect(formatTime(new Date(2026, 7, 16, 23, 57))).toBe('11:57p')
  })
})
