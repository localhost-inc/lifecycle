ALTER TABLE terminal
ADD COLUMN harness_launch_mode TEXT NOT NULL DEFAULT 'new';

UPDATE terminal
SET harness_launch_mode = CASE
    WHEN launch_type = 'harness'
        AND harness_session_id IS NOT NULL
        AND harness_session_id != ''
    THEN 'resume'
    ELSE 'new'
END;
