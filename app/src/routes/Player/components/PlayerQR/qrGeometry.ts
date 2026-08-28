/**
 * How big the Player's invite QR is drawn, and how much white is left around
 * it, kept apart from the component so the numbers can be reasoned about —
 * and tested — without a screen.
 *
 * Neither number is taste. The symbol is read by a phone from across a room,
 * so its modules should land on whole pixels: a code whose cells are 4.17px
 * wide is drawn with some cells 4px and some 5px, and that ragged edge is
 * work the camera has to undo. The standard also asks for four modules of
 * blank margin — the quiet zone — or a scanner can miss where the symbol
 * ends. Both need to know how many modules across the symbol is, which
 * depends on how much the invite URL carries, so it is worked out here
 * instead of guessed at with a percentage.
 */

/**
 * How many bytes each QR version holds at error-correction level M, from the
 * standard's capacity tables. Version 1 is 21 modules across and every
 * version after it adds 4, so the position in this list gives the size.
 *
 * Only byte mode is listed because it is the only mode an invite URL can use:
 * the lowercase letters in "https://" already rule out the alphanumeric set.
 */
const BYTE_CAPACITY_BY_VERSION = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213]

/** what the standard asks for around the symbol, in modules */
const QUIET_ZONE_MODULES = 4

/** below this a module is too thin to survive a camera at party distance */
const MIN_MODULE_PX = 3

/**
 * The room's size preference spans a deliberately narrow range of the Player
 * height: enough to scan from the sofa at the bottom of it, and never enough
 * to become the thing the room looks at. The old range went up to a fifth of
 * the screen, which read as a card stuck over the video rather than as part
 * of the player.
 */
const MIN_HEIGHT_FRACTION = 0.085
const MAX_HEIGHT_FRACTION = 0.14

/** a small Player window still has to hand out a scannable code */
const MIN_SIZE_PX = 88

export interface QRGeometry {
  /** the symbol itself, in CSS px, always a whole number of modules */
  size: number
  /** blank margin on each side, in CSS px */
  quietZone: number
}

/** how many modules across the symbol carrying `value` will be */
export const getModuleCount = (value: string): number => {
  const bytes = new TextEncoder().encode(value).length
  const version = BYTE_CAPACITY_BY_VERSION.findIndex(capacity => bytes <= capacity)

  // a URL longer than the last version listed is not one this app builds, and
  // erring towards a larger symbol only ever leaves a thicker quiet zone
  return 21 + 4 * (version === -1 ? BYTE_CAPACITY_BY_VERSION.length - 1 : version)
}

/**
 * @param height    the Player's height in CSS px
 * @param sizePref  the room's QR size preference, 0–1
 * @param value     the invite URL the code will carry
 */
export const getQRGeometry = (height: number, sizePref: number | undefined, value: string): QRGeometry => {
  const normalized = Math.min(1, Math.max(0, sizePref ?? 0.5))
  const fraction = MIN_HEIGHT_FRACTION + normalized * (MAX_HEIGHT_FRACTION - MIN_HEIGHT_FRACTION)
  const target = Math.max(MIN_SIZE_PX, height * fraction)

  // round to a whole number of pixels per module, then let the module decide
  // both dimensions: the symbol is a multiple of it, and so is its margin
  const moduleCount = getModuleCount(value)
  const module = Math.max(MIN_MODULE_PX, Math.round(target / moduleCount))

  return {
    size: module * moduleCount,
    quietZone: module * QUIET_ZONE_MODULES,
  }
}
