-- Up
-- Karaoke Propio: the categorisations people got right by hand, shipped with
-- the source and consulted before anything is asked of MusicBrainz.
--
-- MusicBrainz is a good second opinion and a poor first one. Its tags are
-- crowd-edited and describe an *artist* more often than a song, so it puts
-- "80s" and "heavy metal" on The Beatles; it answers a duet with whichever
-- half of the credit it recognised (see categoryMap.ts on Marc Anthony &
-- La India); it has nothing at all to say about the karaoke uploads that make
-- up much of a real library; and it is rate limited to about one request a
-- second, so a fresh install spends minutes categorising and still ends up
-- with gaps somebody has to fill in by hand.
--
-- Somebody already did. This table is that work, extracted from a library
-- whose categories were corrected song by song, and carried into the
-- repository as a file every installation gets — so the second library never
-- repeats the first one's afternoon.
--
-- Keyed by name, never by songId: a songId means nothing on another
-- installation. `artistKey`/`titleKey` are matchKey() from categoryMap.ts,
-- which folds case, accents, punctuation and the article this app moves to the
-- end ("Beatles, The"), so a library that files them the other way still
-- matches.
--
-- The table is a cache of the shipped file, refreshed from it on every boot,
-- and holds nothing an admin has typed — editing a row here would be undone at
-- the next start. Human corrections live in songCategories with source
-- 'manual', which outranks it.
CREATE TABLE IF NOT EXISTS "categoryReference" (
  "artistKey" TEXT NOT NULL,
  "titleKey" TEXT NOT NULL,
  -- kept as they were written, for logs and for anyone reading the table
  -- directly; the keys above are what a lookup uses
  "artist" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  -- 'genre' | 'decade' | 'voice' | 'language', as in "categories"
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  PRIMARY KEY ("artistKey", "titleKey", "type", "name")
);

-- the lookup a newly found song makes: everything known about one title
CREATE INDEX IF NOT EXISTS "categoryReference_song" ON "categoryReference" ("artistKey", "titleKey");

-- Which pass put a category on a song. 'reference' joins 'auto' and 'manual':
-- a re-run of one pass must not wipe another's rows, and the three rank
-- manual > reference > auto when they disagree.
--
-- Existing rows keep their source, so nothing an admin corrected before this
-- upgrade is disturbed.

-- Down
DROP INDEX IF EXISTS "categoryReference_song";
DROP TABLE IF EXISTS "categoryReference";
