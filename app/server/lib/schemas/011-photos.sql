-- Up
-- Karaoke Propio: a shared photo album per room, for the event itself.
--
-- Scoped to a room rather than global: a room is one party, and the people who
-- were there are exactly the audience for its photos. Room membership is
-- already the app's unit of "who belongs here", so it is also the right unit
-- for who may see them.
CREATE TABLE IF NOT EXISTS "photos" (
  "photoId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "roomId" INTEGER NOT NULL REFERENCES "rooms"("roomId") ON DELETE CASCADE,
  -- who uploaded it: shown as credit, and what lets someone delete their own
  "userId" INTEGER REFERENCES "users"("userId") ON DELETE SET NULL,
  -- names on disk are generated, never taken from the upload (a filename is
  -- attacker-controlled input); the original is kept only to name downloads
  "fileName" TEXT NOT NULL,
  "originalName" TEXT,
  "mimeType" TEXT NOT NULL,
  "bytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "dateCreated" INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS "photos_roomId" ON "photos" ("roomId", "dateCreated");

-- Down
DROP INDEX IF EXISTS "photos_roomId";
DROP TABLE IF EXISTS "photos";
