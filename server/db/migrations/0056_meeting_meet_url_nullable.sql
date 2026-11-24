-- A Meet link cannot be invented: only Google issues real codes. Until a host adds one the column is empty.
-- Additive for a rolling deploy: the old process always writes a value, which stays valid.
ALTER TABLE "meeting" ALTER COLUMN "google_meet_url" DROP NOT NULL;
