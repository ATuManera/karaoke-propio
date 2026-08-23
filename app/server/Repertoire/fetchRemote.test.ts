import { describe, expect, it } from 'vitest'
import { fetchRepertoire, isPublicAddress } from './fetchRemote.js'

describe('isPublicAddress', () => {
  it('accepts addresses out on the internet', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true)
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true)
  })

  it('refuses this machine', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false)
    expect(isPublicAddress('127.1.2.3')).toBe(false)
    expect(isPublicAddress('0.0.0.0')).toBe(false)
    expect(isPublicAddress('::1')).toBe(false)
  })

  it('refuses the LAN the server sits on', () => {
    expect(isPublicAddress('192.168.1.1')).toBe(false)
    expect(isPublicAddress('10.4.0.9')).toBe(false)
    expect(isPublicAddress('172.16.0.1')).toBe(false)
    expect(isPublicAddress('172.31.255.255')).toBe(false)
    // just outside the private block, and therefore fine
    expect(isPublicAddress('172.32.0.1')).toBe(true)
    expect(isPublicAddress('11.0.0.1')).toBe(true)
  })

  it('refuses the cloud metadata endpoint', () => {
    expect(isPublicAddress('169.254.169.254')).toBe(false)
  })

  it('sees through an IPv4 address written as IPv6', () => {
    expect(isPublicAddress('::ffff:127.0.0.1')).toBe(false)
    expect(isPublicAddress('::ffff:192.168.0.5')).toBe(false)
  })

  it('refuses IPv6 link-local and unique-local, zone index and all', () => {
    expect(isPublicAddress('fe80::1')).toBe(false)
    expect(isPublicAddress('fe80::1%eth0')).toBe(false)
    expect(isPublicAddress('fd00::1')).toBe(false)
  })

  it('refuses anything that is not an address at all', () => {
    expect(isPublicAddress('localhost')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
  })
})

describe('fetchRepertoire', () => {
  it('refuses a scheme that is not http', async () => {
    await expect(fetchRepertoire('file:///config/database.sqlite3')).rejects.toThrow(/http/)
    await expect(fetchRepertoire('ftp://example.com/x.json')).rejects.toThrow(/http/)
  })

  it('refuses nonsense', async () => {
    await expect(fetchRepertoire('not a link')).rejects.toThrow(/valid link/)
  })

  it('refuses an address inside this network before connecting to it', async () => {
    await expect(fetchRepertoire('http://127.0.0.1:8080/x.json')).rejects.toThrow(/inside this network/)
    await expect(fetchRepertoire('http://192.168.1.1/')).rejects.toThrow(/inside this network/)
    await expect(fetchRepertoire('http://[::1]:8080/x.json')).rejects.toThrow(/inside this network/)
    await expect(fetchRepertoire('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(/inside this network/)
  })
})
