-- Up
-- Karaoke Propio: songs a bulk playlist import brought in, still waiting for
-- an admin to look at them.
--
-- The one-at-a-time acquisition flow has a person in it: the singer watches a
-- preview and confirms the artist and title before anything is downloaded, and
-- that confirmation is what the whole pipeline's correctness rests on, because
-- artist/title become the filename and the filename is what a rescan reads the
-- metadata back out of. A bulk import removes that person. This table is what
-- replaces them: every song a bulk import creates lands here, and stays until
-- an admin says otherwise.
--
-- A row means "pending". Reviewing deletes it, which is also why there is no
-- dateReviewed column: nothing here is history, only a worklist.
CREATE TABLE IF NOT EXISTS "songsPendingReview" (
  "songId" INTEGER PRIMARY KEY REFERENCES "songs"("songId") ON DELETE CASCADE,

  -- the YouTube title the artist/title were guessed from. Kept because it is
  -- the only way to judge whether the guess was right without going back to
  -- YouTube, and because it is often the only place a misread word survives.
  "sourceTitle" TEXT NOT NULL,

  -- which playlist it arrived in, so one bad import can be recognised as one
  "playlistId" TEXT,

  -- nothing in the library corroborated the artist/title reading. Not an
  -- error — a first-time artist looks exactly like this — but these are the
  -- ones to check first, so they sort to the top.
  "isAmbiguous" INTEGER NOT NULL DEFAULT 0,

  "dateCreated" INTEGER NOT NULL
);

-- Down
DROP TABLE IF EXISTS "songsPendingReview";
