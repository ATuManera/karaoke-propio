-- Up
-- The review worklist now also receives songs discovered by a folder scan.
-- Keep their origin so bulk-only repair tools are not offered for ordinary
-- local filenames, while both kinds share the same review/filter workflow.
ALTER TABLE "songsPendingReview"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'bulk'
  CHECK ("origin" IN ('bulk', 'scan'));

-- Down
ALTER TABLE "songsPendingReview" DROP COLUMN "origin";
