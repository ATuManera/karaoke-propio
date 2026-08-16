import { describe, expect, it } from 'vitest'
import { cacheKey, getCachePaths } from './pitchCache.js'

describe('cacheKey', () => {
  it('is deterministic for the same inputs', () => {
    expect(cacheKey(42, 'abc123def456', 3)).toBe(cacheKey(42, 'abc123def456', 3))
  })

  it('differs when the pitch differs', () => {
    expect(cacheKey(42, 'abc123def456', 3)).not.toBe(cacheKey(42, 'abc123def456', -3))
  })

  it('differs when the fingerprint differs (media replaced, same mediaId)', () => {
    // this is the whole reason the cache key isn't just (mediaId, pitch):
    // a replaced file must never reuse a stale cached variant
    expect(cacheKey(42, 'aaaaaaaaaaaaaaaa', 3)).not.toBe(cacheKey(42, 'bbbbbbbbbbbbbbbb', 3))
  })

  it('differs when the mediaId differs', () => {
    expect(cacheKey(1, 'abc123def456', 3)).not.toBe(cacheKey(2, 'abc123def456', 3))
  })

  it('distinguishes +N from -N (not just absolute value)', () => {
    const plus = cacheKey(42, 'abc123def456', 5)
    const minus = cacheKey(42, 'abc123def456', -5)
    expect(plus).not.toBe(minus)
  })
})

describe('getCachePaths', () => {
  it('produces a tmpPath distinct from outputPath, both inside cacheDir', () => {
    const { outputPath, tmpPath } = getCachePaths('/data/pitch-cache', 42, 'abc123def456', 3, 'm4a')
    expect(outputPath).not.toBe(tmpPath)
    expect(outputPath.startsWith('/data/pitch-cache')).toBe(true)
    expect(tmpPath.startsWith('/data/pitch-cache')).toBe(true)
    expect(outputPath.endsWith('.m4a')).toBe(true)
    expect(tmpPath.endsWith('.m4a')).toBe(true)
  })

  it('generates a fresh tmpPath on every call (safe for concurrent starts)', () => {
    const a = getCachePaths('/data/pitch-cache', 42, 'abc123def456', 3, 'm4a')
    const b = getCachePaths('/data/pitch-cache', 42, 'abc123def456', 3, 'm4a')
    expect(a.outputPath).toBe(b.outputPath) // same final destination
    expect(a.tmpPath).not.toBe(b.tmpPath) // but never share a tmp file
  })
})
