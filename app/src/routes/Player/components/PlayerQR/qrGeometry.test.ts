import { describe, expect, it } from 'vitest'
import { getModuleCount, getQRGeometry } from './qrGeometry'

/**
 * The expected counts were taken from qrcode-generator — the encoder the
 * Player actually draws with — asked for the same strings at level M, so the
 * capacity table above is checked against the thing it is standing in for.
 */
describe('the module count', () => {
  it.each([
    ['http://192.168.1.50:8080/?room=TT98MR', 29],
    ['https://karaoke.example.net/?room=TT98MR', 29],
    ['https://karaoke.example.net/?roomId=1', 29],
    ['https://k.io/?room=TT98MR', 25],
    ['https://karaoke.example.net/?room=TT98MR&password=cGFzc3dvcmQxMjM=', 37],
    ['https://karaoke.example.net/some/sub/path/?room=TT98MR&password=bXlsb25nZXJwYXNzd29yZA==', 41],
  ])('is the encoder\'s own for %s', (url, expected) => {
    expect(getModuleCount(url)).toBe(expected)
  })

  it('does not run off the end of the table', () => {
    expect(getModuleCount(`https://karaoke.example.net/?room=${'A'.repeat(500)}`)).toBe(57)
  })
})

describe('the geometry', () => {
  const url = 'https://karaoke.example.net/?room=TT98MR'

  it('draws every module the same whole number of pixels wide', () => {
    for (const height of [720, 900, 1080, 1440, 2160]) {
      const { size, quietZone } = getQRGeometry(height, 0.5, url)

      expect(size % getModuleCount(url)).toBe(0)
      expect(quietZone % (size / getModuleCount(url))).toBe(0)
    }
  })

  it('leaves the quiet zone the standard asks for', () => {
    const { size, quietZone } = getQRGeometry(1080, 0.5, url)

    expect(quietZone).toBe(4 * (size / getModuleCount(url)))
  })

  it('stays a corner of a 1080p television, not a card on it', () => {
    const { size, quietZone } = getQRGeometry(1080, 0.5, url)

    expect(size + 2 * quietZone).toBeLessThan(1080 * 0.15)
  })

  it('grows with the preference, and with the screen', () => {
    expect(getQRGeometry(1080, 1, url).size).toBeGreaterThan(getQRGeometry(1080, 0, url).size)
    expect(getQRGeometry(2160, 0.5, url).size).toBeGreaterThan(getQRGeometry(1080, 0.5, url).size)
  })

  it('keeps a scannable code in a small window, and with no preference stored', () => {
    expect(getQRGeometry(400, 0, url).size).toBeGreaterThanOrEqual(87)
    expect(getQRGeometry(1080, undefined, url).size).toBe(getQRGeometry(1080, 0.5, url).size)
  })
})
