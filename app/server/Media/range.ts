/**
 * Karaoke Propio — byte-range parsing for media responses.
 *
 * `koa-range` cannot do this job for a stream: it slices one by *reading and
 * discarding* every byte before the offset (`stream-slice`), so seeking to the
 * last minute of a 114 MB video reads the whole file off disk to throw most of
 * it away. That is invisible on an SSD and very visible on a VPS. The media
 * route therefore parses the header itself and hands the offsets to
 * `fs.createReadStream`, which seeks.
 */

export interface ByteRange {
  /** first byte to send */
  start: number
  /** last byte to send, inclusive — as `createReadStream` wants it */
  end: number
}

/**
 * `null`            -> no (or unusable) Range header; send the whole body, 200
 * `'unsatisfiable'` -> syntactically valid but outside the file; 416
 *
 * A syntactically invalid header is ignored rather than rejected, which is what
 * RFC 9110 §14.2 asks for. Only the first range of a multi-range request is
 * honoured (media players ask for one); the rest are ignored, and a single
 * range is a legal answer to that request.
 */
export function parseRangeHeader (header: string | undefined, size: number): ByteRange | null | 'unsatisfiable' {
  if (!header) return null

  const match = /^bytes=(.+)$/.exec(header.trim())
  if (!match) return null

  const [spec] = match[1].split(',')
  const parts = /^(\d*)-(\d*)$/.exec(spec.trim())
  if (!parts) return null

  const [, fromRaw, toRaw] = parts

  // suffix form: "bytes=-500" means the last 500 bytes
  if (fromRaw === '') {
    if (toRaw === '') return null // "bytes=-" is neither form

    const length = parseInt(toRaw, 10)
    if (length === 0 || size === 0) return 'unsatisfiable'

    return { start: Math.max(0, size - length), end: size - 1 }
  }

  const start = parseInt(fromRaw, 10)
  if (start >= size) return 'unsatisfiable'

  // an end past the last byte is clamped, not rejected: browsers routinely ask
  // for a fixed-size chunk that overruns the end of the file
  const end = toRaw === '' ? size - 1 : Math.min(parseInt(toRaw, 10), size - 1)
  if (end < start) return null

  return { start, end }
}
