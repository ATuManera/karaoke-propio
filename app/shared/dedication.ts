/**
 * Karaoke Propio — dedications: the line a singer sends with their song, and
 * the messages an admin adds to anyone's, shown on the player while it plays.
 *
 * The rules live here rather than beside either half of the app because both
 * need exactly the same answer: the phone counts characters against them, and
 * the server applies them again as the authority, since a socket payload is
 * never trusted.
 *
 * A dedication is read off a television, from across a room, in the seconds a
 * carousel gives it. That is what every constraint below is for.
 */

/**
 * Long enough for a greeting with names in it, short enough to stay legible
 * in a single pass on a TV. Counted in code points rather than UTF-16 units,
 * so an emoji costs one character instead of two.
 */
export const DEDICATION_MAX_LENGTH = 160

/**
 * Controls, including the newlines a textarea will happily produce: a line
 * break in a one-line banner is a hole, not a paragraph. Replaced with a
 * space so the words on either side don't run together.
 *
 * Written as a constructed RegExp rather than a literal so the source file
 * stays free of the very characters it is filtering out.
 */
// eslint-disable-next-line no-control-regex
const CONTROLS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'gu')

/**
 * Characters that take up no width and change what the rest of the line does.
 * The bidi overrides and isolates can reverse everything after them, and on a
 * screen nobody can touch that would simply sit there for the whole song. The
 * zero-width space and non-joiner go too — they are how a length limit gets
 * padded past. U+200D (joiner) deliberately stays: it is what holds a
 * multi-person emoji together.
 */
const INVISIBLE = new RegExp('[\\u200B\\u200C\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'gu')

/**
 * The single definition of what a stored dedication looks like. Returns ''
 * for anything that amounts to no message at all, which callers read as
 * "remove it" rather than as an error.
 */
export function sanitizeDedication (text: unknown): string {
  if (typeof text !== 'string') return ''

  const cleaned = text
    .replace(CONTROLS, ' ')
    .replace(INVISIBLE, '')
    // whitespace of every kind collapses: the banner has one line to give
    .replace(/\s+/g, ' ')
    .trim()

  return [...cleaned].slice(0, DEDICATION_MAX_LENGTH).join('')
}

/** Length as the limit counts it, for the character counter on the phone. */
export function dedicationLength (text: string): number {
  return [...text].length
}

/**
 * Whether this room's player should show what is written on its songs.
 *
 * Absence is on, deliberately: the switch arrived after the feature did, so
 * every room already in the database has prefs with nothing to say about it,
 * and only an explicit `false` — an admin actually turning it off — may mean
 * off. Nothing is deleted when it is off; the messages come back the moment
 * it is turned on again.
 */
export function areDedicationsShown (prefs?: { dedications?: { isEnabled?: boolean } } | null): boolean {
  return prefs?.dedications?.isEnabled !== false
}
