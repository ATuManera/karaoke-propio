/**
 * Karaoke Propio — UltraStar song.txt → .lrc converter.
 *
 * CDGSharp (see cdg-worker/) already has a validated, tested .lrc → .cdg
 * pipeline (prompt_de_implementacion.md #36/#52) — what's missing is turning
 * an UltraStar song.txt (the format USDB actually distributes) into the .lrc
 * shape CDGSharp's LrcParser expects. This module is original code: it does
 * not reuse UltraScrap CLI's TypeScript (which doesn't do this conversion —
 * UltraScrap only fetches song.txt, it never renders CDG) or CDGSharp's F#.
 *
 * UltraStar timing: real BPM = file's #BPM * 4 (a documented UltraStar
 * convention — the format historically doubled to allow finer note
 * resolution, and doubled again by many tools; verified against the
 * project's own reference fixture, see UltraStarToLrc.test.ts).
 * secondsPerBeat = 60 / (BPM * 4); a note's absolute time =
 * GAP_ms/1000 + beat * secondsPerBeat.
 */

import { midiToNoteName, ultraStarPitchToMidi, type SongNote } from '../../shared/notes.js'

export interface UltraStarSong {
  artist: string
  title: string
  bpm: number
  gapMs: number
  mp3?: string
  video?: string
}

interface UltraStarNote {
  startBeat: number
  lengthBeats: number
  /** semitones relative to C4; kept so the melody can be shown, not just sung */
  pitch: number
  /** '*' marks a golden note, scored higher in UltraStar */
  isGolden: boolean
  text: string
}

/** CDGSharp's LrcParser time format: [MM:SS:CC] where CC = centiseconds. */
function formatLrcTime (seconds: number): string {
  const totalCentiseconds = Math.max(0, Math.round(seconds * 100))
  const cs = totalCentiseconds % 100
  const totalSeconds = Math.floor(totalCentiseconds / 100)
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60)
  return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}]`
}

/** Escapes literal '[' and ']' in lyric text so they can't be mistaken for LRC timestamp markers. */
function sanitizeWordText (text: string): string {
  return text.replace(/[[\]]/g, '')
}

export function parseUltraStarHeaders (songTxt: string): UltraStarSong {
  const headers: Record<string, string> = {}

  for (const line of songTxt.split(/\r?\n/)) {
    const match = line.match(/^#([A-Za-z0-9]+):(.*)$/)
    if (match) headers[match[1].toUpperCase()] = match[2].trim()
  }

  const bpm = parseFloat(headers.BPM?.replace(',', '.'))
  const gapMs = parseFloat(headers.GAP?.replace(',', '.')) || 0

  if (!headers.ARTIST || !headers.TITLE) {
    throw new Error('UltraStar song.txt missing #ARTIST or #TITLE')
  }
  if (!Number.isFinite(bpm) || bpm <= 0) {
    throw new Error('UltraStar song.txt missing or invalid #BPM')
  }

  return {
    artist: headers.ARTIST,
    title: headers.TITLE,
    bpm,
    gapMs,
    mp3: headers.MP3,
    video: headers.VIDEO,
  }
}

/**
 * UltraStar note/line-break lines into a flat list of lines, each a list of
 * notes. Line breaks ('- beat') end the current line; freestyle/rap/golden
 * note types (F/R/G/*) are treated the same as normal (':') notes for
 * display purposes — this is about what's shown on screen, not scoring.
 */
function parseNoteLines (songTxt: string): UltraStarNote[][] {
  const lines: UltraStarNote[][] = []
  let current: UltraStarNote[] = []

  for (const raw of songTxt.split(/\r?\n/)) {
    // strip only a stray \r (already handled by the split above) — NOT
    // trailing spaces: UltraStar uses a trailing space on a note's text to
    // mean "word boundary before the next syllable" (no trailing space =
    // glue directly onto the next syllable, e.g. "lla" + "dur" + "mio " =
    // "lladurmio " reads as "lla dur mio "... the trailing space is the ONLY
    // signal for where word breaks go, so it must survive into the .lrc
    // word text unmutated)
    const line = raw.replace(/\r$/, '')
    if (!line.trim() || line.startsWith('#')) continue

    if (line === 'E' || line.startsWith('E ')) break

    if (line.startsWith('-')) {
      if (current.length) lines.push(current)
      current = []
      continue
    }

    const type = line[0]
    if (![':', '*', 'F', 'R', 'G'].includes(type)) continue

    // "<type> <startBeat> <lengthBeats> <pitch> <text...>" — text runs to
    // the end of the line, trailing space and all
    const match = line.match(/^\S\s+(-?\d+)\s+(-?\d+)\s+(-?\d+) (.*)$/)
    if (!match) continue

    const [, startBeatStr, lengthBeatsStr, pitchStr, text] = match
    current.push({
      startBeat: parseInt(startBeatStr, 10),
      lengthBeats: parseInt(lengthBeatsStr, 10),
      pitch: parseInt(pitchStr, 10),
      isGolden: type === '*',
      text,
    })
  }

  if (current.length) lines.push(current)
  return lines
}

/**
 * The melody as playable notes: absolute times plus note names.
 *
 * UltraStar counts in beats where one "beat" is a quarter of a BPM beat (hence
 * the *4 below, same factor ultraStarToLrc uses for its timestamps), and GAP is
 * the offset in milliseconds before the first one.
 */
export function ultraStarToNotes (songTxt: string): SongNote[] {
  const song = parseUltraStarHeaders(songTxt)
  const secondsPerBeat = 60 / (song.bpm * 4)
  const out: SongNote[] = []

  for (const line of parseNoteLines(songTxt)) {
    for (const note of line) {
      const midi = ultraStarPitchToMidi(note.pitch)

      out.push({
        timeSeconds: song.gapMs / 1000 + note.startBeat * secondsPerBeat,
        durationSeconds: note.lengthBeats * secondsPerBeat,
        midi,
        name: midiToNoteName(midi),
        text: note.text,
        isGolden: note.isGolden,
      })
    }
  }

  return out
}

export interface UltraStarToLrcOptions {
  /** how many UltraStar lines to group into one CD+G "page" (screen). Default 2. */
  linesPerPage?: number
}

/**
 * Convert full UltraStar song.txt content into CDGSharp-compatible .lrc text.
 */
export function ultraStarToLrc (songTxt: string, options: UltraStarToLrcOptions = {}): string {
  const linesPerPage = options.linesPerPage ?? 2
  const song = parseUltraStarHeaders(songTxt)
  const noteLines = parseNoteLines(songTxt)

  if (!noteLines.length) {
    throw new Error('UltraStar song.txt has no note lines')
  }

  const secondsPerBeat = 60 / (song.bpm * 4)
  const absoluteTime = (beat: number) => (song.gapMs / 1000) + beat * secondsPerBeat

  const lrcLines = noteLines.map(notes => notes.map((note) => {
    const start = formatLrcTime(absoluteTime(note.startBeat))
    const end = formatLrcTime(absoluteTime(note.startBeat + note.lengthBeats))
    return `${start}${sanitizeWordText(note.text)}${end}`
  }).join(''))

  const pages: string[] = []
  for (let i = 0; i < lrcLines.length; i += linesPerPage) {
    pages.push(lrcLines.slice(i, i + linesPerPage).join('\n'))
  }

  const metadata = `[ar:${sanitizeWordText(song.artist)}]\n[ti:${sanitizeWordText(song.title)}]`
  return `${metadata}\n\n${pages.join('\n\n')}\n`
}
