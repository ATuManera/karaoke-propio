import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import Panel from './Panel'

/**
 * A stylesheet test, which is unusual here, because the bug it guards was a
 * stylesheet bug.
 *
 * A collapsible Panel already did everything right in TypeScript — the toggle
 * flipped `isExpanded`, the button reported `aria-expanded`, the content got
 * the `hidden` attribute — and My Pitches stayed open anyway through all of
 * it. `hidden` is nothing but a user-agent `display: none`, and My Pitches
 * passes a `contentClassName` whose rule is `display: flex`; an author rule
 * outranks any user-agent one, so the content was never hidden.
 *
 * Nothing that renders the component can catch that. There is no DOM here,
 * and a jsdom render would not help either: jsdom applies no stylesheet, so
 * it would report the element as hidden while the browser showed eighteen
 * songs. What can be checked is the rule itself, and that it is written to
 * win — an attribute selector alongside the class, so it does not depend on
 * which of the two CSS chunks webpack happens to emit last.
 */
const css = fs.readFileSync(path.join(import.meta.dirname, 'Panel.css'), 'utf8')

describe('a collapsed panel', () => {
  it('is hidden by a rule of its own, not by the user agent alone', () => {
    const rule = /\.content\[hidden\]\s*\{([^}]*)\}/.exec(css)

    expect(rule, 'Panel.css must hide .content[hidden] itself').not.toBeNull()
    expect(rule![1].replace(/\s/g, '')).toContain('display:none')
  })

  it('still turns its chevron only when open', () => {
    expect(css).toContain('.container[data-expanded] .chevron')
  })
})

/**
 * The other half of the same fix: the markup a screen reader is handed.
 *
 * Rendered to static markup rather than into a DOM, the way UpNext is — there
 * is no jsdom here, and none is needed to read what the component emits.
 */
const render = (props: Partial<React.ComponentProps<typeof Panel>> = {}) => renderToStaticMarkup(
  <Panel collapsible title='My Pitches (18)' {...props}>
    <p>Flaca</p>
  </Panel>,
)

describe('a collapsible panel\'s markup', () => {
  it('marks the content hidden and says so on the control', () => {
    const html = render()

    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('hidden=""')
  })

  it('shows the content when it opens, and drops the hidden attribute', () => {
    const html = render({ initialExpanded: true })

    expect(html).toContain('aria-expanded="true"')
    expect(html).not.toContain('hidden=""')
    expect(html).toContain('Flaca')
  })

  // the count is the whole reason folding this panel is safe: closed, it is
  // still an answer
  it('keeps its title readable while closed', () => {
    expect(render()).toContain('My Pitches (18)')
  })

  it('points the control at the content it controls', () => {
    const html = render()
    const controls = /aria-controls="([^"]+)"/.exec(html)

    expect(controls).not.toBeNull()
    expect(html).toContain(`id="${controls![1]}"`)
  })

  // a panel that never asked to fold gains no button and no chevron
  it('leaves a plain panel exactly as it was', () => {
    const html = render({ collapsible: false })

    expect(html).not.toContain('aria-expanded')
    expect(html).not.toContain('hidden=""')
    expect(html).toContain('Flaca')
  })
})
