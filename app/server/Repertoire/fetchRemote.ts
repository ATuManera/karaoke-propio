import dns from 'node:dns/promises'
import net from 'node:net'
import { MAX_BYTES } from '../../shared/repertoire.js'

/** a repertoire is kilobytes; anything larger is not one */
export const MAX_REDIRECTS = 3
const TIMEOUT_MS = 10_000

/**
 * Blocks of addresses that are never someone's public file host.
 *
 * This list is the whole point of the URL option. The field is filled in by
 * whoever is joining the party — a guest, before they have an account — and
 * the server is what fetches it. Without this, "paste a link to your
 * repertoire" is also "make the host's server open a connection to anything
 * on the host's LAN and tell me how it went": the router's admin page, the
 * other containers on karaoke-internal, a cloud instance's metadata endpoint
 * at 169.254.169.254. None of those are reachable from the guest's phone, and
 * all of them are reachable from here.
 */
const BLOCKED_V4 = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, includes 255.255.255.255
] as const

const toInt = (ip: string): number => ip.split('.')
  .reduce((acc, octet) => (acc * 256) + parseInt(octet, 10), 0)

/**
 * Whether an address is one a stranger's URL may point at.
 *
 * Exported because this is the part worth testing: everything else in this
 * file is a fetch.
 */
export function isPublicAddress (ip: string): boolean {
  const version = net.isIP(ip)

  if (version === 4) {
    const value = toInt(ip)

    return !BLOCKED_V4.some(([base, bits]) => {
      const mask = (-1 << (32 - bits)) >>> 0
      return (value & mask) === (toInt(base) & mask)
    })
  }

  if (version !== 6) return false

  const addr = ip.toLowerCase().split('%')[0] // strip any zone index

  // an IPv4 address wearing an IPv6 hat ("::ffff:127.0.0.1") is still that address
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(addr)
  if (mapped) return isPublicAddress(mapped[1])

  if (addr === '::1' || addr === '::') return false
  if (/^f[cd]/.test(addr)) return false // unique local
  if (/^fe[89ab]/.test(addr)) return false // link-local
  if (/^ff/.test(addr)) return false // multicast

  return true
}

/**
 * Read a repertoire file from a URL the singer pasted.
 *
 * Every hop is checked, not just the first: a public URL that answers with a
 * redirect to 127.0.0.1 is the standard way around a check done once. The
 * hostname is resolved here and every address it resolves to must be public —
 * a name can legitimately have several, and one of them being internal is
 * enough to refuse.
 *
 * A name that resolves to a public address here and an internal one a
 * millisecond later, when fetch resolves it again, would still get through.
 * Closing that would mean connecting to the address this function validated
 * and carrying the hostname separately, which TLS makes considerably more
 * work than it is worth for a home karaoke server; what remains is a
 * deliberate, bounded gap rather than an unexamined one.
 */
export async function fetchRepertoire (rawUrl: string): Promise<string> {
  let url: URL

  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('That is not a valid link')
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('A repertoire link must start with http:// or https://')
    }

    const host = url.hostname.replace(/^\[|\]$/g, '')
    let addresses: string[]

    if (net.isIP(host)) {
      addresses = [host]
    } else {
      try {
        addresses = (await dns.lookup(host, { all: true })).map(entry => entry.address)
      } catch {
        throw new Error(`Could not find ${url.hostname}`)
      }
    }

    if (!addresses.length || !addresses.every(isPublicAddress)) {
      throw new Error('That link points inside this network, so it will not be fetched')
    }

    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: 'application/json, text/plain' },
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) throw new Error('That link led nowhere')

      url = new URL(location, url)
      continue
    }

    if (!res.ok) {
      throw new Error(`That link answered ${res.status}`)
    }

    const declared = parseInt(res.headers.get('content-length') ?? '', 10)

    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new Error('That file is too large to be a repertoire')
    }

    // read with a ceiling rather than trusting content-length, which is a
    // claim the other end makes about itself
    const reader = res.body?.getReader()
    if (!reader) throw new Error('That link returned nothing')

    const chunks: Uint8Array[] = []
    let bytes = 0

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      bytes += value.length

      if (bytes > MAX_BYTES) {
        await reader.cancel()
        throw new Error('That file is too large to be a repertoire')
      }

      chunks.push(value)
    }

    return Buffer.concat(chunks).toString('utf8')
  }

  throw new Error('That link redirects too many times')
}
