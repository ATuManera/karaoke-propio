-- Up
-- Karaoke Propio: an unguessable code identifying a room in invite links.
--
-- Invites used to carry the numeric roomId ("?roomId=1"). That is fine on a
-- private LAN and unacceptable once the app answers from the internet: the id
-- is sequential, so one invite reveals that rooms 2, 3, 4… exist. The code is
-- random, and the numeric id never leaves the server again.
--
-- Nullable at first so existing rooms survive the migration; the server fills
-- one in for every room at startup (see Rooms.ensureCodes) and rooms created
-- afterwards always get one.
ALTER TABLE "rooms" ADD COLUMN "code" TEXT;

-- Two rooms sharing a code would make an invite ambiguous. Partial so the
-- pre-backfill NULLs don't collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code" ON "rooms" ("code") WHERE "code" IS NOT NULL;

-- Down
DROP INDEX IF EXISTS "rooms_code";
ALTER TABLE "rooms" DROP COLUMN "code";
