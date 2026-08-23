/**
 * Choosing the language on the phone, and remembering the choice.
 *
 * Three sources, in this order:
 *
 *   1. the account, when it names a language — the point of setting it is
 *      that it follows you to a borrowed phone
 *   2. what this browser was last told, kept in localStorage — so the sign-in
 *      and invite screens, which happen before any account is known, are not
 *      stuck in the device's language when the singer already said otherwise
 *   3. the device itself, via navigator.languages
 *
 * Falling off the end lands on English, which is the only language guaranteed
 * to be complete.
 */
import i18n from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { DEFAULT_LOCALE, matchLocale, resources, type MessageKey, type Translate } from 'shared/i18n'

/** the browser's own preference list, most wanted first */
function deviceLocales (): string[] {
  if (typeof navigator === 'undefined') return []
  return [...(navigator.languages ?? []), navigator.language].filter(Boolean) as string[]
}

/** what the phone would pick if nobody had ever chosen */
export function getDeviceLocale (): string {
  return matchLocale(deviceLocales())
}

const STORAGE_KEY = 'kp.locale'

/**
 * Read straight from localStorage rather than from redux-persist. This is
 * wanted before the store has rehydrated — the first paint of the sign-in
 * screen — and a language that arrives one frame late is a visible flicker
 * from English to Spanish.
 */
export function getStoredLocale (): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored && matchLocale([stored]) === stored ? stored : null
  } catch {
    // private browsing, or storage denied; the device preference still works
    return null
  }
}

export function setStoredLocale (locale: string | null): void {
  try {
    if (locale) window.localStorage.setItem(STORAGE_KEY, locale)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // nothing to do: the choice lasts for this session only
  }
}

/** the language to speak right now, given what the account says (if anything) */
export function resolveLocale (accountLocale?: string | null): string {
  if (accountLocale && matchLocale([accountLocale]) === accountLocale) return accountLocale
  return getStoredLocale() ?? getDeviceLocale()
}

/**
 * Switch languages, and tell the page too: `lang` on <html> is what a screen
 * reader announces in and what the browser hyphenates and spell-checks by.
 */
export function applyLocale (locale: string): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale)
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

void i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveLocale(),
    fallbackLng: DEFAULT_LOCALE,
    // i18next prints an advert for its hosted service on init; the server's
    // log and the browser console are not the place for it
    showSupportNotice: false,
    interpolation: {
      // React escapes what it renders; doing it again turns an apostrophe
      // into &#39; on screen
      escapeValue: false,
    },
    returnNull: false,
  })

if (typeof document !== 'undefined') document.documentElement.lang = i18n.language

export default i18n

/**
 * The translator a component should reach for. Same thing useTranslation()
 * hands back, with the keys pinned to what the catalogue actually contains.
 */
export function useT (): Translate {
  return useTranslation().t as unknown as Translate
}

/** outside a component — an event handler on a module, a slider callback */
export const translate = ((key: MessageKey, values?: Record<string, unknown>) =>
  i18n.t(key, values)) as Translate

/**
 * Names a key without translating it, for the places that take one — <Trans
 * i18nKey>, mostly. Exists so those keys are checked like every other.
 *
 * Hands back a plain string on purpose: Trans is generic over its key, and
 * instantiating that generic with the whole MessageKey union is more than
 * TypeScript will represent. The check happens here, at the argument.
 */
export const msg = (key: MessageKey): string => key
