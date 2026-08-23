/**
 * The languages this installation speaks, and how a language gets chosen for
 * someone who has not said which they want.
 *
 * Adding a language is meant to be two edits and nothing else: a message file
 * beside en.ts, and an entry in LOCALES below. Everything that varies between
 * languages — plural forms, the shape of a date, which way the text runs — is
 * asked of Intl at runtime rather than written down here, so a translator
 * never has to touch code to add Japanese.
 */

export interface LocaleInfo {
  code: string
  /** what speakers of the language call it; what the picker must show */
  nativeName: string
  /** for logs, admin screens and anywhere the reader is known to read English */
  englishName: string
}

/**
 * Order matters only for the picker. English stays first as the fallback the
 * rest of the app is written against.
 */
export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
] as const

export const DEFAULT_LOCALE = 'en'

export const LOCALE_CODES: readonly string[] = LOCALES.map(l => l.code)

export function isSupportedLocale (code: unknown): code is string {
  return typeof code === 'string' && LOCALE_CODES.includes(code.toLowerCase())
}

export function getLocaleInfo (code: string): LocaleInfo | undefined {
  return LOCALES.find(l => l.code === code.toLowerCase())
}

/**
 * Pick the best supported language for a list of preferences, most-wanted
 * first — navigator.languages on the phone, or a parsed Accept-Language on
 * the server.
 *
 * Two passes, not one. A phone set to Peruvian Spanish asks for "es-PE" and a
 * Latin-American one for "es-419"; neither is a language we ship, and both
 * want Spanish. But looking for the base language too eagerly would hand
 * someone whose first choice is a regional variant we do have (say "pt-BR")
 * the wrong file merely because a later preference matched exactly. So every
 * candidate is tried whole first, and only then are they tried again by base
 * language.
 */
export function matchLocale (preferred: readonly string[] | undefined | null): string {
  if (!preferred?.length) return DEFAULT_LOCALE

  const candidates = preferred
    .map(tag => String(tag).trim().toLowerCase())
    .filter(Boolean)

  for (const tag of candidates) {
    if (LOCALE_CODES.includes(tag)) return tag
  }

  for (const tag of candidates) {
    const base = tag.split('-')[0]
    if (LOCALE_CODES.includes(base)) return base
  }

  return DEFAULT_LOCALE
}

/**
 * Read an Accept-Language header into the same most-wanted-first list
 * matchLocale expects. Weights are honoured; q=0 means "not this one".
 */
export function parseAcceptLanguage (header: string | undefined | null): string[] {
  if (!header) return []

  return header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params
        .map(p => p.trim())
        .find(p => p.startsWith('q='))

      return { tag: tag.trim(), q: q ? Number.parseFloat(q.slice(2)) : 1 }
    })
    .filter(({ tag, q }) => tag && tag !== '*' && Number.isFinite(q) && q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ tag }) => tag)
}
