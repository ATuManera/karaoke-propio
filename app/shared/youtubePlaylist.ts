/**
 * Recognising a YouTube playlist link and reducing it to the only part that
 * identifies it.
 *
 * Shared because both sides need the same answer for different reasons: the
 * client decides whether a pasted string is a playlist (and switches the
 * acquisition modal to import mode instead of running a text search), and the
 * server refuses to hand anything else to yt-dlp.
 */

// music.youtube.com is included deliberately: a playlist link copied from
// YouTube Music is the most likely thing to be pasted here, and it carries the
// same list id as the youtube.com one
const PLAYLIST_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
])

// list ids are opaque; the shapes in the wild are PL…, UU…, OLAK5uy_…, RD…
const PLAYLIST_ID_RE = /^[\w-]{2,64}$/

/**
 * Playlists YouTube keeps private to the signed-in account. They resolve for
 * nobody but their owner (and only with their cookies), so fetching one always
 * fails — better to say why than to relay yt-dlp's login error.
 */
const PRIVATE_PLAYLIST_IDS = new Set(['LM', 'LL', 'WL'])

export function parsePlaylistId (input: string): string | null {
  let url: URL

  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!PLAYLIST_HOSTS.has(url.hostname)) return null

  const list = url.searchParams.get('list')
  if (!list || !PLAYLIST_ID_RE.test(list)) return null

  return list
}

export function isPrivatePlaylistId (playlistId: string): boolean {
  return PRIVATE_PLAYLIST_IDS.has(playlistId)
}

/**
 * The canonical URL for a list id. Rebuilt rather than passed through, so a
 * pasted "watch?v=…&list=…&index=7&pp=…" reaches yt-dlp as the playlist it
 * names and nothing else.
 */
export function playlistUrl (playlistId: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}`
}
