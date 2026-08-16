import type { ProbedMedia } from './mediaResolver.js'

export interface MediaFields {
  songId: number
  pathId: number
  relPath: string
  duration: number
  rgTrackGain: number | null
  rgTrackPeak: number | null
  sourceFingerprint: string
}

/**
 * Shared shape-building logic between FileScanner (full library scans, runs
 * in the scanner child process) and MediaRegistrar (point registration of a
 * single newly-acquired file, runs in the main process). Kept as a pure
 * function — callers decide HOW the resulting fields get persisted (via IPC
 * from the scanner, or directly from the main process).
 */
export function buildMediaFields (probed: ProbedMedia, songId: number, pathId: number, relPath: string): MediaFields {
  return {
    songId,
    pathId,
    relPath,
    duration: probed.duration,
    rgTrackGain: probed.rgTrackGain,
    rgTrackPeak: probed.rgTrackPeak,
    sourceFingerprint: probed.sourceFingerprint,
  }
}

/** normalize to forward slashes with no leading slash, relative to basePath */
export function toRelPath (file: string, basePath: string): string {
  return file.substring(basePath.length).replace(/\\/g, '/').replace(/^\//, '')
}

/**
 * Only the fields that actually changed vs. the existing DB row — same rule
 * FileScanner has always used, extracted so MediaRegistrar can reuse it.
 */
export function diffMediaFields (media: MediaFields, existingRow: Record<string, unknown>): Partial<MediaFields> {
  const diff: Partial<MediaFields> = {}

  for (const key of Object.keys(media) as (keyof MediaFields)[]) {
    if (media[key] !== existingRow[key]) {
      (diff as Record<string, unknown>)[key] = media[key]
    }
  }

  return diff
}
