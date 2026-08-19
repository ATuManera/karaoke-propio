# Karaoke Propio — features beyond Karaoke Eternal

Reference for what this fork adds, why, and the constraints discovered while
building it. Written for whoever maintains this next.

## Song acquisition (YouTube / USDB)

Search and download from inside the app. A preview plays on the requester's own
screen — never the room's shared Player — so a bad version can be rejected
before anything is downloaded.

**Constraints found the hard way:**

- yt-dlp needs a JavaScript runtime to solve YouTube's signature challenge. It
  only auto-detects `deno`; without `--js-runtimes node` the download fails with
  `HTTP Error 403`. The worker image runs on Node, so the runtime is present —
  it just has to be named.
- The YouTube client matters more than anything else for download success.
  Measured on the same video: `android` succeeded 9/9, while yt-dlp's default
  choice (`android_vr`) and `tv`, `web_safari`, `mweb` failed most attempts.
  Retries walk a list of clients rather than repeating one.
- Previews cannot use the YouTube IFrame player: many karaoke uploads disable
  embedding, which that player honours. A direct progressive stream URL is
  proxied instead, so playback never goes through YouTube's player.

## Playlist import

A link to a public YouTube playlist, answered against the library: which of
these can be sung tonight, and what it would take to sing the rest.

The entry point is the search box, not a new button. Anything pasted with a
`list=` in it is a playlist, so the gesture is just paste — including in the
library's own search field, which is where a link actually gets pasted (it
filters as you type, finds nothing, and offers the acquisition modal, so the
same check runs on mount there).

Comparing happens on the client, against the library already in the store.
Cheaper than asking the server, and it keeps the list honest: a song acquired
from the import crosses from one half of the list to the other on the next
render after `LIBRARY_PUSH`, with no bookkeeping of its own — in practice, by
the time the singer taps back to the playlist it has already moved.

Matching is the whole problem. A playlist entry is whatever the uploader typed;
the library holds an artist and title parsed from a file. yt-dlp's structured
`artist`/`track` fields would settle it and are always null under
`--flat-playlist` (verified 2026-08-17), so the material is the title string and
the channel name. What earns its keep in `shared/playlistMatch.ts`:

- Articles. The library stores `Beatles, The`; a playlist says `The Beatles`.
  Without `stripArticles` on both sides, an ordinary English-language playlist
  reads as almost entirely missing.
- Apostrophes are removed, not split on: a filename has usually lost the one in
  `Don't Stop Me Now`.
- `- Topic` channels. YouTube Music's auto-generated uploads put the bare song
  name in the title and the artist only in the channel.
- Both readings of `A - B` are tried, because `Here Comes The Sun - The
  Beatles` is a real and common way to write a title.
- Spanish articles are dropped on both sides. `stripArticles` only knows the
  English ones, because that is all MetaParser shifts on the way in, so a
  Spanish library disagrees with a playlist the moment one writes `El reloj`
  and the other writes `Reloj`.
- When nothing separates the two names at all — `Karaoke Luis Miguel La Barca`,
  `Hasta que me olvides-Luis miguel` — no split will ever read them correctly,
  but the library can still recognise both of its own strings sitting inside
  that one. Requiring the artist AND the title to appear is what makes this
  safe; the longest title wins, so `Tú y yo` beats `Tú`, and a tie is left
  unmatched. Measured over a 596-song library, every song written the way a
  karaoke channel would write it: 591 found themselves, 5 were genuine
  duplicates the library holds twice, and none matched the wrong song.

Where the evidence is ambiguous — a title two songs share, no artist to
separate them — it reports "not here". A false match hides a song someone
wanted; a false miss downloads a second copy of what is already on disk, and
that one is worse.

What a missing song does when tapped depends on what it is, and getting this
backwards was the first thing a real user hit. A playlist can be either kind:

