ALTER TABLE workspace ADD COLUMN source_ref_origin TEXT NOT NULL DEFAULT 'manual';

UPDATE workspace
SET source_ref_origin = 'manual'
WHERE source_ref_origin IS NULL OR TRIM(source_ref_origin) = '';
