import { beforeEach, describe, expect, it } from 'vitest'
import AcquisitionManager from './AcquisitionManager.js'
import type { PlaylistImportEntry } from '../../shared/types.js'

// The worker is the only thing fetchPlaylist() reaches for, and only after it
// has decided the link is a playlist at all — so a stand-in is enough to see
// both what gets rejected and what actually reaches yt-dlp.
interface FakeWorker {
  fetchPlaylist(url: string): Promise<{ title: string, total: number | null, entries: PlaylistImportEntry[] }>
}

let requestedUrl: string | null

beforeEach(() => {
  requestedUrl = null

  const manager = AcquisitionManager as unknown as { worker: FakeWorker }
  manager.worker = {
    fetchPlaylist: async (url: string) => {
      requestedUrl = url
      return {
        title: 'Fiesta',
        total: 240,
        entries: [{ id: 'fJ9rUzIMcZQ', title: 'Queen – Bohemian Rhapsody', uploader: 'Queen Official' }],
      }
    },
  }
})

describe('AcquisitionManager.fetchPlaylist', () => {
  it('reads the playlist a share link points at', async () => {
    const playlist = await AcquisitionManager.fetchPlaylist('https://www.youtube.com/playlist?list=PL123')

    expect(requestedUrl).toBe('https://www.youtube.com/playlist?list=PL123')
    expect(playlist.playlistId).toBe('PL123')
    expect(playlist.total).toBe(240)
    expect(playlist.entries).toHaveLength(1)
  })

  // whatever else the pasted link carried is not passed on: yt-dlp is handed a
  // playlist and nothing else to interpret
  it('asks for the playlist alone, not the video the link was copied from', async () => {
    await AcquisitionManager.fetchPlaylist('https://music.youtube.com/watch?v=fJ9rUzIMcZQ&list=PL123&index=7&pp=abc')

    expect(requestedUrl).toBe('https://www.youtube.com/playlist?list=PL123')
  })

  it('refuses anything that is not a YouTube playlist', async () => {
    await expect(AcquisitionManager.fetchPlaylist('https://example.com/playlist?list=PL123'))
      .rejects.toThrow(/YouTube playlist/)
    await expect(AcquisitionManager.fetchPlaylist('https://www.youtube.com/watch?v=fJ9rUzIMcZQ'))
      .rejects.toThrow(/YouTube playlist/)
    expect(requestedUrl).toBeNull()
  })

  // these resolve for nobody but their owner, so the failure is worth
  // explaining instead of relaying a login error from yt-dlp
  it('says why Liked songs and Watch later cannot be read', async () => {
    await expect(AcquisitionManager.fetchPlaylist('https://www.youtube.com/playlist?list=LM'))
      .rejects.toThrow(/public or unlisted/)
    await expect(AcquisitionManager.fetchPlaylist('https://www.youtube.com/playlist?list=WL'))
      .rejects.toThrow(/public or unlisted/)
    expect(requestedUrl).toBeNull()
  })
})
