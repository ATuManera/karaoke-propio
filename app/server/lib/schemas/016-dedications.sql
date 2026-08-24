-- Up
-- Karaoke Propio: what gets said over a song while it plays.
--
-- Two things that look different from the outside are the same row here: the
-- dedication a singer sends with their own song ("para Ana, que cumple hoy"),
-- and the message an admin puts over anyone's. Both are a line of text
-- attached to one performance, shown by the player's carousel while that
-- performance is on screen, so they are stored once and told apart only by
-- who wrote them.
--
-- Attached to queueId, not to (songId, userId): the same person may queue the
-- same song twice in a night and mean something different each time. That
-- also makes the lifetime right — remove the song from the queue and what was
-- said about it goes with it (ON DELETE CASCADE), instead of surfacing again
-- over an unrelated performance next week.
CREATE TABLE IF NOT EXISTS "dedications" (
  "dedicationId" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  "queueId" INTEGER NOT NULL REFERENCES "queue"("queueId") ON DELETE CASCADE,

  -- who wrote it, which is not necessarily whose song it is: an admin writing
  -- over someone else's performance leaves a row authored by the admin. The
  -- player uses this to say who a message is from.
  "userId" INTEGER NOT NULL REFERENCES "users"("userId") ON DELETE CASCADE,

  -- already sanitized on the way in (see shared/dedication.ts): one line, no
  -- controls, no bidi overrides, within DEDICATION_MAX_LENGTH code points.
  "text" TEXT NOT NULL,

  "dateCreated" INTEGER NOT NULL,
  "dateUpdated" INTEGER NOT NULL,

  -- One message per person per performance, so writing is an upsert: a singer
  -- editing their dedication (which they may do for as long as the song is in
  -- the queue) replaces it rather than adding a second one, and a double-tap
  -- on Save cannot put the same words on the TV twice.
  --
  -- The consequence, deliberately accepted: an admin also gets one message per
  -- song. Wanting to say two things about the same performance means editing
  -- the one message; the carousel is a slim strip over someone's lyrics, and
  -- a queue of announcements on a single song is the thing it must not become.
  UNIQUE ("queueId", "userId")
);

-- the read path is always "everything said about this room's queue", assembled
-- on every queue push
CREATE INDEX IF NOT EXISTS "dedications_queueId" ON "dedications" ("queueId");

-- Down
DROP INDEX IF EXISTS "dedications_queueId";
DROP TABLE IF EXISTS "dedications";
