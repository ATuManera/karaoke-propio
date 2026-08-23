import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KP_VERSION } from './version.js'

/**
 * The README lives in the repository, one level above this package.
 *
 * It is not always reachable: `app/` is a self-contained npm package and the
 * Docker build's context is `app/` alone, so anything running from inside
 * that context sees no README. Rather than fail there, the two checks that
 * need it stand down — they are here to catch a number edited in one place
 * and forgotten in another, which is something that happens in a checkout.
 */
const readmePath = path.join(import.meta.dirname, '..', '..', 'README.md')
const README = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : null

describe('the version', () => {
  it.skipIf(!README)('is the one the README badge shows', () => {
    const badge = /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-([\d.]+)-/.exec(README!)

    expect(badge?.[1]).toBe(KP_VERSION)
  })

  it.skipIf(!README)('is the one the README says in words', () => {
    const line = /\*\*Version \/ Versión:\*\* ([\d.]+)/.exec(README!)

    expect(line?.[1]).toBe(KP_VERSION)
  })

  // the number the About panel used to show came from package.json, which
  // upstream leaves at 0.0.0-dev.0 and nobody here bumps
  it('looks like a version and not like a placeholder', () => {
    expect(KP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(KP_VERSION).not.toMatch(/^0\.0\.0/)
  })
})
