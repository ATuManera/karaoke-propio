-- Up
-- Karaoke Propio: categories to browse by, beyond artist and title.
--
-- Many-to-many on purpose: "Flor Pálida" is legitimately Salsa AND Balada AND
-- 2010s AND Hombre AND Español at the same time, and singers look for songs by
-- any of those.
CREATE TABLE IF NOT EXISTS "categories" (
  "categoryId" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "nameNorm" TEXT NOT NULL,
  -- 'genre' | 'decade' | 'voice' | 'language'; lets the UI group filters
  -- instead of showing one flat pile of chips
  "type" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "categories_nameNorm_type" ON "categories" ("nameNorm", "type");

CREATE TABLE IF NOT EXISTS "songCategories" (
  "songId" INTEGER NOT NULL REFERENCES "songs"("songId") ON DELETE CASCADE,
  "categoryId" INTEGER NOT NULL REFERENCES "categories"("categoryId") ON DELETE CASCADE,
  -- 'auto' when derived from an online lookup, 'manual' when a person set it.
  -- Re-running enrichment must never wipe a human correction, so the two are
  -- distinguishable.
  "source" TEXT NOT NULL DEFAULT 'auto',
  PRIMARY KEY ("songId", "categoryId")
);

CREATE INDEX IF NOT EXISTS "songCategories_categoryId" ON "songCategories" ("categoryId");

-- Records that a song was already looked up, including when the lookup found
-- nothing: without it every re-run would re-query the same dead ends against a
-- rate-limited external service.
ALTER TABLE "songs" ADD COLUMN "dateCategorized" INTEGER;

-- Down
DROP INDEX IF EXISTS "songCategories_categoryId";
DROP TABLE IF EXISTS "songCategories";
DROP INDEX IF EXISTS "categories_nameNorm_type";
DROP TABLE IF EXISTS "categories";
ALTER TABLE "songs" DROP COLUMN "dateCategorized";
