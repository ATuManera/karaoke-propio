import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import i18n from 'lib/i18n'
import acquisition from 'routes/Library/modules/acquisition'
import type { AcquisitionRequest, AcquisitionSearchResult } from 'shared/types'
import AcquisitionModal from './AcquisitionModal'
import YouTubePreview from './YouTubePreview'

// class names, so the markup can say which div is the modal body and which
// list holds the results; the runner otherwise imports stylesheets as ''
vi.mock('components/Modal/Modal.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))
vi.mock('components/Spinner/Spinner.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))
vi.mock('./AcquisitionModal.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))
vi.mock('./YouTubePreview.css', () => ({ default: new Proxy({}, { get: (_, name) => String(name) }) }))
// the pitch question comes after this modal, in a modal of its own, and its
// slider reads window at import time — there is no window here
vi.mock('components/PitchModal/PitchModal', () => ({ default: (): null => null }))

/**
 * What an open acquisition modal has in it — asserted on the rendered markup,
 * not on the pieces one by one.
 *
 * On an iPad this modal opened as its title and an X and nothing else: the
 * body was in the markup and 0px tall (see Modal.test.tsx for the stylesheet
 * side). A test that renders the whole thing cannot measure a height either,
 * but it holds the other half: that every control is emitted, and emitted
 * inside the one div whose rule that fix is about. The two together say what
 * the screen should show; one without the other says less than it seems to.
 */
type AcquisitionState = ReturnType<typeof acquisition>

const initial = acquisition(undefined, { type: '@@INIT' })

const render = (state: Partial<AcquisitionState> = {}, props: Partial<React.ComponentProps<typeof AcquisitionModal>> = {}) => {
  const store = configureStore({
    reducer: { acquisition },
    preloadedState: { acquisition: { ...initial, ...state } },
  })

  return renderToStaticMarkup(
    <Provider store={store}>
      <AcquisitionModal initialQuery='' onClose={() => {}} {...props} />
    </Provider>,
  )
}

const result = (id: string, title: string): AcquisitionSearchResult => ({
  id, title, uploader: 'Sing King', thumbnail: null, durationSeconds: 212, viewCount: 4_200_000, isVerified: true,
})

// a download that failed, as the server reports it back over the socket
const failedRequest: AcquisitionRequest = {
  requestId: 'r7', roomId: 1, userId: 2, pitchSemitones: 0, source: 'youtube', query: 'la bikina',
  result: result('a1', 'La Bikina (Karaoke Version)'), state: 'error', error: 'HTTP Error 403', dateCreated: 1_756_900_000_000,
}

// what the body has to hold for the search to be usable at all
const expectSearchControls = (html: string) => {
  expect(html).toContain('<h1>Search for a song</h1>')
  expect(html).toContain('role="tab"')
  expect(html).toContain('>YouTube</button>')
  expect(html).toContain('>UltraStar (USDB)</button>')
  expect(html).toContain('type="search"')
  expect(html).toContain('placeholder="Artist, song title or playlist link"')
  expect(html).toMatch(/type="submit"[^>]*>Search<\/button>/)
  expect(html).toContain('type="checkbox"')
  expect(html).toContain('Karaoke versions only')
  expect(html).toContain('<ul class="results">')
}

// and that all of it sits in the modal body, between the title bar and the
// end of the dialog — a heading with an X after it is exactly the iPad symptom
const expectInsideTheBody = (html: string) => {
  const body = html.indexOf('<div class="content scrollable">')
  const end = html.lastIndexOf('</dialog>')

  expect(body, 'the modal body is the scrollable variant').toBeGreaterThan(-1)
  expect(html.indexOf('<h1>')).toBeLessThan(body)
  for (const control of ['role="tab"', 'type="search"', 'type="submit"', 'type="checkbox"', '<ul class="results">']) {
    const at = html.indexOf(control)
    expect(at, `${control} is inside the body`).toBeGreaterThan(body)
    expect(at).toBeLessThan(end)
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

describe('an open acquisition modal', () => {
  it('has everything to search with before anything has been searched', () => {
    const html = render()

    expectSearchControls(html)
    expectInsideTheBody(html)
    expect(html).toContain('No results yet')
    expect(html).toContain('Have a playlist?')
  })

  it('keeps the controls while a search is running', () => {
    const html = render({ isSearching: true, pendingQuery: 'la bikina', pendingSource: 'youtube' })

    expectSearchControls(html)
    expectInsideTheBody(html)
    expect(html).toContain('class="spinner"')
    expect(html).not.toContain('No results yet')
  })

  it('keeps the controls when a search has failed, and says what went wrong', () => {
    const html = render({ searchError: 'USDB is not configured on this server' })

    expectSearchControls(html)
    expectInsideTheBody(html)
    expect(html).toContain('class="status danger">USDB is not configured on this server<')
    expect(html).not.toContain('No results yet')
  })

  it('lists the results under the controls', () => {
    const html = render({
      results: [result('a1', 'La Bikina (Karaoke Version)'), result('b2', 'La Bikina - Luis Miguel [Karaoke]')],
      resultsQuery: 'la bikina',
      resultsSource: 'youtube',
    })

    expectSearchControls(html)
    expectInsideTheBody(html)
    expect(html).toContain('La Bikina (Karaoke Version)')
    expect(html).toContain('La Bikina - Luis Miguel [Karaoke]')
    expect(html).toContain('4.2M')
    expect(html).toContain('3:32')
    expect(html.indexOf('La Bikina (Karaoke Version)')).toBeGreaterThan(html.indexOf('<ul class="results">'))
  })

  it('shows the outcome of an add that failed, without losing the search', () => {
    const html = render({
      results: [result('a1', 'La Bikina (Karaoke Version)')],
      activeRequest: failedRequest,
    })

    expectSearchControls(html)
    expect(html).toContain('Error: HTTP Error 403')
    expect(html).toContain('La Bikina (Karaoke Version)')
  })

  // the same box and the same body, worn as the playlist list
  it('opens on a failed playlist import with the field still there', () => {
    const html = render({ playlistError: 'That playlist is private' }, { initialView: 'playlist' })

    expect(html).toContain('<div class="content scrollable">')
    expect(html).toContain('type="search"')
    expect(html).toContain('class="status danger">That playlist is private<')
    // the source tabs and the karaoke filter are a search's, not a playlist's
    expect(html).not.toContain('role="tab"')
    expect(html).not.toContain('type="checkbox"')
  })
})

/**
 * The preview is reached by picking a result, which is a click, and there is
 * no DOM here to click in. Its failed state is rendered on its own instead —
 * the same child the modal puts in the same body.
 */
describe('a preview that failed', () => {
  // YouTubePreview reads document.baseURI to build the stream URL
  beforeAll(() => vi.stubGlobal('document', { baseURI: 'http://karaoke.test/' }))
  afterAll(() => vi.unstubAllGlobals())

  it('says so, in place of the player', () => {
    const html = renderToStaticMarkup(
      <YouTubePreview source='youtube' resultId='a1' videoId={null} isLoading={false} error='Could not fetch a playable preview: 403' />,
    )

    expect(html).toContain('class="error">Could not fetch a playable preview: 403<')
    expect(html).not.toContain('<video')
  })

  it('shows the player when it did not', () => {
    const html = renderToStaticMarkup(
      <YouTubePreview source='youtube' resultId='a1' videoId='a1' isLoading={false} error={null} />,
    )

    expect(html).toContain('<video')
    expect(html).toContain('api/acquisition/preview-stream?source=youtube&amp;resultId=a1')
  })
})
