-- Up
-- Karaoke Propio: pitch is a property of each individual queue request,
-- never of the room. Only the requested semitone offset is durable; the
-- operational state (preparing/ready/error) is rebuilt at startup by
-- PitchManager.reconcile().
ALTER TABLE "queue" ADD COLUMN "pitchSemitones" INTEGER NOT NULL DEFAULT 0;

-- Content fingerprint of the audio actually used for pitch shifting
-- (SHA-256). Nullable for media scanned by earlier versions; computed
-- lazily on demand or on the next scan.
ALTER TABLE "media" ADD COLUMN "sourceFingerprint" TEXT;

-- Down
ALTER TABLE "queue" DROP COLUMN "pitchSemitones";
ALTER TABLE "media" DROP COLUMN "sourceFingerprint";
