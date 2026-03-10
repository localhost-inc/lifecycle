ALTER TABLE terminal ADD COLUMN launch_type TEXT;

UPDATE terminal
SET launch_type = CASE
    WHEN COALESCE(harness, '') != '' THEN 'harness'
    ELSE 'shell'
END
WHERE launch_type IS NULL OR launch_type = '';
