import { describe, expect, it } from 'vitest'
import { isPrivatePlaylistId, parsePlaylistId, playlistUrl } from './youtubePlaylist.js'

describe('parsePlaylistId', () => {
  it('reads the list id out of the links people actually copy', () => {
    expect(parsePlaylistId('https://www.youtube.com/playlist?list=PLdyEnJmpMgy2')).toBe('PLdyEnJmpMgy2')
    // "share" from inside a playing video carries the video and the playlist
    expect(parsePlaylistId('https://www.youtube.com/watch?v=fJ9rUzIMcZQ&list=RDfJ9rUzIMcZQ&index=1'))
      .toBe('RDfJ9rUzIMcZQ')
    // YouTube Music is where a playlist worth importing usually lives
    expect(parsePlaylistId('https://music.youtube.com/playlist?list=OLAK5uy_abc123')).toBe('OLAK5uy_abc123')
    expect(parsePlaylistId('  https://m.youtube.com/playlist?list=PL123  ')).toBe('PL123')
  })

  it('rejects anything that is not a playlist on YouTube', () => {
    expect(parsePlaylistId('https://www.youtube.com/watch?v=fJ9rUzIMcZQ')).toBeNull()
    expect(parsePlaylistId('https://example.com/playlist?list=PL123')).toBeNull()
    expect(parsePlaylistId('bohemian rhapsody karaoke')).toBeNull()
    expect(parsePlaylistId('')).toBeNull()
    expect(parsePlaylistId('javascript:alert(1)?list=PL123')).toBeNull()
  })
})

describe('isPrivatePlaylistId', () => {
  it('knows the ones YouTube never serves to anyone else', () => {
    expect(isPrivatePlaylistId('LM')).toBe(true) // Liked songs
    expect(isPrivatePlaylistId('WL')).toBe(true) // Watch later
    expect(isPrivatePlaylistId('PL123')).toBe(false)
  })
})

describe('playlistUrl', () => {
  it('keeps only the list id, whatever else the pasted link carried', () => {
    const id = parsePlaylistId('https://www.youtube.com/watch?v=fJ9rUzIMcZQ&list=PL123&index=7&pp=xyz')
    expect(playlistUrl(id)).toBe('https://www.youtube.com/playlist?list=PL123')
  })
})
