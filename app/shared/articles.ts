/**
 * The library stores names with a leading article moved to the end — "The
 * Eagles" becomes "Eagles, The" — so that browsing alphabetically groups by
 * the word people actually look under. MetaParser does this on the way in
 * (see server/Scanner/MetaParser/defaultMiddleware.ts).
 *
 * Searching has to undo it on both sides, or typing the name the way it is
 * written on the record ("The Eagles") finds nothing and the artist looks
 * missing. Applies to titles too: "The Show Must Go On" is stored as
 * "Show Must Go On, The".
 */
const LEADING_ARTICLE = /^(a|an|the)\s+/i
const TRAILING_ARTICLE = /,\s*(a|an|the)\s*$/i

export function stripArticles (str: string): string {
  return str
    .replace(TRAILING_ARTICLE, '')
    .replace(LEADING_ARTICLE, '')
    .trim()
}
