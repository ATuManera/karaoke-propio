import { describe, expect, it } from 'vitest'
import { buildInviteUrl, isPrivateHost, resolveInviteBaseUrl } from './inviteUrl.js'

const at = (url: string) => {
  const u = new URL(url)
  return { protocol: u.protocol, host: u.host, hostname: u.hostname }
}

describe('isPrivateHost', () => {
  it('treats IP literals and LAN names as private', () => {
    expect(isPrivateHost('192.168.68.170')).toBe(true)
    expect(isPrivateHost('127.0.0.1')).toBe(true)
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('tv.local')).toBe(true)
    expect(isPrivateHost('karaoke')).toBe(true) // no dot: local resolver only
    expect(isPrivateHost('::1')).toBe(true)
  })

  it('treats real domain names as public', () => {
    expect(isPrivateHost('karaoke.smarthome.pe')).toBe(false)
    expect(isPrivateHost('karaoke.casainteligente.pe')).toBe(false)
  })
})

describe('resolveInviteBaseUrl', () => {
  const configured = 'https://karaoke.smarthome.pe'

  it('uses the domain the Player was opened at', () => {
    // the point of this: a server answering to several names should invite
    // people to the one in use, not a fixed favourite
    expect(resolveInviteBaseUrl(at('https://karaoke.casainteligente.pe/player'), configured))
      .toBe('https://karaoke.casainteligente.pe')
  })

  it('falls back to the configured URL when the Player is on a LAN address', () => {
    // the usual case: Player on a TV at 192.168.x.x, guests on mobile data
    expect(resolveInviteBaseUrl(at('http://192.168.68.170:8080/player'), configured))
      .toBe(configured)
  })

  it('keeps a non-standard port when the host is public', () => {
    expect(resolveInviteBaseUrl(at('https://karaoke.example.com:8443/player'), configured))
      .toBe('https://karaoke.example.com:8443')
  })

  it('uses the LAN address when nothing public is configured', () => {
    // still useful: guests on the same wifi can scan it
    expect(resolveInviteBaseUrl(at('http://192.168.68.170:8080/player'), ''))
      .toBe('http://192.168.68.170:8080')
  })

  it('ignores a trailing slash in the configured URL', () => {
    expect(resolveInviteBaseUrl(at('http://192.168.1.5:8080/player'), 'https://karaoke.example.com/'))
      .toBe('https://karaoke.example.com')
  })
})

describe('buildInviteUrl', () => {
  // the exact string that goes to the clipboard and to the share sheet
  it('carries the room code as ?room=', () => {
    expect(buildInviteUrl(at('https://karaoke.gallarday.net/'), null, 'TT98MR'))
      .toBe('https://karaoke.gallarday.net/?room=TT98MR')
  })

  it('invites people to the public address when the host is on the LAN', () => {
    expect(buildInviteUrl(at('http://192.168.68.170:8080/account'), 'https://karaoke.gallarday.net', 'TT98MR'))
      .toBe('https://karaoke.gallarday.net/?room=TT98MR')
  })

  // whatever the host was looking at when they pressed Copy stays out of it
  it('never carries the page it was built on', () => {
    expect(buildInviteUrl(at('https://karaoke.gallarday.net/library?search=flaca'), null, 'AB12CD'))
      .toBe('https://karaoke.gallarday.net/?room=AB12CD')
  })

  it('escapes a code rather than pasting it in raw', () => {
    expect(buildInviteUrl(at('https://karaoke.gallarday.net/'), null, 'A B&C'))
      .toBe('https://karaoke.gallarday.net/?room=A+B%26C')
  })
})
