import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'

/**
 * Cache key for a pitch variant.
 *
 * Deliberately NOT just (mediaId, pitch): mediaId identifies a library slot
 * that can be replaced with different bytes over time (rescan, re-download),
 * while sourceFingerprint identifies the actual audio content. Using both
 * means a stale cached variant is never served after the underlying file
 * changes, even if mediaId and dateUpdated stayed the same.
 */
export function cacheKey (mediaId: number, sourceFingerprint: string, pitchSemitones: number): string {
  const sign = pitchSemitones > 0 ? 'p' : pitchSemitones < 0 ? 'm' : 'z'
  return `${mediaId}-${sourceFingerprint.slice(0, 16)}-${sign}${Math.abs(pitchSemitones)}`
}

export interface CachePaths {
  key: string
  /** final, atomically-published path once the transcode succeeds */
  outputPath: string
  /** unique in-progress path; worker renames this to outputPath on success */
  tmpPath: string
}

/**
 * `outputExt` should match what the worker will encode (e.g. 'm4a' for CDG's
 * audio-only variants, 'mp4' for video variants).
 */
export function getCachePaths (cacheDir: string, mediaId: number, sourceFingerprint: string, pitchSemitones: number, outputExt: string): CachePaths {
  const key = cacheKey(mediaId, sourceFingerprint, pitchSemitones)
  return {
    key,
    outputPath: path.join(cacheDir, `${key}.${outputExt}`),
    tmpPath: path.join(cacheDir, `.tmp-${key}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.${outputExt}`),
  }
}

export async function cacheExists (outputPath: string): Promise<boolean> {
  try {
    await fsPromises.access(outputPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Directory used to extract audio out of .zip library entries so the (Alpine,
 * ffmpeg-less) main container and the pitch-worker container can both address
 * it by plain filesystem path. Extraction happens once per (mediaId,
 * fingerprint) and is reused by every subsequent pitch request.
 */
export function getExtractedAudioPath (cacheDir: string, mediaId: number, sourceFingerprint: string, ext: string): string {
  return path.join(cacheDir, '_extracted', `${mediaId}-${sourceFingerprint.slice(0, 16)}${ext}`)
}

export function ensureCacheDir (cacheDir: string): void {
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.mkdirSync(path.join(cacheDir, '_extracted'), { recursive: true })
}
