/**
 * Which base URL an invite QR should carry.
 *
 * Preferring the address the Player is already open at means a server reachable
 * under several names hands out invites for the one actually in use — open the
 * Player at karaoke.example.net and guests get karaoke.example.net, not
 * whichever name happens to be configured.
 *
 * The catch is that the Player usually runs on a TV opened at a LAN address,
 * and an invite pointing there is useless to a guest on mobile data. So a
 * private address is never used when a public one has been configured.
 */

const PRIVATE_HOST_SUFFIXES = ['.local', '.lan', '.internal', '.home', '.localdomain']

/** IPv4/IPv6 literals and LAN-only names — never worth putting in an invite. */
export function isPrivateHost (hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (PRIVATE_HOST_SUFFIXES.some(suffix => host.endsWith(suffix))) return true

  // any IP literal: a bare address is meaningless outside the network it's on
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true
  if (host.includes(':')) return true // IPv6

  // a name with no dot can only be resolved by a local resolver
  return !host.includes('.')
}

export function resolveInviteBaseUrl (
  current: { protocol: string, host: string, hostname: string },
  configuredPublicUrl?: string | null,
): string {
  const configured = (configuredPublicUrl ?? '').replace(/\/+$/, '')

  // Reached over a real name: use it, so the invite matches how this person
  // got here and stays on the same certificate.
  if (!isPrivateHost(current.hostname)) {
    return `${current.protocol}//${current.host}`
  }

  // On a LAN address, fall back to whatever public URL was configured; with
  // none, the LAN address is still better than nothing (it works for guests
  // on the same wifi).
  return configured || `${current.protocol}//${current.host}`
}

/**
 * The link a host hands out, complete.
 *
 * Always the room's random code and never its numeric id: ids are sequential,
 * so "?roomId=1" advertises that rooms 2, 3, 4… exist — harmless on a private
 * LAN, not once this answers from the internet. The whole string is what goes
 * to the clipboard and to the share sheet, so it is built in one place rather
 * than assembled twice at the two call sites.
 */
export function buildInviteUrl (
  current: { protocol: string, host: string, hostname: string },
  configuredPublicUrl: string | null | undefined,
  code: string,
): string {
  const url = new URL(resolveInviteBaseUrl(current, configuredPublicUrl))
  url.searchParams.set('room', code)

  return url.href
}
