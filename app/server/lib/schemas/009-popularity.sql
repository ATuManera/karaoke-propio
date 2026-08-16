-- Up
-- Karaoke Propio: how popular the source recording is, so the library can be
-- ordered by it.
--
-- This is the view count of the YouTube upload a song came from. It measures
-- that particular karaoke video, not the song in the abstract — a well-known
-- song can have an obscure karaoke version and vice versa — but it is the only
-- popularity signal available for a library built this way, and in practice
-- the most-watched karaoke of a song is usually the good one.
--
-- Nullable: songs added by other means (a local file, an UltraStar pairing)
-- simply have no view count, and must sort last rather than as zero-popularity.
ALTER TABLE "media" ADD COLUMN "viewCount" INTEGER;

-- Down
ALTER TABLE "media" DROP COLUMN "viewCount";
