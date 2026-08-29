/**
 * Handing a link to somebody else — through the phone's own share sheet when
 * there is one, and through the clipboard when there is not.
 *
 * Both routes are here rather than in the component because neither is
 * available in a test run and both have failure modes that matter: a share
 * sheet the person dismissed is not an error, a share sheet that refuses to
 * open is, and the difference decides whether anything is said on screen.
 *
 * `navigator` is a parameter with a default rather than a global read, for the
 * same reason: it is the only way to exercise any of this without a browser.
 */

export interface ShareData {
  title: string
  text: string
  url: string
}

/**
 * What became of the attempt. Four answers, because the screen says something
 * different about each:
 *
 *   shared      — the platform took it; the share sheet appeared and was used
 *   dismissed   — the sheet opened and was closed; they changed their mind
 *   copied      — no sheet, or it would not open: the link went to the clipboard
 *   unavailable — neither route exists here, so nothing should be claimed
 */
export type ShareOutcome = 'shared' | 'dismissed' | 'copied' | 'unavailable'

interface ShareCapableNavigator {
  share?: (data: ShareData) => Promise<void>
  clipboard?: { writeText?: (text: string) => Promise<void> }
}

/** whether this device can put the system share sheet up at all */
export function canShare (nav: ShareCapableNavigator = navigator): boolean {
  return typeof nav?.share === 'function'
}

/** whether the clipboard is writable — it is not, over plain http */
export function canCopy (nav: ShareCapableNavigator = navigator): boolean {
  return typeof nav?.clipboard?.writeText === 'function'
}

export async function copyToClipboard (
  text: string,
  nav: ShareCapableNavigator = navigator,
): Promise<boolean> {
  if (!canCopy(nav)) return false

  try {
    await nav.clipboard!.writeText!(text)
    return true
  } catch {
    // a denied clipboard permission, or a page that lost focus mid-write
    return false
  }
}

/**
 * The share sheet, falling back to the clipboard.
 *
 * A dismissed sheet stops here: the person saw the list of apps and closed it,
 * and quietly copying the link behind their back would be answering a question
 * they just declined to answer. Anything else the platform throws — a browser
 * that has `share` but refuses over http, a payload it will not take — is a
 * failure of the route, not of the intent, so the link goes to the clipboard.
 */
export async function shareOrCopy (
  data: ShareData,
  nav: ShareCapableNavigator = navigator,
): Promise<ShareOutcome> {
  if (canShare(nav)) {
    try {
      await nav.share!(data)
      return 'shared'
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'dismissed'
      // fall through to the clipboard
    }
  }

  return (await copyToClipboard(data.url, nav)) ? 'copied' : 'unavailable'
}
