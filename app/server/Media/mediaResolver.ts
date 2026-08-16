import crypto from 'crypto'
import fsPromises from 'node:fs/promises'
import { unzip } from 'unzipit'
import { parseBuffer } from 'music-metadata'
import getCdgName from '../lib/getCdgName.js'
import { getExt } from '../lib/util.js'
import fileTypes from './fileTypes.js'

/**
 * Karaoke Propio — single source of truth for "given a library file, which
 * bytes are the audio and which bytes are the CD+G?".
 *
 * Before this module the rule lived (duplicated) in both `Media/router.ts` and
 * `Scanner/FileScanner/FileScanner.ts`. Pitch shifting needs exactly the same
 * answer, so all three now share this implementation.
 */

export const audioExts = Object.keys(fileTypes).filter(ext => fileTypes[ext].mimeType.startsWith('audio/'))
export const searchExts = Object.keys(fileTypes).filter(ext => fileTypes[ext].scan !== false)

export interface MediaSource {
  /** `file` = read `path` directly; `zip` = read `entry` inside the archive at `path` */
  type: 'file' | 'zip'
  path: string
  entry?: string
  /** extension of the actual content (not of the container) */
  ext: string
  mimeType: string
}

export interface ResolvedMedia {
  mediaType: 'mp4' | 'cdg'
  /** the bytes a pitch transform must operate on */
  audio: MediaSource
  /** null for mp4 (graphics are baked into the video) */
  cdg: MediaSource | null
}

function makeSource (type: 'file' | 'zip', path: string, name: string, entry?: string): MediaSource {
  const ext = getExt(name)

  return {
    type,
    path,
    entry,
    ext,
    mimeType: fileTypes[ext]?.mimeType,
  }
}

/**
 * Resolve a library file to its audio and (optional) CD+G sources.
 *
 * ZIP rule (unchanged from upstream, now stated once): the first root-level
 * entry with a supported audio extension, plus the first root-level `.cdg`.
 */
export async function resolveMedia (file: string): Promise<ResolvedMedia> {
  const ext = getExt(file)

  if (ext === '.mp4') {
    return {
      mediaType: 'mp4',
      audio: makeSource('file', file, file),
      cdg: null,
    }
  }

  if (ext === '.zip') {
    const { entries } = await unzip(new Uint8Array(await fsPromises.readFile(file)))
    const names = Object.keys(entries)

    const audioName = names.find(f => !f.includes('/') && audioExts.includes(getExt(f)))
    if (!audioName) throw new Error(`no valid audio file ${JSON.stringify(audioExts)} found in archive`)

    const cdgName = names.find(f => !f.includes('/') && getExt(f) === '.cdg')
    if (!cdgName) throw new Error('no .cdg sidecar found in archive')

    return {
      mediaType: 'cdg',
      audio: makeSource('zip', file, audioName, audioName),
      cdg: makeSource('zip', file, cdgName, cdgName),
    }
  }

  // loose audio + .cdg sidecar
  if (!audioExts.includes(ext)) {
    throw new Error(`unsupported media extension: ${ext}`)
  }

  const cdgFile = getCdgName(file)
  if (!cdgFile) throw new Error('no .cdg sidecar found')

  return {
    mediaType: 'cdg',
    audio: makeSource('file', file, file),
    cdg: makeSource('file', cdgFile, cdgFile),
  }
}

/**
 * Read a source's bytes. For zip sources this re-opens the archive; callers
 * that need both resolution and bytes in one pass should use `loadAudio()`.
 */
export async function readSource (source: MediaSource): Promise<Buffer> {
  if (source.type === 'file') {
    return fsPromises.readFile(source.path)
  }

  const { entries } = await unzip(new Uint8Array(await fsPromises.readFile(source.path)))
  const entry = entries[source.entry]

  if (!entry) throw new Error(`entry not found in archive: ${source.entry}`)

  return Buffer.from(await entry.arrayBuffer())
}

/**
 * Resolve and read the audio bytes in a single pass (one archive read for zips).
 */
export async function loadAudio (file: string, buffer?: Buffer): Promise<{ resolved: ResolvedMedia, audioBuffer: Buffer }> {
  const ext = getExt(file)

  if (ext === '.zip') {
    const bytes = buffer ?? await fsPromises.readFile(file)
    const { entries } = await unzip(new Uint8Array(bytes))
    const names = Object.keys(entries)

    const audioName = names.find(f => !f.includes('/') && audioExts.includes(getExt(f)))
    if (!audioName) throw new Error(`no valid audio file ${JSON.stringify(audioExts)} found in archive`)

    const cdgName = names.find(f => !f.includes('/') && getExt(f) === '.cdg')
    if (!cdgName) throw new Error('no .cdg sidecar found in archive')

    return {
      resolved: {
        mediaType: 'cdg',
        audio: makeSource('zip', file, audioName, audioName),
        cdg: makeSource('zip', file, cdgName, cdgName),
      },
      audioBuffer: Buffer.from(await entries[audioName].arrayBuffer()),
    }
  }

  const resolved = await resolveMedia(file)

  return {
    resolved,
    audioBuffer: buffer ?? await fsPromises.readFile(file),
  }
}

/**
 * SHA-256 of the bytes that pitch shifting actually consumes.
 *
 * - mp4  -> the whole mp4
 * - mp3/m4a + cdg -> the audio file
 * - zip  -> the *extracted* audio, not the archive
 *
 * Media `dateUpdated` is not a substitute: it is the timestamp of a scan and
 * only changes when a scanner-detected field changes, so a replaced file can
 * keep both its mediaId and its dateUpdated.
 */
export function fingerprintBuffer (buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function computeSourceFingerprint (file: string): Promise<string> {
  const { audioBuffer } = await loadAudio(file)
  return fingerprintBuffer(audioBuffer)
}

export interface ProbedMedia {
  mediaType: 'mp4' | 'cdg'
  duration: number
  rgTrackGain: number | null
  rgTrackPeak: number | null
  sourceFingerprint: string
  meta: Awaited<ReturnType<typeof parseBuffer>>['common']
}

/**
 * Validate + probe a library file: resolves its sources, reads the audio once,
 * and derives duration, ReplayGain and the content fingerprint from that same
 * buffer (no second read).
 */
export async function probeMedia (file: string, buffer?: Buffer): Promise<ProbedMedia> {
  const { resolved, audioBuffer } = await loadAudio(file, buffer)

  const data = await parseBuffer(audioBuffer, resolved.audio.mimeType, {
    duration: true,
    skipCovers: true,
  })

  if (!data.format.duration) {
    throw new Error('could not determine duration')
  }

  return {
    mediaType: resolved.mediaType,
    duration: Math.round(data.format.duration),
    rgTrackGain: data.common.replaygain_track_gain ? data.common.replaygain_track_gain.dB : null,
    rgTrackPeak: data.common.replaygain_track_peak ? data.common.replaygain_track_peak.ratio : null,
    sourceFingerprint: fingerprintBuffer(audioBuffer),
    meta: data.common,
  }
}
