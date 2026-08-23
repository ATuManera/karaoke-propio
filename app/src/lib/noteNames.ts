/**
 * Note names in the reader's language.
 *
 * The pitch worker reports notes the way most software does — letter names,
 * "C#", "A4". Half the world reads them sung instead ("Do#", "La4"), and
 * which half is a property of the language, so the twelve names live in the
 * message catalogue and this only does the lookup.
 *
 * Scientific pitch notation keeps its octave number, which is the same digit
 * everywhere.
 */
import i18n from './i18n'
import type { MessageKey } from 'shared/i18n'

const PITCH = /^([A-G][#b]?)(-?\d+)?$/

export function translateNoteName (name: string): string {
  const m = PITCH.exec(name.trim())
  if (!m) return name

  // flats are written as the sharp a semitone below, which is how the worker
  // reports them anyway; anything unrecognised is handed back untouched
  const translated = i18n.t(`music.noteNames.${m[1]}` as MessageKey, { defaultValue: m[1] })

  return translated + (m[2] ?? '')
}
