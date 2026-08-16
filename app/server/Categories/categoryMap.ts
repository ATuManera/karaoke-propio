/**
 * Turning MusicBrainz's free-form, user-submitted tags into a small set of
 * categories worth browsing by.
 *
 * The tags cannot be imported as-is: they are crowd-edited and noisy (The
 * Beatles carry "80s" and "heavy metal"), unbounded in number, and mix
 * languages. A curated allowlist keeps the filter list short and trustworthy —
 * an unrecognised tag is dropped rather than guessed at, because a wrong
 * category is worse than a missing one when someone is hunting for a song.
 */

export type CategoryType = 'genre' | 'decade' | 'voice' | 'language'

const MAX_GENRES = 3

export interface Category {
  name: string
  type: CategoryType
}

// canonical name -> tags that should map onto it (matched case-insensitively
// against the whole tag, so "latin pop" hits Pop but "poppy" does not)
const GENRE_SYNONYMS: Record<string, string[]> = {
  Pop: ['pop', 'latin pop', 'pop rock', 'pop-rock', 'dance-pop', 'synthpop', 'teen pop'],
  Rock: ['rock', 'latin rock', 'alternative rock', 'classic rock', 'hard rock', 'rock en español', 'post-punk', 'new wave', 'punk'],
  Ballad: ['ballad', 'balada', 'latin ballad', 'power ballad', 'romantic', 'romántica'],
  Bolero: ['bolero', 'boleros'],
  Salsa: ['salsa', 'son cubano', 'timba'],
  Merengue: ['merengue'],
  Bachata: ['bachata'],
  Cumbia: ['cumbia'],
  Vallenato: ['vallenato'],
  Ranchera: ['ranchera', 'rancheras', 'mariachi', 'regional mexicano'],
  Waltz: ['waltz', 'vals', 'valse'],
  Tango: ['tango'],
  Reggaeton: ['reggaeton', 'reggaetón', 'urbano latino', 'latin urban'],
  Christian: ['christian', 'gospel', 'worship'],
  Country: ['country'],
  Jazz: ['jazz', 'swing', 'bossa nova'],
  Blues: ['blues'],
  Soul: ['soul', 'r&b', 'rhythm and blues', 'motown', 'funk'],
  Disco: ['disco'],
  Electronic: ['electronic', 'electronica', 'house', 'techno', 'downtempo', 'edm'],
  Reggae: ['reggae', 'ska'],
  Metal: ['metal', 'heavy metal', 'thrash metal'],
  Folk: ['folk', 'folklore', 'nueva canción', 'trova'],
  Children: ['children', 'children\'s music', 'infantil'],
}

const LANGUAGE_SYNONYMS: Record<string, string[]> = {
  Spanish: ['spanish', 'español', 'espanol', 'castellano', 'spanish language'],
  English: ['english', 'inglés', 'english language'],
  Portuguese: ['portuguese', 'português', 'brazilian portuguese'],
  Italian: ['italian', 'italiano'],
  French: ['french', 'français'],
}

function buildLookup (groups: Record<string, string[]>): Map<string, string> {
  const lookup = new Map<string, string>()

  for (const [canonical, synonyms] of Object.entries(groups)) {
    for (const synonym of synonyms) lookup.set(synonym.toLowerCase(), canonical)
  }

  return lookup
}

const GENRE_LOOKUP = buildLookup(GENRE_SYNONYMS)
const LANGUAGE_LOOKUP = buildLookup(LANGUAGE_SYNONYMS)

/** e.g. 1971 -> "70's", 2013 -> "2010's" */
export function decadeFromYear (year: number): string | null {
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null

  const decade = Math.floor(year / 10) * 10
  return decade < 2000 ? `${String(decade).slice(2)}'s` : `${decade}'s`
}

export function yearFromDate (date: string | undefined | null): number | null {
  const match = /^(\d{4})/.exec(date ?? '')
  return match ? parseInt(match[1], 10) : null
}

/**
 * Artist credits that name more than one performer: "Marc Anthony & La India",
 * "Carlos Vives & Sebastián Yatra". Worth its own category because a duet is a
 * specific thing to look for at a karaoke night — two people singing together.
 *
 * A comma is deliberately NOT a separator: this app stores artists with the
 * article moved to the end ("Beatles, The", "Righteous Brothers, The"), so
 * treating commas as collaborations would flag those as duets.
 */
const COLLAB_SEPARATOR = /(\s&\s|\sand\s|\sy\s|\scon\s|\svs\.?\s|\sfeat\.?\s|\sft\.?\s|\swith\s|\s\+\s|\sdu[oó]\s)/i

export function looksLikeCollaboration (artistName: string): boolean {
  return COLLAB_SEPARATOR.test(artistName)
}

