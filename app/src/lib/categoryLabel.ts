/**
 * How a category is written on screen.
 *
 * Genre, voice and language are closed vocabularies: the scanner maps every
 * tag it reads onto one of a fixed set of canonical names (see
 * server/Categories/categoryMap.ts), so those a Spanish reader should see in
 * Spanish. A decade is digits, and anything an admin typed by hand is theirs
 * — the app has no business rewriting it, so an unrecognised value falls
 * through and is shown exactly as stored.
 */
import i18n from './i18n'
import type { MessageKey } from 'shared/i18n'

const TRANSLATED = new Set(['genre', 'voice', 'language'])

export function categoryLabel (type: string, name: string): string {
  if (!TRANSLATED.has(type)) return name

  return i18n.t(`categories.values.${type}.${name}` as MessageKey, { defaultValue: name })
}
