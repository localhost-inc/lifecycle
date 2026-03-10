ALTER TABLE terminal ADD COLUMN harness_provider TEXT;

UPDATE terminal
SET harness_provider = COALESCE(harness_provider, harness)
WHERE harness_provider IS NULL AND harness IS NOT NULL;
