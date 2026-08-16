import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as db from '../lib/Database.js'
import Media from './Media.js'
import Prefs from '../Prefs/Prefs.js'
import { registerMedia, publishAtomically, sanitizePathSegment } from './MediaRegistrar.js'

let tmpDir: string
let libraryPath: string
let pathId: number

// a real ~1s silent MP3 (generated via ffmpeg) so music-metadata can report
// an actual duration; synthetic/fake bytes aren't a real MP3 stream and
// music-metadata correctly refuses to guess a duration for them
const FIXTURE_MP3 = fileURLToPath(new URL('./__fixtures__/silence.mp3', import.meta.url))

describe('MediaRegistrar (integration, real SQLite + filesystem)', () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ke-registrar-test-'))
    libraryPath = path.join(tmpDir, 'library')
    fs.mkdirSync(libraryPath, { recursive: true })

    db.open({ file: path.join(tmpDir, 'database.sqlite3'), ro: false })
    pathId = Prefs.addPath(libraryPath)
  })

  afterEach(() => {
    db.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('registers a brand-new mp3+cdg pair as new artist + new song + new media', async () => {
    const file = path.join(libraryPath, 'Test Artist - Test Song.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, file)
    await fsPromises.writeFile(path.join(libraryPath, 'Test Artist - Test Song.cdg'), Buffer.alloc(96))

    const result = await registerMedia(file, pathId)

    expect(result.isNewMedia).toBe(true)
    expect(result.isNewSong).toBe(true)
    expect(result.isNewArtist).toBe(true)
    expect(Number.isInteger(result.mediaId)).toBe(true)
    expect(Number.isInteger(result.songId)).toBe(true)

    const media = Media.search({ mediaId: result.mediaId }).entities[result.mediaId]
    expect(media.sourceFingerprint).toBeTruthy()
    expect(media.relPath).toBe('Test Artist - Test Song.mp3')
  })

  it('re-registering the same unchanged file reports isNewMedia=false', async () => {
    const file = path.join(libraryPath, 'Artist Two - Song Two.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, file)
    await fsPromises.writeFile(path.join(libraryPath, 'Artist Two - Song Two.cdg'), Buffer.alloc(96))

    const first = await registerMedia(file, pathId)
    const second = await registerMedia(file, pathId)

    expect(second.isNewMedia).toBe(false)
    expect(second.mediaId).toBe(first.mediaId)
    expect(second.songId).toBe(first.songId)
  })

  it('a second song by an existing artist is a new song but NOT a new artist', async () => {
    const fileA = path.join(libraryPath, 'Same Artist - Song A.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, fileA)
    await fsPromises.writeFile(path.join(libraryPath, 'Same Artist - Song A.cdg'), Buffer.alloc(96))
    await registerMedia(fileA, pathId)

    const fileB = path.join(libraryPath, 'Same Artist - Song B.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, fileB)
    await fsPromises.writeFile(path.join(libraryPath, 'Same Artist - Song B.cdg'), Buffer.alloc(96))
    const result = await registerMedia(fileB, pathId)

    expect(result.isNewSong).toBe(true)
    expect(result.isNewArtist).toBe(false)
  })

  it('metadataOverride bypasses MetaParser entirely — regression for the video-id-leaking-into-title bug', async () => {
    // real bug found live 2026-08-13: a filename shaped like
    // "Artist - Title---videoId" has TWO same-length delimiter candidates
    // (" - " and "---"); MetaParser's tie-break picked the first one,
    // leaving "Title---videoId" as the parsed title (video id and all).
    // UltraStar acquisition already knows the real artist/title from
    // song.txt, so it must skip MetaParser via metadataOverride instead of
    // relying on the constructed filename to parse back out correctly.
    const file = path.join(libraryPath, 'Soda Stereo - De música ligera---T_FkEw27XJ0.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, file)
    await fsPromises.writeFile(path.join(libraryPath, 'Soda Stereo - De música ligera---T_FkEw27XJ0.cdg'), Buffer.alloc(96))

    const result = await registerMedia(file, pathId, { artist: 'Soda Stereo', title: 'De música ligera' })

    const song = db.db.get<{ title: string }>('SELECT title FROM songs WHERE songId = ?', [result.songId])
    expect(song.title).toBe('De música ligera')
    expect(song.title).not.toContain('FkEw27XJ0')

    const artist = db.db.get<{ name: string }>('SELECT name FROM artists WHERE artistId = ?', [result.artistId])
    expect(artist.name).toBe('Soda Stereo')
  })

  it('strips the ---sourceId suffix so it never reaches the user, even without metadataOverride', async () => {
    // the YouTube acquisition path publishes "<youtube title>---<videoId>.mp4"
    // and has no authoritative metadata to override with, so the suffix used to
    // surface in the library as "Soy Rebelde (Versión Karaoke)---5qZJ7FHVoak"
    const file = path.join(libraryPath, 'Jeanette - Soy Rebelde (Versión Karaoke)---5qZJ7FHVoak.mp3')
    await fsPromises.copyFile(FIXTURE_MP3, file)
    await fsPromises.writeFile(path.join(libraryPath, 'Jeanette - Soy Rebelde (Versión Karaoke)---5qZJ7FHVoak.cdg'), Buffer.alloc(96))

    const result = await registerMedia(file, pathId)

    const song = db.db.get<{ title: string }>('SELECT title FROM songs WHERE songId = ?', [result.songId])
    const artist = db.db.get<{ name: string }>('SELECT name FROM artists WHERE artistId = ?', [result.artistId])

    expect(song.title).not.toContain('5qZJ7FHVoak')
    expect(song.title).not.toContain('---')
    expect(artist.name).toBe('Jeanette')
  })

  it('refuses to register a file outside the configured library path (no traversal)', async () => {
    const outsideFile = path.join(tmpDir, 'outside.mp3')
    // containment is checked before any audio probing happens, so the
    // content here is irrelevant to this test
    await fsPromises.writeFile(outsideFile, 'not audio, and that is fine')

    await expect(registerMedia(outsideFile, pathId)).rejects.toThrow(/outside its library path/)
  })

  it('publishAtomically moves a staged file into the library and refuses traversal in destRelPath', async () => {
    const stagingDir = path.join(libraryPath, '_staging')
    fs.mkdirSync(stagingDir, { recursive: true })
    const staged = path.join(stagingDir, 'video.mp4')
    await fsPromises.writeFile(staged, 'fake-mp4-bytes')

    const dest = await publishAtomically(staged, pathId, 'Artist - Title---abc12345678.mp4')
    expect(fs.existsSync(dest)).toBe(true)
    expect(fs.existsSync(staged)).toBe(false) // rename, not copy

    const staged2 = path.join(stagingDir, 'video2.mp4')
    await fsPromises.writeFile(staged2, 'x')
    await expect(publishAtomically(staged2, pathId, '../../etc/evil.mp4')).rejects.toThrow(/outside/)
  })

  it('sanitizePathSegment strips filesystem-hostile characters and leading dots', () => {
    // sanitizePathSegment cleans up a single title/artist segment for display
    // in a filename; it is NOT the traversal defense (see the
    // publishAtomically test above for the actual containment check that a
    // multi-segment "../../etc/passwd"-style string is caught by)
    expect(sanitizePathSegment('Artist / Title : "Live"')).not.toMatch(/[/:"]/)
    expect(sanitizePathSegment('..hidden')).not.toMatch(/^\.+/)
    expect(sanitizePathSegment('   ')).toBe('untitled')
  })
})
