import { describe, expect, it } from 'vitest'
import { MessageError, getT, localeFor, t } from './i18n.js'

describe('localeFor', () => {
  it('answers in the language the account chose', () => {
    expect(localeFor({ user: { locale: 'es' }, request: { header: { 'accept-language': 'en-US' } } })).toBe('es')
  })

  it('asks the browser when the account never chose', () => {
    expect(localeFor({ user: { locale: null }, request: { header: { 'accept-language': 'es-PE,es;q=0.9,en;q=0.8' } } })).toBe('es')
  })

  it('falls back to English when nobody said anything', () => {
    expect(localeFor({})).toBe('en')
    expect(localeFor({ user: null, request: { header: {} } })).toBe('en')
  })

  // a tag saved before a language was dropped from the build must not pin
  // that person to English while their phone is asking for Spanish
  it('ignores a language this build no longer ships', () => {
    expect(localeFor({ user: { locale: 'fr' }, request: { header: { 'accept-language': 'es' } } })).toBe('es')
  })
})

describe('MessageError', () => {
  it('reads in English in the log and in the reader\'s language on screen', () => {
    const err = new MessageError(401, 'server.room.passwordIncorrect')

    expect(err.message).toBe('Incorrect room password')
    expect(err.translate({ user: { locale: 'es' } })).toBe('La contraseña de la sala no es correcta')
    expect(err.status).toBe(401)
  })

  it('carries its values through the translation', () => {
    const err = new MessageError(422, 'server.user.usernameLength', { min: 3, max: 128 })

    expect(err.translate({ user: { locale: 'es' } })).toContain('entre 3 y 128')
  })

  it('keeps what it says when the status is changed under it', () => {
    const err = new MessageError(422, 'server.user.credentialsIncorrect').withStatus(401)

    expect(err.status).toBe(401)
    expect(err.translate({ user: { locale: 'es' } })).toBe('El usuario/correo o la contraseña no son correctos')
  })
})

describe('t', () => {
  it('hands back a translator for whoever asked', () => {
    expect(t({ user: { locale: 'es' } })('common.done')).toBe('Listo')
    expect(getT('en')('common.done')).toBe('Done')
  })

  // an apostrophe in a room name reaching the reader as &#39; is the sort of
  // thing HTML escaping does to a message that never goes near markup
  it('does not escape what it interpolates', () => {
    expect(getT('en')('rooms.confirmRemove', { name: 'Fer\'s' })).toContain('Fer\'s')
  })
})
