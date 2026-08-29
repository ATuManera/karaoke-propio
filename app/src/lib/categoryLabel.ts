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

/**
 * The stored name behind a label somebody picked off a suggestion list.
 *
 * The inverse of `categoryLabel`, and it has to exist: genre, voice and
 * language are a closed vocabulary shared with the reference table that ships
 * with the app, so a Spanish reader choosing "Balada" must land on the stored
 * "Ballad" rather than open a second genre beside it.
 *
 * Resolved by translating the names the library actually holds and comparing,
 * rather than by a reversed table — one direction can then never drift from
 * the other. A label nothing answers to is something the reader typed, and is
 * returned as they typed it: inventing a category is allowed, it is
 * duplicating one that is not.
 */
export function categoryFromLabel (type: string, label: string, storedNames: Iterable<string>): string {
  const wanted = label.trim().toLowerCase()

  for (const name of storedNames) {
    if (categoryLabel(type, name).toLowerCase() === wanted) return name
  }

  return label.trim()
}
