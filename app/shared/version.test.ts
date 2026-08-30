import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KP_VERSION } from './version.js'

/**
 * The README lives in the repository, one level above this package.
 *
 * It is not always reachable: `app/` is a self-contained npm package, and
 * only `app/` is copied into the image, so anything running from inside a
 * container sees no README two directories up. (Since 2.9.0 the build context
 * is the repository root rather than `app/`, which puts the README within
 * reach of a COPY — but nothing copies it, so the reason still holds and the
 * checks still stand down there.) Rather than fail, the two checks that need
 * it stand down — they are here to catch a number edited in one place and
 * forgotten in another, which is something that happens in a checkout.
 */
const readmePath = path.join(import.meta.dirname, '..', '..', 'README.md')
const README = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : null

/**
 * docker-compose.yml is the fourth place the number is written, once per
 * service: `image: ghcr.io/atumanera/…:${KP_TAG:-2.9.0}`. That default is what
 * an installation runs when nothing sets KP_TAG, so a release that bumps
 * KP_VERSION and forgets these four lines publishes new images and keeps
 * everybody on the old ones — silently, since a stale tag pulls perfectly
 * well. Same reach and same skip as the README above.
 *
 * This runs on every push, not only on a tag, and that is the deliberate
 * choice: it means the half-done bump — the constant raised, the compose file
 * not yet — turns `main` red for as long as it lasts. The alternative is to
 * check it only when releasing, and by then the release is what breaks. A
 * version bump is one edit across the README, this constant and those four
 * lines; a test that says so the moment half of it lands is the cheap half of
 * the trade.
 */
const composePath = path.join(import.meta.dirname, '..', '..', 'docker-compose.yml')
const COMPOSE = fs.existsSync(composePath) ? fs.readFileSync(composePath, 'utf8') : null

describe('the version', () => {
  it.skipIf(!README)('is the one the README badge shows', () => {
    const badge = /!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-([\d.]+)-/.exec(README!)

    expect(badge?.[1]).toBe(KP_VERSION)
  })

  it.skipIf(!README)('is the one the README says in words', () => {
    const line = /\*\*Version \/ Versión:\*\* ([\d.]+)/.exec(README!)

    expect(line?.[1]).toBe(KP_VERSION)
  })

  it.skipIf(!COMPOSE)('is the image tag every service falls back to', () => {
    const defaults = [...COMPOSE!.matchAll(/\$\{KP_TAG:-([\d.]+)\}/g)].map(m => m[1])

    // four services, or the file changed shape and this test stopped watching
    expect(defaults).toHaveLength(4)
    expect(new Set(defaults)).toEqual(new Set([KP_VERSION]))
  })

  // the number the About panel used to show came from package.json, which
  // upstream leaves at 0.0.0-dev.0 and nobody here bumps
  it('looks like a version and not like a placeholder', () => {
    expect(KP_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(KP_VERSION).not.toMatch(/^0\.0\.0/)
  })
})
