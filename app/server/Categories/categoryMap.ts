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
  'Pop': ['pop', 'latin pop', 'pop rock', 'pop-rock', 'dance-pop', 'synthpop', 'teen pop'],
  'Rock': ['rock', 'latin rock', 'alternative rock', 'classic rock', 'hard rock', 'rock en español', 'post-punk', 'punk'],
  'Ballad': ['ballad', 'balada', 'latin ballad', 'power ballad', 'romantic', 'romántica'],
  'Bolero': ['bolero', 'boleros'],
  'Salsa': ['salsa', 'son cubano', 'timba'],
  'Merengue': ['merengue'],
  'Bachata': ['bachata'],
  'Cumbia': ['cumbia'],
  'Vallenato': ['vallenato'],
  'Ranchera': ['ranchera', 'rancheras', 'mariachi', 'regional mexicano'],
  'Waltz': ['waltz', 'vals', 'valse'],
  'Tango': ['tango'],
  'Reggaeton': ['reggaeton', 'reggaetón', 'urbano latino', 'latin urban'],
  'Christian': ['christian', 'gospel', 'worship'],
  'Country': ['country'],
  'Jazz': ['jazz', 'swing', 'bossa nova'],
  'Blues': ['blues'],
  'Soul': ['soul', 'motown', 'funk'],
  'Disco': ['disco'],
  'Electronic': ['electronic', 'electronica', 'house', 'techno', 'downtempo', 'edm'],
  'Reggae': ['reggae', 'ska'],
  'Metal': ['metal', 'heavy metal', 'thrash metal'],
  'Folk': ['folk', 'folklore', 'nueva canción'],
  'Children': ['children', 'children\'s music', 'infantil'],
  // Names a person reached for that the allowlist had no room for. Each one
  // was typed by hand on a real song before it was added here, and each is a
  // genre the crowd-sourced tags do carry — leaving them out meant an online
  // lookup could never reproduce a categorisation a person had already made,
  // and the reference table would name genres its own mapper did not know.
  'Hip hop': ['hip hop', 'hip-hop', 'hiphop', 'rap', 'trap', 'trap latino'],
  // moved out of Rock: a person filing a song under New wave is drawing a
  // distinction, and folding it back into Rock would erase it
  'New wave': ['new wave', 'nueva ola'],
  'Peruvian Waltz': ['peruvian waltz', 'vals peruano', 'vals criollo', 'música criolla', 'musica criolla'],
  'Tropical': ['tropical', 'música tropical', 'musica tropical'],
  'Flamenco': ['flamenco', 'rumba flamenca'],
  'Twist': ['twist'],
  // moved out of Soul, for the same reason New wave left Rock
  'R&B': ['r&b', 'rnb', 'rhythm and blues', 'contemporary r&b'],
  'Copla': ['copla', 'coplas'],
  'Classical': ['classical', 'classical music', 'clásico', 'clasico', 'música clásica', 'musica clasica'],
  'Sertanejo': ['sertanejo', 'sertaneja', 'música sertaneja', 'musica sertaneja'],
  // moved out of Folk
  'Trova': ['trova', 'nueva trova'],
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

/**
 * Every genre this mapper can produce. The shipped reference table is checked
 * against it: a table naming a genre the mapper does not know would be a table
 * an online lookup could never agree with.
 */
export const GENRE_NAMES = new Set(Object.keys(GENRE_SYNONYMS))

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
 * The form of a name two installations can agree on.
 *
 * Case, accents and punctuation all vary between the places a name arrives
 * from — a filename, a YouTube title, MusicBrainz, somebody typing — and the
 * leading article moves: this app files "The Beatles" as "Beatles, The", and
 * another library will not. So both ends are stripped, and what is left is the
 * key.
 *
 * Deliberately the single key function for every cross-library comparison:
 * the shipped reference table is looked up by it, and MusicBrainz answers are
 * checked against it. A second normaliser would mean two libraries that agree
 * on a song still failing to find each other's row.
 */
export function matchKey (name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/,\s*(the|a|an)$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
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
  return matchKey(query) === matchKey(matched)
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
const LATIN_GENRES = new Set(['Salsa', 'Bolero', 'Ranchera', 'Cumbia', 'Bachata', 'Merengue', 'Vallenato', 'Reggaeton', 'Tango', 'Peruvian Waltz', 'Copla', 'Flamenco', 'Trova', 'Tropical'])
// Sertanejo is the one Latin genre that is not sung in Spanish, so it gets its
// own answer rather than being left out of the inference altogether.
const PORTUGUESE_GENRES = new Set(['Sertanejo'])

function inferLanguage (genres: string[], rawTags: string[], country?: string): string | null {
  if (genres.some(g => PORTUGUESE_GENRES.has(g))) return 'Portuguese'
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
