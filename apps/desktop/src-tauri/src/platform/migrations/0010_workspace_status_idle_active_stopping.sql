UPDATE workspace
SET status = CASE
        WHEN status = 'ready' THEN 'active'
        ELSE 'idle'
    END,
    failure_reason = CASE
        WHEN status = 'failed' THEN failure_reason
        ELSE NULL
    END,
    failed_at = CASE
        WHEN status = 'failed' THEN failed_at
        ELSE NULL
    END
WHERE status IN ('creating', 'starting', 'ready', 'resetting', 'sleeping', 'destroying', 'failed');