- **Already karaoke** ("De vuelta pa la vuelta karaoke tono bajo VINOTINTO
  MUSIC"). The entry is the version its owner already chose, so tapping offers
  that exact video. Searching for a different karaoke version of a karaoke video
  is how the import produced a screen of unrelated results.
- **The original recording** ("Queen – Bohemian Rhapsody"). It cannot be sung
  to, so tapping searches for a karaoke version of it.

The same `KARAOKE_RE` idea the worker uses to filter search results decides
which, on the title and the channel name together.

Karaoke channels also write their titles in running words, with no bracket or
separator for `cleanSongText` to find — the publisher's name, the key it was
transposed to, and the word "karaoke" all run into the song's own name. In a
karaoke library nothing after that word belongs to a song, so the tail is cut
from there to the end. The guess is still only a guess: it lands in the
artist/title fields of the preview, which is where a human fixes it before
anything is filed.

Nothing downloads from the import either way. Both roads end at the same
preview and pitch questions as any other acquisition, one song at a time: forty
songs someone liked in 2011, fetched unattended, would fill the library with
versions nobody chose. Which is also why this is not the tool that inspired the question
([yt_playlists_from_karaoke_services](https://github.com/Deastrom/yt_playlists_from_karaoke_services)
matches liked songs against catalogs you cannot change; here the catalog is the
thing you can change).

Liked songs and Watch later are private to their owner's account and are
refused by name, with what to do instead, rather than relaying a login error.

## Per-request pitch

Pitch is a property of each queue entry, not of the room. Transposition starts
when the song is queued, not when it plays, so the singer waits at add time
rather than in front of everyone.

## Per-singer pitch memory

The pitch each person sings a given song best in, remembered so they don't have
to. Stored per `(userId, songId)`: the comfortable key is a property of a voice,
not of a song, so the same song is legitimately -4 for one singer and +2 for
another and there is no "the" pitch to store.

Shown as a badge on the library row, because that is where the song is chosen —
in a modal it would arrive too late to inform the choice.

Three sources, ranked, mirroring how `songCategories` separates `auto` from
`manual`: `assistant` and `manual` are decisions, `inferred` is merely observed
(the song was queued at that pitch). An `inferred` write can never overwrite a
decision. The rule lives in the `ON CONFLICT ... WHERE` of a single statement
rather than in a read-then-write, since one singer can be adding songs from two
devices at once.

Not broadcast, unlike stars: a star count is public by design, but the key
someone can comfortably reach is information about their body.

## Pitch assistant

The number is asked for at the only moment it is cheap to answer: right after
the song ends, on the singer's own phone. "Too high / a little high / just
right / a little low / too low" — the semitone arithmetic happens on the server,
so nobody has to know what a semitone is. Answers are saved as `assistant`,
which outranks `inferred` and can correct a `manual` value.

Only a media element's `ended` event triggers it. Skipping, removing, erroring
out and reloading the Player all reach the "next song" path too, and none of
them mean anyone sang anything — a heuristic like "played more than 80%" would
have to guess, and guessing wrong asks people about songs they never finished.

The pitch is measured from the performance, never from what was already saved:
someone who saved -3 and decided to try -1 tonight is answering about the -1.
The version is the one that actually played, resolved server-side with the same
isPreferred rule the queue uses (`Queue.getPerformance`) — two YouTube rips of
the same song are routinely in different keys, so a pitch filed against the
wrong recording is a wrong number.

The question itself lives in memory only (`server/Pitch/PitchFeedback.ts`): one
per singer, replaced by their next performance, gone after 15 minutes or a
restart. What is worth keeping is the answer, and that lands in `songPitchPrefs`
like any other saved pitch — hence no new table.

Full design and the roadmap beyond this phase: `docs/PERSONAL_PITCH.md`.

## Categories

Genre, decade, voice and language, derived from MusicBrainz.

**Use `genres`, never `tags`.** Tags are unmoderated free text: The Beatles carry
"heavy metal" and "80s", Queen carry "metal" and "disco". The curated `genres`
field returns rock/pop/glam rock instead. Raw values are mapped onto a small
allowlist; anything unrecognised is dropped rather than guessed at.

Manual edits are stored with `source = 'manual'` and survive re-scans, which
only replace `auto` rows.

## Invite codes

Invites carry a random 6-character code, never the numeric room id — that id is
sequential, so one invite would advertise that other rooms exist. The alphabet
excludes `O/0` and `I/1/L` so a code survives being read aloud.

The code never appears in the public room list (that endpoint answers without
authentication). Lookups are rate limited: with ~1.07e9 combinations, guessing
is only impractical if it is also slow.

## Public exposure

Set `KARAOKE_DOMAIN` and the stack registers itself with an existing
`nginx-proxy` + `acme-companion`. The QR prefers whichever public domain the
Player was opened at, falling back to `KARAOKE_PUBLIC_URL` when it is running on
a LAN address — a TV at `192.168.x.x` would otherwise hand out invites nobody
off the wifi can use.

## Photo album

Per room, because a room is one party. Images are resized in the browser before
upload (phones produce 4–12 MB files that stall on party wifi) and uploaded one
at a time so progress means something. Filenames on disk are generated, never
taken from the upload.

## Guest accounts

Created automatically by scanning the QR, and swept after 24 hours. The sweep
reuses the normal user-removal path so queued songs and stars are cleaned up
too; deleting rows directly would leave the queue pointing at users that no
longer exist.
