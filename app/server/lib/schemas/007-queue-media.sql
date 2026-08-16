-- Up
-- Karaoke Propio: which VERSION of a song a singer queued.
--
-- A song can have several media (different karaoke uploads of the same track).
-- Until now the queue only stored songId and playback resolved the version via
-- MAX(isPreferred), so only ever one version was reachable — the others were
-- invisible no matter how many existed.
--
-- Nullable on purpose: rows queued before this migration (and any future row
-- that doesn't care) keep the old isPreferred-based resolution, so this is a
-- pure addition with no backfill and no behaviour change for existing entries.
ALTER TABLE "queue" ADD COLUMN "mediaId" INTEGER REFERENCES "media"("mediaId") ON DELETE SET NULL;

-- Down
ALTER TABLE "queue" DROP COLUMN "mediaId";
