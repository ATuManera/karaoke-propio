/**
 * Which Karaoke Propio this is.
 *
 * The one place the number is written down. `app/package.json` is not that
 * place: it says 0.0.0-dev.0, which is upstream Karaoke Eternal's own
 * placeholder, and a version bump there would be something every vendored
 * upstream merge has to argue with. So the fork keeps its own.
 *
 * version.test.ts holds this to what the README says, in both the badge and
 * the Version/Versión line — three copies of a number is how two of them end
 * up wrong. The git tag is deliberately NOT covered by that test: tagging is
 * an act of release, done once the code is final, not an input to the build.
 */
export const KP_VERSION = '2.2.0'

export const KP_REPO_URL = 'https://github.com/ATuManera/karaoke-propio'

/** the product name, which is never translated and never machine-translated */
export const KP_NAME = 'Karaoke Propio'
