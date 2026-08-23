import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, it } from 'vitest'
import i18n from 'lib/i18n'
import UpNext from './UpNext'

/**
 * The one thing a type check cannot see: whether <Trans> actually renders.
 *
 * A sentence with markup inside it — "You’re up **now**" — is the shape most
 * likely to break silently, because a misnamed component key renders the raw
 * key or drops the emphasis and nothing errors. Every other <Trans> in the app
 * uses this same `components={{ b: … }}` shape, so covering one covers them.
 */
const render = (props: Parameters<typeof UpNext>[0]) => renderToStaticMarkup(<UpNext {...props} />)

afterAll(async () => {
  await i18n.changeLanguage('en')
})

describe('a sentence with emphasis inside it', () => {
  it('renders the tag, not the markup, in English', async () => {
    await i18n.changeLanguage('en')
    const html = render({ isUpNow: true, isUpNext: false })

    expect(html).toContain('<strong>now</strong>')
    expect(html).not.toContain('&lt;b&gt;')
    expect(html).not.toContain('header.upNow')
  })

  it('lets the translation choose which word carries the emphasis', async () => {
    await i18n.changeLanguage('es')
    const html = render({ isUpNow: true, isUpNext: false })

    expect(html).toContain('<strong>ahora</strong>')
    expect(html).toContain('Te toca')
  })

  it('interpolates a value into a sentence that also has markup', async () => {
    await i18n.changeLanguage('es')
    const html = render({ isUpNow: false, isUpNext: true, wait: 150 })

    expect(html).toContain('<strong>siguiente</strong>')
    expect(html).toContain('3 min') // formatSeconds(150, true), in Spanish units
  })

  it('translates a plain sentence too', async () => {
    await i18n.changeLanguage('es')
    expect(render({ isUpNow: false, isUpNext: false, wait: 150 })).toContain('Te toca en 3 min')
  })
})
