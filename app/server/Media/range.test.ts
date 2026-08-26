import { describe, expect, it } from 'vitest'
import { parseRangeHeader } from './range.js'

const SIZE = 1000

describe('parseRangeHeader', () => {
  it('sends the whole body when there is no Range header', () => {
    expect(parseRangeHeader(undefined, SIZE)).toBeNull()
  })

  it('reads an open-ended range as "to the last byte"', () => {
    expect(parseRangeHeader('bytes=0-', SIZE)).toEqual({ start: 0, end: 999 })
    expect(parseRangeHeader('bytes=500-', SIZE)).toEqual({ start: 500, end: 999 })
  })

  it('reads a closed range inclusively, as createReadStream wants it', () => {
    expect(parseRangeHeader('bytes=0-99', SIZE)).toEqual({ start: 0, end: 99 })
    expect(parseRangeHeader('bytes=999-999', SIZE)).toEqual({ start: 999, end: 999 })
  })

  it('clamps an end past the last byte instead of rejecting it', () => {
    // players routinely ask for a fixed-size chunk that overruns the end
    expect(parseRangeHeader('bytes=900-99999', SIZE)).toEqual({ start: 900, end: 999 })
  })

  it('reads the suffix form as "the last N bytes"', () => {
    expect(parseRangeHeader('bytes=-100', SIZE)).toEqual({ start: 900, end: 999 })
  })

  it('treats a suffix longer than the file as the whole file', () => {
    expect(parseRangeHeader('bytes=-99999', SIZE)).toEqual({ start: 0, end: 999 })
  })

  it('honours the first range of a multi-range request', () => {
    expect(parseRangeHeader('bytes=0-99,200-299', SIZE)).toEqual({ start: 0, end: 99 })
  })

  it('is unsatisfiable past the end of the file', () => {
    expect(parseRangeHeader('bytes=1000-', SIZE)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=-0', SIZE)).toBe('unsatisfiable')
    expect(parseRangeHeader('bytes=0-', 0)).toBe('unsatisfiable')
  })

  it('ignores a header it cannot parse rather than failing the request', () => {
    // RFC 9110 §14.2: an unrecognised range unit or malformed spec is ignored
    expect(parseRangeHeader('items=0-99', SIZE)).toBeNull()
    expect(parseRangeHeader('bytes=abc', SIZE)).toBeNull()
    expect(parseRangeHeader('bytes=-', SIZE)).toBeNull()
    expect(parseRangeHeader('bytes=500-100', SIZE)).toBeNull()
  })
})
