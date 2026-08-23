/**
 * The set of keys that exist, as a type.
 *
 * i18next resolves keys at runtime and is happy to render "acount.title" on
 * screen when a key is misspelled. This turns that into a build error: every
 * t() in the app takes a MessageKey, and MessageKey is derived from the
 * English catalogue, so a typo or a key that was renamed stops
 * `npm run typecheck` rather than a party.
 */
import type { Messages } from './en.js'

/** every dotted path to a string leaf: 'account.form.username', … */
type LeafPaths<T> = {
  [K in keyof T & string]: T[K] extends object ? `${K}.${LeafPaths<T[K]>}` : K
}[keyof T & string]

/**
 * The plural suffixes i18next appends. A counted message is written as
 * `foo_one` / `foo_other` in the catalogue but asked for as `foo` with a
 * count, so both spellings have to be legal keys.
 */
type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

type WithoutPlural<K extends string> = K extends `${infer Base}_${PluralSuffix}` ? Base : never

export type MessageKey = LeafPaths<Messages> | WithoutPlural<LeafPaths<Messages>>

/**
 * What t() looks like once the keys are pinned down. Deliberately narrower
 * than i18next's own signature: a key, some values, a string back.
 */
export interface Translate {
  (key: MessageKey, values?: Record<string, unknown>): string
}
