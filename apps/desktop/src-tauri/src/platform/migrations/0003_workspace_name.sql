ALTER TABLE workspace ADD COLUMN name TEXT NOT NULL DEFAULT '';

UPDATE workspace
SET name = COALESCE(NULLIF(TRIM(name), ''), source_ref)
WHERE name IS NULL OR TRIM(name) = '';
