import crypto from 'crypto'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import { unzip } from 'unzipit'
import { parseBuffer, parseFile } from 'music-metadata'
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
type ArchiveEntries = Awaited<ReturnType<typeof unzip>>['entries']

/** Inflate an archive's directory. The whole zip must be in memory to be read at all. */
async function readArchive (file: string): Promise<ArchiveEntries> {
  const { entries } = await unzip(new Uint8Array(await fsPromises.readFile(file)))
  return entries
}

function resolveArchive (file: string, entries: ArchiveEntries): ResolvedMedia {
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
    return resolveArchive(file, await readArchive(file))
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
 * Read a source's bytes, re-opening the archive for zip sources unless the
 * caller already has its entries (`openMedia` does).
 */
export async function readSource (source: MediaSource, entries?: ArchiveEntries): Promise<Buffer> {
  if (source.type === 'file') {
    return fsPromises.readFile(source.path)
  }

  const archive = entries ?? await readArchive(source.path)
  const entry = archive[source.entry]

  if (!entry) throw new Error(`entry not found in archive: ${source.entry}`)

  return Buffer.from(await entry.arrayBuffer())
}

/**
 * Resolve a file and get a reader for any one of its sources, opening a zip
 * exactly once. Serving a zip used to inflate it twice — once to work out
 * which entries it holds, once to read the entry asked for.
 */
export async function openMedia (file: string): Promise<{
  resolved: ResolvedMedia
  read: (source: MediaSource) => Promise<Buffer>
}> {
  const entries = getExt(file) === '.zip' ? await readArchive(file) : undefined
  const resolved = entries ? resolveArchive(file, entries) : await resolveMedia(file)

  return {
    resolved,
    read: (source: MediaSource) => readSource(source, entries),
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

/**
 * The same hash, over a file that is never held in memory. Identical output to
 * `fingerprintBuffer(readFileSync(file))` — pitch cache entries keyed on an
 * existing fingerprint stay valid.
 */
export async function hashFile (file: string): Promise<string> {
  const hash = crypto.createHash('sha256')

  // the stream's default 64 KB chunk is deliberate: larger reads are no faster
  // off a real disk and leave several times more garbage behind, which is what
  // a container memory limit ends up sized against
  for await (const chunk of fs.createReadStream(file)) {
    hash.update(chunk)
  }

  return hash.digest('hex')
}

export async function computeSourceFingerprint (file: string): Promise<string> {
  const { resolved, read } = await openMedia(file)

  return resolved.audio.type === 'file'
    ? hashFile(resolved.audio.path)
    : fingerprintBuffer(await read(resolved.audio))
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
 * Validate + probe a library file: resolves its sources, then derives duration,
 * ReplayGain and the content fingerprint.
 *
 * Loose files (and mp4s) are parsed and hashed by *streaming*. Reading them
 * into a Buffer first, as this did, made the scanner's peak memory a function
 * of the largest file in the library — an unbounded number, since acquisition
 * writes new files into it — and that is what a memory limit would have to be
 * sized against. Only zip entries still pass through memory, and they must: an
 * archive has to be inflated to be read at all.
 */
export async function probeMedia (file: string): Promise<ProbedMedia> {
  const { resolved, read } = await openMedia(file)

  const parseOpts = { duration: true, skipCovers: true }
  const audioBuffer = resolved.audio.type === 'zip' ? await read(resolved.audio) : null

  const data = audioBuffer
    ? await parseBuffer(audioBuffer, resolved.audio.mimeType, parseOpts)
    : await parseFile(resolved.audio.path, parseOpts)

  if (!data.format.duration) {
    throw new Error('could not determine duration')
  }

  return {
    mediaType: resolved.mediaType,
    duration: Math.round(data.format.duration),
    rgTrackGain: data.common.replaygain_track_gain ? data.common.replaygain_track_gain.dB : null,
    rgTrackPeak: data.common.replaygain_track_peak ? data.common.replaygain_track_peak.ratio : null,
    sourceFingerprint: audioBuffer ? fingerprintBuffer(audioBuffer) : await hashFile(resolved.audio.path),
    meta: data.common,
  }
}
