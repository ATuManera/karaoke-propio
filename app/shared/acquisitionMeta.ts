/**
 * Turning a YouTube title into artist + title.
 *
 * There is no reliable automatic answer: yt-dlp's structured `artist`/`track`
 * fields are empty for karaoke uploads (verified 2026-08-14 across several
 * channels — they only exist on official YouTube Music content), and uploaders
 * use both orders. Real examples from this library:
 *
 *   "Billy Joel - Piano Man (Karaoke Version)"        -> artist on the LEFT
 *   "Here Comes The Sun - The Beatles (Acoustic ...)" -> artist on the RIGHT
 *
 * So this only produces a best guess that the user confirms or corrects before
 * the download starts. Getting it right at that moment matters more than it
 * looks: artist/title decide which artist a song files under, so a wrong guess
 * scatters one artist's songs across several bogus entries.
 */

// "(Karaoke Version)", "[KARAOKE]", "(Versión Karaoke)", "(Letra/Lyrics)"...
// Everything here is noise in a karaoke library, where every song is a karaoke
// track — keeping it would also stop two versions of one song from grouping.
const NOISE_RE = /\s*[([{][^)\]}]*(karaoke|instrumental|playback|pista|lyrics?|letra|sing[\s-]?along|backing\s?track|version|versión|cover|hd|hq|official|oficial)[^)\]}]*[)\]}]/gi

// trailing "| Karaoke Latino", "_ Karaoke Versión _ ..." style channel tails
const TRAILING_TAG_RE = /\s*[|_/]+\s*[^|_/]*(karaoke|instrumental|lyrics?|letra|playback)[^|_/]*$/gi

export function cleanSongText (text: string): string {
  let out = text
  let prev: string

  // repeat: titles often carry several tails ("... _ Karaoke Versión _ Karaoke Latino")
  do {
    prev = out
    out = out.replace(NOISE_RE, '').replace(TRAILING_TAG_RE, '')
  } while (out !== prev)

  return out.replace(/\s{2,}/g, ' ').replace(/[\s\-–—_|]+$/, '').trim()
}

export interface GuessedMeta {
  artist: string
  title: string
}

/**
 * Best-effort split of a YouTube title. Assumes "Artist - Title", which is the
 * more common convention; the UI must let the user swap them.
 */
export function guessArtistTitle (youtubeTitle: string): GuessedMeta {
  const cleaned = cleanSongText(youtubeTitle ?? '')

  // " - " (with spaces) is the separator uploaders actually use; a bare hyphen
  // is far more likely to be part of a name ("Jay-Z", "Blink-182")
  const idx = cleaned.indexOf(' - ')
  if (idx === -1) return { artist: '', title: cleaned }

  return {
    artist: cleanSongText(cleaned.slice(0, idx)),
    title: cleanSongText(cleaned.slice(idx + 3)),
  }
}
