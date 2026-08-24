/**
 * The timing of the carousel on the player, kept apart from the component so
 * it can be reasoned about — and tested — without a screen.
 *
 * The shape is a two-beat cycle per message: wait, then show. What varies is
 * how long each wait is, and that is the whole design of this feature: the
 * strip must arrive after the room has seen who is singing, stay long enough
 * to be read, and then get out of the way of the lyrics for a good while.
 */

/** how long one message stays up, from how much there is to read */
const READING_MS_PER_CHAR = 55
const DWELL_BASE_MS = 4000
const DWELL_MIN_MS = 5000
const DWELL_MAX_MS = 12_000

/**
 * The first message waits for UpNow to slide away (5s plus its transition).
 * The order that produces is the right one anyway: the room sees who is
 * singing, and then what they wanted to say.
 */
export const FIRST_DELAY_MS = 6000
/** a message written or corrected mid-song appears almost at once */
export const CHANGE_DELAY_MS = 1200
/** between two messages of the same round */
export const GAP_MS = 700
/**
 * And then the strip is empty for a while. This is the whole reason the
 * banner is a carousel rather than a caption: a message that never leaves is
 * a message sitting on top of somebody's lyrics for four minutes.
 */
export const REST_MS = 30_000

export interface CarouselStep {
  /** which message this beat belongs to */
  index: number
  /** shown = being read; not shown = waiting to appear */
  isShown: boolean
  /** how long to wait before showing, when it isn't shown yet */
  wait: number
}

export const firstStep = (wait: number = FIRST_DELAY_MS): CarouselStep => ({ index: 0, isShown: false, wait })

/** How long the message stays up. Counted in code points, so emoji count once. */
export function dwellFor (text: string): number {
  return Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, DWELL_BASE_MS + [...text].length * READING_MS_PER_CHAR))
}

/**
 * What follows the message that has just had its turn.
 *
 * Coming back round to the first message means a full round is over, and the
 * strip rests rather than looping straight into another one — with a single
 * message, that is every time, which is exactly right: one dedication shown
 * every half minute, not one dedication permanently on the screen.
 */
export function advance (step: CarouselStep, count: number): CarouselStep {
  if (count <= 0) return firstStep()

  const index = (step.index + 1) % count
  return { index, isShown: false, wait: index === 0 ? REST_MS : GAP_MS }
}
