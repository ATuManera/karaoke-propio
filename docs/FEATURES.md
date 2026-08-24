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
- The preview needs the client pinned for the same reason the download does,
  and did not get it until previews started failing months later. Measured
  2026-08-19: `android` served every video tried, the default client signed a
  URL for one and then answered 403 to it, and `tv`/`web_safari` offer no
  progressive format at all. Resolving is checked against one byte of the
  stream before the URL is handed back — a signature that will not be honoured
  is worth discovering while another client can still be tried, not in the
  browser as a preview that never starts.

## Library search

Names are matched with the leading article stripped from both sides, because
MetaParser moves it to the end on the way in: without that, typing an artist the
way it is written on the record ("The Eagles") finds nothing and the whole
catalogue looks missing.

Songs are indexed twice — by title, and by `<artist> <title>`. One index per
field is right for "beatles" and right for "something", and wrong for "beatles
something", which is how someone looks for a song they half remember: it matches
neither key, and the library reports a song missing while it sits on disk.

The second index cannot simply run all the time. Searching an artist's name is
supposed to produce their artist row and no song rows (the "empty section is
noise" rule in `SearchResults`), and "beatles" against it returns all 49 of
them, repeating what is already inside the row above. So it only runs when the
query says more than a name does: at least two words, and not — end to end —
somebody's name. That last test turns off fast-fuzzy's `useSellers`, which is
what normally lets a query match inside a longer key; without it both strings
have to account for each other, so "luis miguel" still reads as a name and "luis
miguel la barca" does not. Comparing word counts instead was tried first and got
it backwards for anyone credited alongside others: "enrique iglesias hero" is
three words and "Enrique Iglesias & Descemer Bueno & Gente De Zona" is more, so
the query looked like a name and Hero stayed hidden.

Measured over the real 695-song library, every song searched the way a person
types it: 688 found, 687 of them ranked first, median one result. Whatever the
title index returned before is still returned, in the same order — 695 of 695
title-only searches unchanged — with cross-field matches appended. About 4.5 ms
per keystroke.

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

- The word joining two performers is dropped, not standardised. `Simon &
  Garfunkel`, `Simon and Garfunkel` and `Simon Garfunkel` all reach the library
  the same way — from a YouTube title, a MusicBrainz credit and a filename that
  lost the ampersand — and only dropping it satisfies all three.
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

## Bulk playlist import (admin)

The same playlist, downloaded whole instead of one tap at a time. Only an
admin sees the button, and only the server's copy of that rule decides
anything.

The gate is not about bandwidth. It is about who may write to the library:
a bulk import files songs under guessed names with nobody confirming them, and
the person who has to clean that up is the same person who can already retag
and delete songs.

**Only entries that are already karaoke tracks.** An original recording cannot
be sung to, and picking a karaoke version of one unattended means taking
whatever a search happened to return first — a cover, a different key, a
ten-minute video. Those stay one tap each, as they were.

**Nothing is queued.** `queueAndFinish` exists for a singer who asked for one
song; forty songs into a room's queue is not what an admin filling a library
meant, and the pitch questions that flow asks have no answer without a singer.
The download step was split out of `runYouTube` so both paths share it and
differ only in what they do afterwards.

**One at a time.** The acquisition worker limits nothing — every download is an
`execFile` of yt-dlp — so forty at once is forty ffmpeg jobs competing for the
same disk and one address making forty simultaneous requests to YouTube. A
failure never stops the run: a playlist with one deleted video in it is still
worth the other thirty-nine. Stopping waits for the song in flight, because
killing yt-dlp mid-file leaves a partial behind.

Duplicates are checked twice: once when the plan is built, so the admin sees
the count before committing, and again immediately before each download, since
the library has been changing throughout the run — not least because of this
very job.

### Reading a karaoke title with no one to confirm it

The one-at-a-time flow can afford a rough guess, because the singer corrects it
in the preview before anything is downloaded. A bulk import has no such moment,
and the guess is not cosmetic: it becomes the filename, and the filename is what
a rescan re-derives the artist from. A backwards guess files "El Reloj" as an
artist permanently.

So `resolveTrackMeta` uses the library itself as the witness. It already knows
how to spell several hundred artists, so which side of the dash is the artist
stops being a convention to assume and becomes something to look up. From the
playlists that produced this feature:

| the uploader wrote | read as |
| --- | --- |
| `Luis Miguel - La Bikina (Versión Karaoke)` | Luis Miguel / La Bikina |
| `El Reloj - Luis Miguel (Karaoke)` | Luis Miguel / El Reloj |
| `KARAOKE MALA - MARC ANTHONY` | Marc Anthony / MALA |
| `Karaoke Luis Miguel La Barca` | Luis Miguel / La Barca |
| `Hasta que me olvides-Luis miguel karaoke` | Luis Miguel / Hasta que me olvides |
| `Karaoke Alejandro Sanz feat Marc Anthony Deja que te bese` | Alejandro Sanz / Deja que te bese |

Details that each cost a real failure:

- The name is looked up, and the library's own spelling is what gets written.
  Filing a second "MARC ANTHONY" beside "Marc Anthony" is the duplication this
  was meant to prevent.
- Words are split on hyphens as well as spaces, or `Hasta que me
  olvides-Luis miguel` hides its artist behind a missing space. The separator
  is remembered, so "Blink-182" survives being taken apart and put back.
- A window reaching past a "feat" is normalized with `keepFeatured`, or
  "Alejandro Sanz feat Marc Anthony Deja" folds down to "alejandro sanz" and
  swallows the song along with the guest.
- The channel never names the artist. `guessTrackMeta` falls back to it, which
  is right for a "- Topic" upload and wrong for every karaoke publisher there
  is: "Marc Anthony Flor Palida Nueva Version Karaoke" was filed under
  "Alejandro Paredes", the channel that posted it.
- A dash inside either half is written as an en dash. A hyphen would be a
  second delimiter, and MetaParser's longest-match rule picks the wrong one:
  "Queen - Bohemian Rhapsody - Live Aid" came back as artist "Queen-Bohemian
  Rhapsody". Verified by round-tripping the filename back through MetaParser,
  which is also where "Beatles, The" was confirmed to survive intact — filing
  a second "Beatles The" beside it is exactly the duplication this avoids.
- With nothing at all to go on, the artist is `Unknown Artist`. A filename with
  no " - " in it cannot be parsed at all — MetaParser throws — so something has
  to go there, and a placeholder that is obviously a placeholder beats a
  channel name that would scatter one performer across every karaoke publisher
  on YouTube.

Measured against both playlists that prompted this, 17 entries: 13 read
correctly and confidently, 4 marked as uncorroborated (three name nobody the
library knows, one is a title typed as gibberish), and none attributed to the
wrong artist.

### When the library knows nobody

The library is the right first witness — free, instant, always right about the
artists it already holds. It is also useless on the first real import into a
new library, and that is not a corner case: a library of Spanish-language music
handed a classic rock playlist recognised almost nobody, fell back to assuming
"Artist - Title", and filed a third of them backwards, because KaraFun and
channels like it write the song first. 62 of 79 came out flagged.

MusicBrainz knows all of them, and asked both ways round it does not hedge.
Measured live 2026-08-22 over the reversed titles from that import:

| asked | answer |
| --- | --- |
| `artistname:"All Right Now" AND recording:"Free"` | nothing |
| `artistname:"Free" AND recording:"All Right Now"` | 100 · Free — All Right Now |
| `artistname:"Mountain" AND recording:"Mississippi Queen"` | 100 · Mountain — Mississippi Queen |
| `artistname:"Mississippi Queen" AND recording:"Mountain"` | nothing |

Ten of ten, always 100 against nothing. There is no threshold to tune because
there is no middle ground to tune it in — so `corroborate()` simply asks both
ways and takes the side that answers, treating "both" and "neither" alike as no
opinion.

It is the second question and not the first because it costs a second per
lookup and an internet connection: it runs only for the readings the library
could not settle. A `TransientLookupError` leaves the reading exactly as
uncertain as it was, the same rule the category scan learned on 2026-08-14 —
one unlucky 503 must never be recorded as an answer.

MusicBrainz returns equal-scoring recordings in no particular order, and a
song has dozens of them — album, live, remaster, compilations — so the top hit
alone gave the same artist two different spellings on two runs, which is two
artists in a library. Five results and the most common credit narrows that;
what actually converges is the caller preferring a spelling the library already
holds, established by the first correction and reused by every song after it.
That in turn only works because `normalizeForMatch` drops the joining word
entirely rather than standardising it: "Simon & Garfunkel", "Simon and
Garfunkel" and "Simon Garfunkel" are three forms in circulation, not two, and
the third is what a filename becomes.

`artistname` rather than `artist` gets the performer's own name back as
MusicBrainz spells it, which is how "Doors" becomes "The Doors" and then
"Doors, The" on the way in. The library's spelling wins over MusicBrainz's
where it has one; the uploader's is never kept. The *title*, though, stays as
the uploader wrote it — MusicBrainz's is canonical rather than familiar, and
nobody goes looking for "Fire & Rain" having heard "Fire and Rain".

Everything the client and the worker share stays in `shared/playlistMatch.ts`
and stays synchronous; this lives on the server, where the network is.

### Re-reading what is already downloaded

The first import into a library happens before the library knows anybody, so
its songs are the ones most likely to be wrong — and by the time a second
import would benefit from them, they are already filed. `recheckPending()`
closes that loop: it re-reads every song still awaiting review, asks
MusicBrainz about the ones the library still cannot settle, and corrects them
through `retagSong`, which renames the files so the fix survives a rescan.
Nothing is downloaded again.

It is offered where the songs are — under the review filter — and is
fire-and-forget behind a 202, like the category scan and for the same reason.
"Roughly a second each" is optimistic: measured against the live service on
2026-08-22, ten requests took 52 seconds and thirteen of them were answered
with a 503 first, so two lookups cost about ten seconds of wall clock. The real
run over 79 songs took 13m22s. That is not something to hold an HTTP request
open for, and it is why the job reports itself through the library instead. A `LIBRARY_PUSH` after each
correction makes the list visibly move rather than sit still and then jump.

A corrected song stays pending, and staying takes work. Renaming gives a song a
new `songId` — `Library.matchSong` files the corrected name as its own row and
`retagSong` retires the old one, which takes the review row with it through the
foreign key. On the first real run every song the re-read fixed quietly left the
worklist, which is the exact opposite of the intent: corrected by a lookup is
not the same as looked at by a person. The row is now written again against the
new id.

(A *manual* edit still drops the flag, and that is deliberate: an admin who
retyped a name has, by definition, looked at it.)

Songs under `Unknown Artist` are skipped: there is no second name to swap with,
so there is no question to ask, and they are exactly the ones only a person can
answer.

### Review

Every song a bulk import creates is held in `songsPendingReview` until an admin
says otherwise — a row means pending, reviewing deletes it, and there is no
`dateReviewed` because this is a worklist and not history. The table stores the
YouTube title the guess came from, which is the only way to judge the guess
without going back to YouTube.

The flag beside the search box filters the library down to them, and appears
only while there is something to check: a filter that always shows zero is a
permanent reminder of nothing. Tapping a song opens Song Info, where the fields
that correct an artist and title already existed — `retagSong` renames the
files too, so the correction survives a rescan.

Marking reviewed is a separate act from editing, because an admin may well want
a second look at something they just retyped. A song that merges into an
existing one while being corrected loses its pending row to the foreign key
cascade, which is the right answer: fixed and merged away is reviewed.

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

## Portable repertoire (export / import between installations)

What a singer carries to a friend's Karaoke Propio: their songs, their saved
pitches and their stars, as a JSON file of a few kilobytes
(`fernando.karaoke-propio.json`). Deliberately no audio. The songs already exist
at the other end, or can be fetched there the same way they were fetched here;
the pitch cannot, because it took a party and a pitch assistant to learn.

**The join key is the source upload's id.** `songId`, `mediaId` and `artistId`
are local numbers that mean something else on the other machine. The only thing
two libraries can agree on is the `---<id>` suffix acquisition writes into every
filename (`sourceIdFromPath`, `server/lib/util.ts`). Artist and title travel too,
and carry the songs that never had a source id at all.

**Two matches, and the difference decides what a pitch is worth.** The same
source id is the same upload: the number means exactly what it meant at the
origin, and arrives with its `source` intact. The same artist and title is only
the same *song* — karaoke uploads are transposed against each other constantly —
so that pitch arrives as `inferred`, losing to any decision made here and
corrected by the pitch assistant the first time they sing it. Migration 012
spells out why: a pitch against another recording is a wrong number, not an
approximate one.

**Each pitch names its own recording**, not just its song: a library can hold
two uploads of one song, and the singer learned their number on one of them
(`RepertoirePitch.sourceId`). A pitch that names none — the common case, since
`PitchPrefs.set` defaults `mediaId` to null — inherits its song's answer rather
than being downgraded on principle, which would throw away the case the feature
exists for.

**An import never undoes a correction made here.** The file carries the origin's
`dateUpdated` and `PitchPrefs.set` writes it through unchanged (that parameter
exists for this), so a row changed at the destination after the file was written
wins, and re-importing the same file is idempotent.

**Bringing one in happens at the join form.** Someone arriving with their
repertoire is arriving to sing, and the form is the one moment they are already
filling something in — a file from the phone, or a link to one. The account is
created first and the repertoire applied after: a file that cannot be read is
something to tell them about, not a reason to refuse them the room. It is also
in Account (`My Repertoire`) for later, and in the admin's user editor for
applying somebody else's file on their behalf.

**A link is fetched by this server**, which is the whole reason
`Repertoire/fetchRemote.ts` exists: the field is filled in by someone who has
not signed in yet, and without a check "paste a link" would also mean "make the
host's server connect to anything on the host's LAN and tell me how it went".
Every hop is resolved and every address checked against loopback, the private
ranges, CGNAT, link-local (including `169.254.169.254`) and their IPv6
equivalents; three redirects, 1 MB, ten seconds, ten attempts a minute per IP.
The residual gap — a name that resolves publicly here and internally a
millisecond later — is documented in that file rather than pretended away.

**Nothing about an import downloads anything.** It writes to exactly two places,
both belonging to the person importing: their saved pitches and their stars.
Songs this library does not have are listed, with the upload each came from, and
fetching them is a separate admin action that reuses the bulk import
(`startBulkFromSongs`) — one at a time, nothing queued, everything held in
`songsPendingReview` like any other unattended download. That path skips
`planBulk` on purpose: its `isKaraokeUpload` filter is the right question for a
stranger's playlist and the wrong one for songs already sitting in a library.

**Guests are deliberately ephemeral.** A guest who brings their repertoire keeps
it as long as the party lasts, and the nightly sweep takes it with the account —
the file at home is the durable copy. Persisting between parties is what the
`standard` role is for; an admin can import the same file onto a real account.

**The password never travels.** Carrying the hash would make the export file a
credential that works on any installation the person has ever visited, and
recovering "sign in with the same password at a friend's house" is not worth
that.

**The same format with nobody in it** is a library export
(`GET /api/repertoire/library`, admin): every song and the upload it came from,
no personal data. That is what one installation hands another so it can fetch
the same catalogue.

Admins can turn importing off entirely (`isRepertoireImportEnabled`, migration
014); the flag reaches signed-out clients, unlike the rest of the preferences,
because the join form has to know whether to offer the field.

## Categories

Genre, decade, voice and language, derived from MusicBrainz.

**Use `genres`, never `tags`.** Tags are unmoderated free text: The Beatles carry
"heavy metal" and "80s", Queen carry "metal" and "disco". The curated `genres`
field returns rock/pop/glam rock instead. Raw values are mapped onto a small
allowlist; anything unrecognised is dropped rather than guessed at.

Manual edits are stored with `source = 'manual'` and survive re-scans, which
only replace `auto` rows.

## Choosing a room

Signing in never picks the room. With one room open the screen used to select
it silently, which is right when the singer is standing in that room and wrong
when they are away from home and wanted an evening of their own — and either
way it was never asked.

Every open room is listed with whether anyone is in it (`isLive`, from the
socket count) and nothing is preselected, so the choice can be made from
outside the door: join the party already going, or take an empty room, sign in,
and start it with the "no player in room" invitation that is already there.

Only whether, never how many. The room list answers without authentication, and
a headcount is the room's business. It is read once when the screen loads, so a
party starting in the seconds after shows on the next load.

Someone arriving on an invite skips all of this: their link names a room, which
is the whole point of having been invited to it.

## Invite codes

A room is joined by invitation, and the code is the whole of it.

Invites carry a random 6-character code, never the numeric room id — that id is
sequential, so one invite would advertise that other rooms exist. The alphabet
excludes `O/0` and `I/1/L` so a code survives being read aloud.

The code never appears in the public room list (that endpoint answers without
authentication). Lookups are rate limited: with ~1.07e9 combinations, guessing
is only impractical if it is also slow.

### The code is checked when the account is created

Room prefs allowing new guests cannot carry that weight on their own: they have
to be on for any QR to work at all, so on their own they let in whoever finds
the address — and everyone in a room shares its queue and its photo album. The
code is checked in `POST /api/user` (see `server/Rooms/inviteGuard.ts`), where a
hidden radio button cannot be worked around; the sign-in form only follows,
offering "New user" and "Guest" once an invite for the selected room is in hand.

Someone who already has an account is unaffected — their password is their
invitation, and they may sign into any open room. Links of the older
`?roomId=N` form still sign such a person in, but no longer admit anyone new.

Wrong codes have their own allowance, separate from the code-lookup endpoint: a
guest arriving by QR spends both, and a shared bucket would have a party
locking itself out. Successes are not counted at all — they were never guesses,
and behind a proxy every guest looks like one caller.

### Typing a code, and handing one out

The alphabet was chosen for dictation, and the Player prints the code beside
the QR for exactly that, so the sign-in screen takes a typed code and resolves
it the same way a scanned one is resolved.

Whoever is in a room can read its code off their own account screen, with the
link to send. Without it, a singer who opened a room away from home would have
a party nobody could join: the QR lives on the television in the room, which is
no help for asking someone who has not arrived yet, and the overlay may be off.
Guests are refused it — at the endpoint, not only on the screen — since a guest
was asked in themselves and passing the invitation on belongs to the host.

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

## Dedications and messages on screen

A line sent with a song and read over it by the whole room: the singer's own
dedication, and any message an admin put on that same performance. Both are the
same row in `dedications` (migration 016) and are told apart only by who wrote
them.

Attached to `queueId`, not to `(songId, userId)`. The same person may queue the
same song twice in a night and mean something different each time, and the
lifetime follows: remove the song from the queue and what was said about it goes
with it, instead of resurfacing over an unrelated performance next week.

One message per person per performance (`UNIQUE (queueId, userId)`), so writing
is an upsert. Editing a dedication replaces it rather than adding a second one —
which is the whole of "a singer may change their dedication while the song is
queued", with no separate edit path to keep in step — and a double-tap on Save
cannot put the same words on the television twice. The accepted consequence: an
admin also gets one message per song. Saying two things about one performance
means editing the one message, and that is deliberate; the banner is a slim
strip over somebody's lyrics, and a queue of announcements on a single song is
what it must not become.

An admin editing someone else's dedication rewrites it in place, keeping its
author: correcting a misspelled name is not signing the greeting.

Two rules govern who may write, both enforced server-side. The singer writes on
their own songs; an admin writes on any song **in the room they are in** —
`Queue.isOwner()` matches on `(userId, queueId)` alone, so without the room
check an admin of one room could put a message on another room's queue. The
queue screen stops offering the control on songs already sung, which is a
courtesy rather than a rule.

Text is sanitized by `shared/dedication.ts` on both sides, and the server's
answer is the one that counts: one line (a textarea's newlines fold to spaces),
no control characters, no bidi overrides — U+202A–202E would reverse the rest of
the banner, and on a screen nobody can touch that would simply sit there for the
whole song — and 160 code points, counted so an emoji costs one character
instead of two. An empty message removes it, because clearing the box and
saving is the obvious gesture for taking something down.

### Turning it off

A room pref (`prefs.dedications.isEnabled`), edited by an admin from *Edit
Room* alongside the QR overlay, which is the closest thing to it: both are
decisions about what a room's television shows.

**Absence means on.** Every room in the database predates the switch, and each
of them is one where messages were already appearing — reading their silence as
"off" would take the feature away from them on the next deploy. So only an
explicit `false` hides the carousel, and `areDedicationsShown()` in
`shared/dedication.ts` is the single place that rule is written.

Off hides the carousel and nothing else: nothing is deleted, singers go on
writing, and it all reappears when it is turned on again. That is what makes it
a switch an admin can flip mid-party without weighing what it costs.

A Player run by a singer rather than an admin has to honour it too, so
`server/Rooms/router.ts` passes the flag through the same narrow filter the QR
prefs go through — a boolean with nothing private in it, sent only to a member
of that room when an admin has opened the Player to non-admins.

### Reaching the television

No push of its own. The messages ride the queue push every client already
receives, attached in `Queue.get()` by a **second query**, never a join: that
query groups over media rows and lets `MAX(isPreferred)` decide which recording
plays, so a one-to-many join would make the chosen version depend on how many
people wrote something. A dedication edited on a phone is therefore on the TV
with the next push, and the Player needs no new socket handler.

### Why a carousel and not a caption

Karaoke lyrics reach the top of the frame — CDG paints wherever it likes, and an
MP4 karaoke is whatever the uploader made — so anything parked up there competes
with the words somebody is trying to sing. Each message takes a turn instead:
in after `UpNow` has slid away (the room sees who is singing, then what they
wanted to say), up for a dwell computed from its length, and after a full round
the strip leaves for half a minute. That rest is also what makes a second
message readable at all; two greetings side by side on a television are two
greetings nobody reads.

The cycle keys on the *content* of the message list, not on the array's
identity: every unrelated queue push rebuilds that array, and restarting for
that would cut a message off mid-sentence. A message written mid-song appears
in about a second rather than waiting for the next round, so an admin can see
that what they typed arrived.

## Guest accounts

Created by scanning the QR or typing the code it carries — never without one —
and swept after 24 hours. The sweep
reuses the normal user-removal path so queued songs and stars are cleaned up
too; deleting rows directly would leave the queue pointing at users that no
longer exist.

## Letting a singer start the Player

Off by default; an admin turns it on under Account → Preferences → Player. With
it on, any signed-in account that is not a guest can open `/player`, and gets
the playback controls in the two places they mean something: the "no player in
room" invitation, and the Player's own screen. Everywhere else, playback still
belongs to the admin and to whoever is up.

The point is the TV. The screen the room watches is rarely next to whoever owns
the library, and requiring that one account be signed in on it is how parties
start twenty minutes late.

**This was never a security boundary, and turning it on doesn't remove one.**
Every command the Player sends (`PLAYER_REQ_*`) was already accepted from any
member of the room, and media is authorized by queueId rather than by role, so
the admin-only route hid a button and nothing more. The pref decides what is
offered, not what is reachable.

**Constraints found the hard way:**

- The permission lives in prefs, not on the signed-in user, so it is *unknown*
  on the first render of a TV reopened straight at `/player` — the persisted
  session says who they are, but nothing yet says what they may do. Treating
  unknown as "no" bounces them to the library on every reload. The route waits
  on `prefs.isFetched` instead, which is set whether the fetch succeeds or
  fails so a dead server can't leave a blank screen.
- Nothing fetched prefs for a non-admin except the account screen, so the
  launch link never appeared for someone who went straight to the library.
  `CoreLayout` now asks on mount for anyone signed in and not an admin (an
  admin is handed prefs over the socket on connect).
- A Player run by a non-admin was a half-Player until its two admin-only inputs
  followed it: `isReplayGainEnabled` and `publicUrl` (both added to the
  non-admin prefs response, only while the pref is on), and the room's `qr`
  prefs, which `/api/rooms/:roomId` strips for non-admins — without them
  `getRoomPrefs` returns `{}`, which is truthy, so the default is skipped and
  the QR overlay silently never mounts. They are passed only for the room the
  caller is actually in, the same predicate `/:roomId/code` already uses.
- Those `qr` prefs include the room password in cleartext. It is passed anyway:
  any Player showing the invite already puts that password on a screen the
  whole room can scan, so a member reading it here learns nothing new. Strip it
  and one-scan joining breaks for exactly the rooms that need it.
- `pushPrefs` (server/Prefs/socket.ts) claimed to push prefs to admins and
  actually broadcast them to every connected client: it collected socket ids
  with `.to(id)`, threw the operators away, and then called `.emit()`. Two
  problems at once — every media path and setting went to guests, and once
  prefs carried this flag, an admin saving anything at all could have
  navigated a running Player away from the song a room was watching. Fixed by
  addressing each admin socket. It also means a non-admin's prefs are settled
  at page load, which is what makes opening the Player an entry check rather
  than a leash.
- Known limitation: `ROOM_PREFS_PUSH` still only reaches admins, so QR settings
  changed while a non-admin's Player is running apply on its next load rather
  than live.

## Signing out ends the session everywhere that browser is open

`GET /api/logout` clears the `keToken` cookie, and a cookie belongs to the
browser rather than to the tab that cleared it. So signing out on the account
screen signs out every other tab too — and the tab that matters is a running
Player on a TV.

It used to say nothing. The Player's socket is authenticated once, at the
handshake, so it kept working: queue pushes arrived, the current song played
to its end, and nothing looked wrong until the next song needed bytes. That
request went out with no cookie, the server refused it, and the browser
reported the refusal the only way a `<video>` can — `MEDIA_ELEMENT_ERROR:
Format error (code 4)`, a perfectly good file blamed for a session that had
ended three minutes earlier.

Logout now drops every socket holding that exact token, after telling it
`SOCKET_AUTH_ERROR`. The client resets `state.user`, and `RequireAuth` sends
`/player` to `/account?redirect=/player` — the TV shows the sign-in screen,
which is both true and something a host can act on.

- **Matched on the token, never on the userId.** The same account signed in on
  someone's phone is a different session and has no part in it.
- Which means sessions have to be distinguishable. The payload is the account
  plus `iat`, and `iat` counts whole seconds, so signing the same account into
  the same room twice in one second — a host setting up the TV and then their
  phone — produced two byte-identical tokens. Every token now carries a `jti`.
- **The media element's account of a failure is never the whole story.** It
  reports a refused request and an undecodable file with the same sentence, and
  it is usually the first case. All three players now re-ask the server for the
  same URL when a load fails and report *its* answer, so `403: queueId does not
  belong to your room` reaches the queue instead of a complaint about the file.
