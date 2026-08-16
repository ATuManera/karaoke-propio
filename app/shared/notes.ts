/**
 * Musical note naming, shared by the UltraStar note reader and the key
 * detector so both label pitches the same way.
 */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Spanish names, since that is the audience these are shown to. */
export const NOTE_NAMES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const

/**
 * UltraStar stores pitch as semitones relative to C4 (pitch 0 = C4, the
 * convention UltraStar Deluxe and Vocaluxe both use), which maps onto MIDI by
 * adding 60.
 */
export function ultraStarPitchToMidi (pitch: number): number {
  return pitch + 60
}

export function midiToNoteName (midi: number, spanish = false): string {
  const names = spanish ? NOTE_NAMES_ES : NOTE_NAMES
  const index = ((Math.round(midi) % 12) + 12) % 12
  const octave = Math.floor(Math.round(midi) / 12) - 1

  return `${names[index]}${octave}`
}

export interface SongNote {
  /** seconds from the start of the media */
  timeSeconds: number
  durationSeconds: number
  /** MIDI note number */
  midi: number
  /** e.g. "D4" */
  name: string
  /** the syllable sung on this note */
  text: string
  /** golden/rap notes are scored differently in UltraStar; kept for display */
  isGolden: boolean
}

export interface NoteRange {
  lowest: SongNote | null
  highest: SongNote | null
}

/** The span a singer has to cover — the first thing anyone wants to know. */
export function getNoteRange (notes: SongNote[]): NoteRange {
  let lowest: SongNote | null = null
  let highest: SongNote | null = null

  for (const note of notes) {
    if (!lowest || note.midi < lowest.midi) lowest = note
    if (!highest || note.midi > highest.midi) highest = note
  }

  return { lowest, highest }
}
