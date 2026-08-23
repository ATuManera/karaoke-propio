/**
 * The server's side of speaking the reader's language.
 *
 * A request carries a person: their account may name a language, and their
 * browser always asks for one. Everything a router tells them — a wrong room
 * password, a repertoire link that led nowhere — is written through here so
 * it comes back in that language.
 *
 * What is NOT written through here: invariant failures ("invalid pathId",
 * "mediaId not found"). Those are notes to whoever reads the log when
 * something is broken, not instructions to a singer, and translating them
 * would only make a bug report harder to search for.
 */
import i18next from 'i18next'
import { DEFAULT_LOCALE, matchLocale, parseAcceptLanguage, resources, type MessageKey, type Translate } from '../../shared/i18n/index.js'

const instance = i18next.createInstance()

// resources are in memory, so init needs no I/O and no await — initImmediate
// false keeps it synchronous, which lets a router call t() on the very first
// request without a race
instance.init({
  resources,
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  initImmediate: false,
  // i18next prints an advert for its hosted service on init; the server's
  // log and the browser console are not the place for it
  showSupportNotice: false,
  interpolation: {
    // these strings go into an HTTP status message or a JSON body, never into
    // markup; escaping here would turn a room named "Fer's" into "Fer&#39;s"
    escapeValue: false,
  },
})

/**
 * What language to answer this request in.
 *
 * The account wins when it names one, because that is the whole point of
 * setting it: the same person gets the same language from a borrowed phone.
 * Otherwise the browser is asked, which is what someone who has never opened
 * the account screen — most guests at a party — will get.
 */
export function localeFor (ctx: {
  user?: { locale?: string | null } | null
  request?: { header?: Record<string, string | string[] | undefined> }
}): string {
  const chosen = ctx?.user?.locale

  if (chosen) {
    const matched = matchLocale([chosen])
    // a tag we no longer ship falls through to the browser rather than
    // silently pinning someone to English
    if (matched !== DEFAULT_LOCALE || chosen.toLowerCase().startsWith(DEFAULT_LOCALE)) return matched
  }

  const header = ctx?.request?.header?.['accept-language']
  return matchLocale(parseAcceptLanguage(Array.isArray(header) ? header[0] : header))
}

/** a translator fixed to one language, for a loop that reports many things */
export function getT (locale: string): Translate {
  return instance.getFixedT(locale) as unknown as Translate
}

/** the translator for whoever made this request */
export function t (ctx: Parameters<typeof localeFor>[0]): Translate {
  return getT(localeFor(ctx))
}

/**
 * A failure that knows what it wants to say, but not yet in which language.
 *
 * Some of what a reader is told is decided several layers below the request —
 * User.validate() has no ctx and no business acquiring one. Throwing this
 * instead of a finished sentence lets the layer that does know who is asking
 * (the error middleware) render it, while the Error's own message stays
 * English so a log line remains greppable.
 */
export class MessageError extends Error {
  readonly status: number
  readonly key: MessageKey
  readonly values?: Record<string, unknown>

  constructor (status: number, key: MessageKey, values?: Record<string, unknown>) {
    super(getT(DEFAULT_LOCALE)(key, values))
    this.name = 'MessageError'
    this.status = status
    this.key = key
    this.values = values
    // koa exposes 4xx messages to the client; this one is written for them
    Object.defineProperty(this, 'expose', { value: status < 500, enumerable: false })
  }

  /** the same failure, said to whoever is reading it */
  translate (ctx: Parameters<typeof localeFor>[0]): string {
    return t(ctx)(this.key, this.values)
  }

  /** the same words under a different HTTP status */
  withStatus (status: number): MessageError {
    return new MessageError(status, this.key, this.values)
  }
}

/**
 * Re-throw a failure under the status this route wants to report, without
 * flattening a MessageError into a finished English sentence on the way. Used
 * where a router deliberately reports everything from a block as one status —
 * sign-in answering 401 whatever went wrong, for instance.
 */
export function rethrowAs (status: number, err: unknown): never {
  if (err instanceof MessageError) throw err.withStatus(status)

  const wrapped = err instanceof Error ? err : new Error(String(err))
  Object.defineProperty(wrapped, 'status', { value: status, enumerable: false })
  Object.defineProperty(wrapped, 'expose', { value: status < 500, enumerable: false })
  throw wrapped
}

export default instance
