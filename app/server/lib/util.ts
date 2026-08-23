import path from 'path'
import crypto from 'crypto'

/**
 * Gets the normalized file extension, in lowercase and including the period.
 *
 * @param {string} filename The filename to extract the extension from.
 * @returns {string} The extension in lowercase with a period, or an empty string.
 */
export const getExt = filename => path.extname(filename).toLowerCase()

export const parsePathIds = (str) => {
  const nums = []

  // multiple ids?
  if (str && str.includes(',')) {
    const parts = str.split(',')

    for (const part of parts) {
      const n = parseInt(part.trim(), 10)
      if (!isNaN(n)) nums.push(n)
    }
  } else {
    // single id?
    const n = parseInt(str, 10)

    if (!isNaN(n)) nums.push(n)
  }

  if (nums.length) return nums

  return !!str
}

export const randomChars = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  let result = ''

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length]
  }

  return result
}

/**
 * Acquisition appends "---<sourceId>" to published filenames so two different
 * karaoke versions of the same song can coexist on disk (publishAtomically()
 * renames onto its destination, so without it the second download would
 * silently overwrite the first). It is a filesystem concern only and must be
 * stripped before a filename is parsed into artist/title, or users see titles
 * like "Soy Rebelde (Versión Karaoke)---5qZJ7FHVoak".
 *
 * Lives here rather than in MediaRegistrar because FileScanner runs in a child
 * process and must not pull in main-process-only modules.
 */
const SOURCE_ID_SUFFIX_RE = /---[\w-]{11}$/

export const withSourceIdSuffix = (base: string, sourceId: string): string => `${base}---${sourceId}`

export const stripSourceIdSuffix = (name: string): string => name.replace(SOURCE_ID_SUFFIX_RE, '').trimEnd()

/**
 * The source upload's id, read back out of a stored file's path.
 *
 * The only link a stored file keeps to where it came from, which makes it the
 * only identifier two separate installations can agree on: songId and mediaId
 * are local numbers. Null for anything scanned from disk or paired from
 * UltraStar, which never had one.
 */
export const sourceIdFromPath = (relPath: string): string | null =>
  /---([\w-]{11})\.[^.]+$/.exec(relPath ?? '')?.[1] ?? null
