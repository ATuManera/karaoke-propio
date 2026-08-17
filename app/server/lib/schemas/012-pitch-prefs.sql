-- Up
-- Karaoke Propio: the pitch each singer sings a given song best in.
--
-- Distinct from queue.pitchSemitones (migration 006), which records what was
-- requested for one performance. This records what a person learned about
-- their own voice, so the next time they pick that song the app already knows.
--
-- Keyed by (userId, songId) because the answer is a property of a voice, not
-- of a song: the same song is -4 for one singer, +2 for another, and 0 for a
-- third. There is deliberately no room in this table for a "the" pitch of a
-- song, since no such number exists.
CREATE TABLE IF NOT EXISTS "songPitchPrefs" (
  "userId" INTEGER NOT NULL REFERENCES "users"("userId") ON DELETE CASCADE,
  "songId" INTEGER NOT NULL REFERENCES "songs"("songId") ON DELETE CASCADE,
  "pitchSemitones" INTEGER NOT NULL,

  -- 'assistant' | 'manual' | 'inferred'. The same distinction songCategories
  -- draws between 'auto' and 'manual', for the same reason: what a person
  -- decided must never be overwritten by what the system merely observed.
  -- 'inferred' is written automatically when a song is queued at a non-zero
  -- pitch, and is the only source the other two outrank.
  "source" TEXT NOT NULL DEFAULT 'manual',

  -- which recording the number was determined against. Not optional trivia:
  -- karaoke uploads are frequently transposed, so "-4" only means something
  -- relative to a specific track, and a song can have several.
  "mediaId" INTEGER REFERENCES "media"("mediaId") ON DELETE SET NULL,

  "dateUpdated" INTEGER NOT NULL,
  PRIMARY KEY ("userId", "songId")
);

-- the read path is always "everything this user saved", pushed on connect
CREATE INDEX IF NOT EXISTS "songPitchPrefs_userId" ON "songPitchPrefs" ("userId");

-- Down
DROP INDEX IF EXISTS "songPitchPrefs_userId";
DROP TABLE IF EXISTS "songPitchPrefs";
