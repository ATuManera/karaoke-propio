import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Modal from './Modal'

// the class names, so the markup can say which div is the body; the test runner
// otherwise imports every stylesheet as an empty string
vi.mock('./Modal.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))
vi.mock('components/Button/Button.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))

/**
 * A stylesheet test, like Panel's, and for the same reason: the bug was in the
 * stylesheet, and nothing that renders the component can see it.
 *
 * On an iPad the acquisition search opened as a title and an X and nothing
 * else — no source tabs, no field, no button, no results. Everything was in
 * the markup; the body was 0px tall. `.content` is `flex: 1`, which is
 * `flex: 1 1 0%`, and inside a dialog that has a max-height and no height
 * WebKit resolves that 0% against nothing. On the scrollable variant
 * `overflow: auto` also removes the automatic minimum height, so nothing is
 * left to hold the body open. Chromium sizes the same rules from the content
 * and never showed it.
 *
 * The fix is `flex-basis: auto` on the scrollable variant only, with
 * `min-height: 0` so it still gives way and scrolls once the dialog reaches
 * its max-height. The base rule is left alone: it has no overflow, and the
 * modals that use it were never affected.
 */
const css = fs.readFileSync(path.join(import.meta.dirname, 'Modal.css'), 'utf8')

// the declarations of one rule, whitespace removed, so `flex: 1 1 auto` and
// `flex:1 1 auto` read the same; the closing brace of the scrollable rule is
// the first one after its selector, since it nests nothing
const declarations = (selector: RegExp) => {
  const match = selector.exec(css)

  expect(match, `Modal.css must have a ${selector} rule`).not.toBeNull()
  return match![1].replace(/\s/g, '')
}

describe('the scrollable modal body', () => {
  const scrollable = () => declarations(/&\.scrollable\s*\{([^}]*)\}/)

  it('sizes from its content, not from a percentage of nothing', () => {
    expect(scrollable()).toContain('flex:11auto;')
  })

  it('can still shrink once the dialog reaches its max-height', () => {
    expect(scrollable()).toContain('min-height:0;')
  })

  it('still scrolls inside the dialog', () => {
    expect(scrollable()).toContain('overflow:auto;')
  })
})

describe('the plain modal body', () => {
  // the declarations directly on .content — up to the comment or the nested
  // rule, whichever comes first
  const base = () => declarations(/\.content\s*\{([^}/&]*)/)

  it('is left exactly as it was', () => {
    expect(base()).toBe('flex:1;')
  })

  it('does not scroll', () => {
    expect(base()).not.toContain('overflow')
  })
})

/**
 * The markup half: where the children land, and which classes the div they
 * land in carries. Rendered to static markup, as Panel and UpNext are.
 */
const render = (props: Partial<React.ComponentProps<typeof Modal>> = {}) => renderToStaticMarkup(
  <Modal title='Search for a song' onClose={() => {}} {...props}>
    <input type='search' />
  </Modal>,
)

describe('a modal\'s markup', () => {
  it('puts the children in the body, after the title bar', () => {
    const html = render()
    const title = html.indexOf('<h1>Search for a song</h1>')
    const body = html.indexOf('<div class="content">')
    const child = html.indexOf('<input type="search"')

    expect(title).toBeGreaterThan(-1)
    expect(body).toBeGreaterThan(title)
    expect(child).toBeGreaterThan(body)
  })

  it('marks the body scrollable only when asked', () => {
    expect(render({ scrollable: true })).toContain('<div class="content scrollable">')
    expect(render()).not.toContain('scrollable')
  })

  it('keeps the buttons outside the body, in a footer of their own', () => {
    const html = render({ scrollable: true, buttons: <button type='button'>Add to queue</button> })
    const child = html.indexOf('<input type="search"')
    const footer = html.indexOf('<div class="buttons">')

    expect(footer).toBeGreaterThan(child)
    expect(html.indexOf('Add to queue')).toBeGreaterThan(footer)
  })

  it('renders nothing while not visible', () => {
    expect(render({ visible: false })).toBe('')
  })
})
