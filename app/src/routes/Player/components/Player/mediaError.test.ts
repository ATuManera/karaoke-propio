import { describe, it, expect, vi, afterEach } from 'vitest'
import describeMediaError from './mediaError'

const SRC = 'https://karaoke.example/api/media/627?type=video&queueId=785'
const formatError = { code: 4, message: 'MEDIA_ELEMENT_ERROR: Format error' } as MediaError

const mockFetch = (res: Partial<Response>) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res as Response))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('describeMediaError', () => {
  it('reports what the server said instead of the element\'s guess', async () => {
    mockFetch({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'queueId does not belong to your room' })

    expect(await describeMediaError(SRC, formatError))
      .toBe('403: queueId does not belong to your room')
  })

  it('falls back to the status text when the server sends no message', async () => {
    mockFetch({ ok: false, status: 404, statusText: 'Not Found', text: async () => '  ' })

    expect(await describeMediaError(SRC, formatError)).toBe('404: Not Found')
  })

  it('keeps the element\'s message when the request itself succeeds', async () => {
    // a genuinely undecodable file: the server is happy to serve it
    mockFetch({ ok: true, status: 206, statusText: 'Partial Content', text: async () => '' })

    expect(await describeMediaError(SRC, formatError))
      .toBe('MEDIA_ELEMENT_ERROR: Format error (code 4)')
  })

  it('keeps the element\'s message when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))

    expect(await describeMediaError(SRC, formatError))
      .toBe('MEDIA_ELEMENT_ERROR: Format error (code 4)')
  })

  it('says something when the element has no error to report', async () => {
    expect(await describeMediaError('', null)).toBe('The media could not be played')
  })
})