/**
 * The first performer in a joint credit: "Marc Anthony & La India" -> "Marc
 * Anthony". A combined credit is rarely an entry in MusicBrainz, so looking the
 * lead performer up is what supplies genre, country and therefore language for
 * a duet; without it these songs end up carrying nothing but "Dúo".
 */
export function primaryArtist (artistName: string): string {
  return artistName.split(COLLAB_SEPARATOR)[0].trim()
}

/**
 * Compare an artist name against what MusicBrainz matched.
 *
 * Necessary because the reported score is not a name-equality signal: querying
 * "Marc Anthony & La India" returns "India" with score 100 (verified live
 * 2026-08-14), and taking that at face value tagged the duet as "Mujer" using
 * one half of the credit. Requiring the names to actually agree — allowing for
 * accents and this app's "X, The" convention — keeps a partial match from
 * quietly supplying wrong data.
 */
export function namesMatch (query: string, matched: string): boolean {
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/,\s*(the|a|an)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  return normalize(query) === normalize(matched)
}

/**
 * MusicBrainz reports gender only for people; a band has none. "Grupo" is
 * therefore derived from the entity type rather than left blank, since "is this
 * a duet/band or a solo voice" is exactly what singers are choosing between.
 */
export function voiceFromArtist (type: string | undefined, gender: string | undefined): string | null {
  if (gender?.toLowerCase() === 'female') return 'Female'
  if (gender?.toLowerCase() === 'male') return 'Male'
  if (type === 'Group' || type === 'Orchestra' || type === 'Choir') return 'Group'
  return null
}

export interface RawMetadata {
  /** curated genre names from MusicBrainz, strongest first */
  tags: string[]
  /** the credit names two or more performers */
  isCollaboration?: boolean
  artistType?: string
  artistGender?: string
  /** ISO country of the artist, used to infer language */
  artistCountry?: string
  /** earliest known release year of the recording */
  year?: number | null
}

// Language is not stated per song anywhere reliable, so it is inferred.
// Country alone is not enough — Marc Anthony is US but sings in Spanish — so a
// latin genre wins over the country, and anything ambiguous is left unset
// rather than guessed.
const SPANISH_COUNTRIES = new Set(['ES', 'MX', 'AR', 'CO', 'PE', 'CL', 'VE', 'EC', 'UY', 'PY', 'BO', 'CR', 'PA', 'DO', 'CU', 'GT', 'HN', 'SV', 'NI', 'PR'])
const ENGLISH_COUNTRIES = new Set(['US', 'GB', 'CA', 'AU', 'IE', 'NZ', 'ZA'])
const LATIN_GENRES = new Set(['Salsa', 'Bolero', 'Ranchera', 'Cumbia', 'Bachata', 'Merengue', 'Vallenato', 'Reggaeton', 'Tango'])

function inferLanguage (genres: string[], rawTags: string[], country?: string): string | null {
  if (genres.some(g => LATIN_GENRES.has(g))) return 'Spanish'
  if (rawTags.some(t => /^latin/i.test(t.trim()))) return 'Spanish'
  if (country && SPANISH_COUNTRIES.has(country)) return 'Spanish'
  if (country && ENGLISH_COUNTRIES.has(country)) return 'English'
  return null
}

/**
 * Map everything an online lookup returned onto the curated set. Order is
 * stable and duplicates are removed so repeated runs produce identical results.
 */
export function toCategories (raw: RawMetadata): Category[] {
  const out: Category[] = []
  const seen = new Set<string>()

  const push = (name: string, type: CategoryType) => {
    const key = `${type}:${name}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, type })
  }

  // cap the genres: MusicBrainz lists them strongest-first, and a song wearing
  // eight genre chips is no easier to browse than one wearing none
  const genresFound: string[] = []

  for (const tag of raw.tags) {
    const normalized = tag.trim().toLowerCase()

    const genre = GENRE_LOOKUP.get(normalized)
    if (genre && !genresFound.includes(genre) && genresFound.length < MAX_GENRES) genresFound.push(genre)

    const language = LANGUAGE_LOOKUP.get(normalized)
    if (language) push(language, 'language')
  }

  for (const genre of genresFound) push(genre, 'genre')

  const language = inferLanguage(genresFound, raw.tags, raw.artistCountry)
  if (language) push(language, 'language')

  // a duet's gender is meaningless (and, when MusicBrainz matched only half the
  // credit, actively wrong), so "Dúo" replaces it rather than joining it
  if (raw.isCollaboration) {
    push('Duet', 'voice')
  } else {
    const voice = voiceFromArtist(raw.artistType, raw.artistGender)
    if (voice) push(voice, 'voice')
  }

  if (raw.year) {
    const decade = decadeFromYear(raw.year)
    if (decade) push(decade, 'decade')
  }

  return out
}
