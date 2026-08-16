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

## Per-request pitch

Pitch is a property of each queue entry, not of the room. Transposition starts
when the song is queued, not when it plays, so the singer waits at add time
rather than in front of everyone.

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
