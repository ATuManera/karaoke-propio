import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashFile, openMedia, probeMedia } from './mediaResolver.js'

/**
 * probeMedia and computeSourceFingerprint used to read whole media files into a
 * Buffer. They now stream. What must not change is the answer: a fingerprint
 * that shifted would invalidate every pitch cache entry in the library.
 */

const FIXTURE_MP3 = fileURLToPath(new URL('./__fixtures__/silence.mp3', import.meta.url))
const MP3 = fs.readFileSync(FIXTURE_MP3)
const CDG = crypto.randomBytes(96)

const sha256 = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex')

let tmpDir: string

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-resolver-test-'))
})

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

/** a minimal stored (uncompressed) zip, so the archive path has a fixture at all */
function writeZip (file: string, files: Array<{ name: string, data: Buffer }>): void {
  const locals: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)

    const local = Buffer.alloc(30 + nameBuf.length)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    nameBuf.copy(local, 30)

    const dir = Buffer.alloc(46 + nameBuf.length)
    dir.writeUInt32LE(0x02014b50, 0)
    dir.writeUInt16LE(20, 4) // version made by
    dir.writeUInt16LE(20, 6) // version needed
    dir.writeUInt32LE(crc, 16)
    dir.writeUInt32LE(data.length, 20)
    dir.writeUInt32LE(data.length, 24)
    dir.writeUInt16LE(nameBuf.length, 28)
    dir.writeUInt32LE(offset, 42)
    nameBuf.copy(dir, 46)

    locals.push(local, data)
    central.push(dir)
    offset += local.length + data.length
  }

  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)

  fs.writeFileSync(file, Buffer.concat([...locals, directory, end]))
}

function crc32 (buf: Buffer): number {
  let crc = 0xFFFFFFFF

  for (const byte of buf) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
  }

  return (crc ^ 0xFFFFFFFF) >>> 0
}

describe('hashFile', () => {
  it('gives the same digest as hashing the whole buffer', async () => {
    const file = path.join(tmpDir, 'hash-me.bin')
    const data = crypto.randomBytes(3 * 1024 * 1024) // larger than one read chunk
    fs.writeFileSync(file, data)

    expect(await hashFile(file)).toBe(sha256(data))
  })

  it('hashes an empty file without reading anything', async () => {
    const file = path.join(tmpDir, 'empty.bin')
    fs.writeFileSync(file, Buffer.alloc(0))

    expect(await hashFile(file)).toBe(sha256(Buffer.alloc(0)))
  })
})

describe('probeMedia on a loose audio + cdg pair', () => {
  it('fingerprints the audio file exactly as hashing its bytes would', async () => {
    const file = path.join(tmpDir, 'Artist - Loose.mp3')
    fs.writeFileSync(file, MP3)
    fs.writeFileSync(path.join(tmpDir, 'Artist - Loose.cdg'), CDG)

    const probed = await probeMedia(file)

    expect(probed.mediaType).toBe('cdg')
    expect(probed.duration).toBe(1)
    expect(probed.sourceFingerprint).toBe(sha256(MP3))
  })
})

describe('probeMedia on a zip', () => {
  it('fingerprints the extracted audio, not the archive', async () => {
    const file = path.join(tmpDir, 'Artist - Zipped.zip')
    writeZip(file, [{ name: 'song.mp3', data: MP3 }, { name: 'song.cdg', data: CDG }])

    const probed = await probeMedia(file)

    expect(probed.mediaType).toBe('cdg')
    expect(probed.duration).toBe(1)
    expect(probed.sourceFingerprint).toBe(sha256(MP3))
    expect(probed.sourceFingerprint).not.toBe(sha256(fs.readFileSync(file)))
  })
})

describe('openMedia', () => {
  it('reads a zip once and serves either entry from that one read', async () => {
    const file = path.join(tmpDir, 'Artist - Once.zip')
    writeZip(file, [{ name: 'song.mp3', data: MP3 }, { name: 'song.cdg', data: CDG }])

    const reads: string[] = []
    const realReadFile = fs.promises.readFile
    // @ts-expect-error patched for the duration of this test
    fs.promises.readFile = (p, ...rest) => {
      reads.push(String(p))
      return realReadFile(p, ...rest)
    }

    try {
      const { resolved, read } = await openMedia(file)

      expect(resolved.audio.entry).toBe('song.mp3')
      expect((await read(resolved.audio)).equals(MP3)).toBe(true)
      expect((await read(resolved.cdg!)).equals(CDG)).toBe(true)
      expect(reads.filter(p => p === file)).toHaveLength(1)
    } finally {
      fs.promises.readFile = realReadFile
    }
  })

  it('never opens a loose file just to resolve it', async () => {
    const file = path.join(tmpDir, 'Artist - Untouched.mp3')
    fs.writeFileSync(file, MP3)
    fs.writeFileSync(path.join(tmpDir, 'Artist - Untouched.cdg'), CDG)

    const reads: string[] = []
    const realReadFile = fs.promises.readFile
    // @ts-expect-error patched for the duration of this test
    fs.promises.readFile = (p, ...rest) => {
      reads.push(String(p))
      return realReadFile(p, ...rest)
    }

    try {
      const { resolved } = await openMedia(file)

      expect(resolved.audio.type).toBe('file')
      expect(reads).toHaveLength(0)
    } finally {
      fs.promises.readFile = realReadFile
    }
  })
})
