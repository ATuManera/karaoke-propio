/**
 * Karaoke Propio — turn a media element's failure into something a host can act on.
 *
 * A <video> or <audio> element reports every unusable response identically:
 * "MEDIA_ELEMENT_ERROR: Format error (code 4)". That wording sends whoever is
 * running the party after the file, which is almost never where the problem
 * is — the server has usually refused the request outright and said why, and
 * the element threw that sentence away along with the status code. The one
 * that started this asked for the next song after somebody signed out in
 * another tab of the same browser and got back "queueId does not belong to
 * your room", which reached the screen as a song that wouldn't play.
 *
 * So ask the server the same question again and report its answer. Only ever
 * on the error path — a song that plays costs nothing extra — and asking for a
 * single byte, because the status line is the whole point. If the request
 * succeeds this time, the element's own complaint was the truthful one after
 * all (a genuinely undecodable file), so it stands.
 *
 * `error` is null whenever the element gave up before it had anything to say
 * (a teardown that clears `src`, most often), which is exactly when it has
 * nothing to add — hence `mediaErrorText`, which every caller also needs for
 * the rejection branch its linter insists on.
 */
export const mediaErrorText = (error: MediaError | null): string =>
  error ? `${error.message} (code ${error.code})` : 'The media could not be played'

export default async function describeMediaError (src: string, error: MediaError | null): Promise<string> {
  const fallback = mediaErrorText(error)

  if (!src) return fallback

  try {
    const res = await fetch(src, {
      credentials: 'same-origin',
      headers: { Range: 'bytes=0-0' },
    })

    if (res.ok) return fallback

    const body = (await res.text()).trim()
    return `${res.status}: ${body || res.statusText}`
  } catch {
    // offline, or the server is gone; the element's account is all there is
    return fallback
  }
}
