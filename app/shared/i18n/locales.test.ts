import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCALE, LOCALES, matchLocale, parseAcceptLanguage } from './locales.js'
import { messages } from './index.js'
import type { Messages } from './en.js'

/** every key path in a catalogue, so two languages can be compared as sets */
function keyPaths (obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k
    return typeof v === 'object' && v !== null ? keyPaths(v, path) : [path]
  })
}

/** the {{placeholders}} a message expects, so a translation cannot drop one */
function placeholders (s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
}

function flatten (obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) Object.assign(out, flatten(v, path))
    else out[path] = String(v)
  }
  return out
}

describe('the message catalogues', () => {
  const reference = keyPaths(messages[DEFAULT_LOCALE]).sort()

  it('ships one for every language the picker offers', () => {
    for (const { code } of LOCALES) {
      expect(messages[code], `no catalogue for ${code}`).toBeDefined()
    }
  })

  // TypeScript already refuses a catalogue that is missing a key (es.ts is
  // declared as Messages). This catches the other direction — a key left
  // behind in a translation after English dropped it — and reports it by name
  // rather than as a type error two hundred lines long.
  it.each(LOCALES.filter(l => l.code !== DEFAULT_LOCALE))('gives $code exactly the English keys', ({ code }) => {
    expect(keyPaths(messages[code]).sort()).toEqual(reference)
  })

  it.each(LOCALES.filter(l => l.code !== DEFAULT_LOCALE))('keeps every placeholder in $code', ({ code }) => {
    const source = flatten(messages[DEFAULT_LOCALE])
    const target = flatten(messages[code])

    for (const [key, value] of Object.entries(source)) {
      expect(placeholders(target[key]), `${code}: ${key}`).toEqual(placeholders(value))
    }
  })

  it('leaves nothing empty', () => {
    for (const { code } of LOCALES) {
      for (const [key, value] of Object.entries(flatten(messages[code]))) {
        expect(value.trim(), `${code}: ${key}`).not.toBe('')
      }
    }
  })

  // a counted message needs both forms or i18next falls through to the key
  it('gives every counted message both plural forms', () => {
    const keys = new Set(keyPaths(messages[DEFAULT_LOCALE] as Messages))
    for (const key of keys) {
      if (key.endsWith('_one')) expect(keys.has(key.replace(/_one$/, '_other'))).toBe(true)
      if (key.endsWith('_other')) expect(keys.has(key.replace(/_other$/, '_one'))).toBe(true)
    }
  })
})

describe('matchLocale', () => {
  it('takes an exact match', () => {
    expect(matchLocale(['es'])).toBe('es')
  })

  it('falls back to the base language of a regional variant', () => {
    expect(matchLocale(['es-PE'])).toBe('es')
    expect(matchLocale(['es-419'])).toBe('es')
    expect(matchLocale(['EN-GB'])).toBe('en')
  })

  it('prefers a whole match further down the list over a base match at the top', () => {
    // fr is not shipped; the phone's second choice is what it can have
    expect(matchLocale(['fr-CA', 'es'])).toBe('es')
  })

  it('does not invent a language nobody asked for', () => {
    expect(matchLocale(['ja', 'ko'])).toBe(DEFAULT_LOCALE)
    expect(matchLocale([])).toBe(DEFAULT_LOCALE)
    expect(matchLocale(undefined)).toBe(DEFAULT_LOCALE)
  })
})

describe('parseAcceptLanguage', () => {
  it('orders by weight, most wanted first', () => {
    expect(parseAcceptLanguage('en;q=0.7,es-PE,es;q=0.9')).toEqual(['es-PE', 'es', 'en'])
  })

  it('drops the wildcard and anything explicitly refused', () => {
    expect(parseAcceptLanguage('*,de;q=0')).toEqual([])
  })

  it('survives a header that is missing or nonsense', () => {
    expect(parseAcceptLanguage(undefined)).toEqual([])
    expect(parseAcceptLanguage('')).toEqual([])
    expect(matchLocale(parseAcceptLanguage('es-PE,es;q=0.9,en;q=0.8'))).toBe('es')
  })
})
