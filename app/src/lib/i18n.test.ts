import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDeviceLocale, getStoredLocale, resolveLocale, setStoredLocale } from './i18n'

/** just enough localStorage to answer the three calls this module makes */
function fakeStorage (initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v },
    removeItem: (k: string) => { delete data[k] },
    data,
  }
}

function withBrowser (languages: string[], storage = fakeStorage()) {
  vi.stubGlobal('window', { localStorage: storage })
  vi.stubGlobal('navigator', { languages, language: languages[0] })
  return storage
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getDeviceLocale', () => {
  it('takes the phone at its word', () => {
    withBrowser(['es-PE', 'es', 'en'])
    expect(getDeviceLocale()).toBe('es')
  })

  it('settles on English when the phone asks for nothing we speak', () => {
    withBrowser(['ja-JP'])
    expect(getDeviceLocale()).toBe('en')
  })
})

describe('resolveLocale', () => {
  it('lets the account override the phone — the whole point of setting one', () => {
    withBrowser(['en-US'])
    expect(resolveLocale('es')).toBe('es')
  })

  it('follows the phone when the account chose nothing', () => {
    withBrowser(['es-419'])
    expect(resolveLocale(null)).toBe('es')
  })

  // the sign-in and invite screens happen before any account exists
  it('remembers a choice made while signed out', () => {
    withBrowser(['en-US'], fakeStorage({ 'kp.locale': 'es' }))
    expect(resolveLocale(null)).toBe('es')
  })

  it('still lets an account outrank what this browser remembers', () => {
    withBrowser(['es-PE'], fakeStorage({ 'kp.locale': 'es' }))
    expect(resolveLocale('en')).toBe('en')
  })

  it('ignores a stored language this build no longer ships', () => {
    withBrowser(['es-PE'], fakeStorage({ 'kp.locale': 'de' }))
    expect(getStoredLocale()).toBeNull()
    expect(resolveLocale(null)).toBe('es')
  })
})

describe('setStoredLocale', () => {
  it('writes a choice and clears it again', () => {
    const storage = withBrowser(['en'])

    setStoredLocale('es')
    expect(storage.data['kp.locale']).toBe('es')

    setStoredLocale(null)
    expect('kp.locale' in storage.data).toBe(false)
  })

  it('survives a browser that refuses storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem () { throw new Error('denied') },
        setItem () { throw new Error('denied') },
        removeItem () { throw new Error('denied') },
      },
    })
    vi.stubGlobal('navigator', { languages: ['es'], language: 'es' })

    expect(() => setStoredLocale('es')).not.toThrow()
    expect(getStoredLocale()).toBeNull()
    expect(resolveLocale(null)).toBe('es')
  })
})
