import { describe, expect, it, vi } from 'vitest'
import { canCopy, canShare, copyToClipboard, shareOrCopy } from './share'

const invite = {
  title: 'Karaoke Propio',
  text: 'Come and sing with us',
  url: 'https://karaoke.gallarday.net/?room=TT98MR',
}

/** a browser with a share sheet, a clipboard, both, or neither */
const nav = ({ share, writeText }: { share?: unknown, writeText?: unknown }) => ({
  ...(share ? { share } : {}),
  ...(writeText ? { clipboard: { writeText } } : {}),
}) as Parameters<typeof shareOrCopy>[1]

const aborted = () => Object.assign(new Error('Share canceled'), { name: 'AbortError' })

describe('what this device can do', () => {
  it('sees a share sheet only where there is one', () => {
    expect(canShare(nav({ share: vi.fn() }))).toBe(true)
    expect(canShare(nav({ writeText: vi.fn() }))).toBe(false)
    expect(canShare(nav({}))).toBe(false)
  })

  // http, an insecure context: navigator.clipboard is simply absent
  it('sees a clipboard only where there is one', () => {
    expect(canCopy(nav({ writeText: vi.fn() }))).toBe(true)
    expect(canCopy(nav({}))).toBe(false)
  })
})

describe('copyToClipboard', () => {
  it('reports what actually reached the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(copyToClipboard(invite.url, nav({ writeText }))).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith(invite.url)
  })

  it('answers false rather than throwing when the write is refused', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'))

    await expect(copyToClipboard(invite.url, nav({ writeText }))).resolves.toBe(false)
  })

  it('answers false where there is no clipboard at all', async () => {
    await expect(copyToClipboard(invite.url, nav({}))).resolves.toBe(false)
  })
})

describe('shareOrCopy', () => {
  it('hands the invitation to the platform, whole', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()

    await expect(shareOrCopy(invite, nav({ share, writeText }))).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith(invite)
    // the point of the share sheet is that the link never touches the clipboard
    expect(writeText).not.toHaveBeenCalled()
  })

  // closing the share sheet is an answer, and copying anyway would be
  // overruling it
  it('does nothing further when the share sheet is dismissed', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn().mockRejectedValue(aborted())

    await expect(shareOrCopy(invite, nav({ share, writeText }))).resolves.toBe('dismissed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the clipboard when the share sheet will not open', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'))

    await expect(shareOrCopy(invite, nav({ share, writeText }))).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(invite.url)
  })

  it('copies where there is no Web Share API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(shareOrCopy(invite, nav({ writeText }))).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith(invite.url)
  })

  // the screen must still work: nothing is claimed, and no error is raised
  it('says so plainly when the browser can do neither', async () => {
    await expect(shareOrCopy(invite, nav({}))).resolves.toBe('unavailable')
  })
})
