/**
 * Everything both halves of the app need to know about languages.
 *
 * The catalogue lives in shared/ rather than in src/ because the server sends
 * the reader sentences too — a wrong room password, a repertoire link that
 * led nowhere — and there must be exactly one place those sentences are
 * written down. This directory compiles under both tsconfigs (the client's
 * bundler resolution and the server's node16), which is why the imports below
 * carry an explicit .js extension.
 */
import en, { type Messages } from './en.js'
import es from './es.js'

export type { Messages } from './en.js'
export type { MessageKey, Translate } from './keys.js'
export * from './locales.js'

/**
 * i18next's resource shape: one bundle per language, one namespace each. A new
 * language is one import and one line here.
 */
export const resources = {
  en: { translation: en },
  es: { translation: es },
} as const

export const messages: Record<string, Messages> = { en, es }
