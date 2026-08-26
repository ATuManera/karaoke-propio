-- Up
-- Karaoke Propio: which rooms a person is allowed into, decided by an admin.
--
-- Until now a room was guarded by its own password and nothing else: whoever
-- could type it was in, whoever could not was out, and the same secret was
-- shared by everyone in the room. That is a lock, not a guest list — it says
-- nothing about *who* may sing where, and it cannot be revoked for one person
-- without changing it for all of them.
--
-- So membership becomes a fact about the account. An admin assigns rooms; the
-- sign-in screen no longer publishes the room list to strangers; and the room
-- is chosen after the person has said who they are, from the rooms that are
-- theirs.
CREATE TABLE IF NOT EXISTS "userRooms" (
  "userId" integer NOT NULL,
  "roomId" integer NOT NULL,
  PRIMARY KEY ("userId", "roomId")
);

-- the reverse lookup, for "who may enter this room" and for cleaning up after
-- a deleted room
CREATE INDEX IF NOT EXISTS "userRooms_roomId" ON "userRooms" ("roomId");

-- Which of their rooms this person lands in when they sign in.
--
-- Nullable, and a value here is a preference rather than a promise: it is
-- honoured only while that room is still assigned and still open, and
-- otherwise the first room they have access to is used. That way a room an
-- admin revokes — or deletes — costs somebody a preference, never a sign-in.
--
-- The admin sets the first one when assigning rooms; after that it follows
-- whatever the person last chose for themselves.
ALTER TABLE "users" ADD COLUMN "preferredRoomId" integer;

-- Nobody is locked out by the upgrade: every account that exists today keeps
-- every room that exists today, and an admin narrows it from there. Rooms
-- created after this point are assigned deliberately, which is the whole
-- point of the table.
INSERT OR IGNORE INTO "userRooms" ("userId", "roomId")
  SELECT "userId", "roomId" FROM "users" CROSS JOIN "rooms";

-- Down
DROP INDEX IF EXISTS "userRooms_roomId";
DROP TABLE IF EXISTS "userRooms";
ALTER TABLE "users" DROP COLUMN "preferredRoomId";
