PRAGMA foreign_keys=OFF;

CREATE TABLE agent_session_next (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('native', 'adapter')),
    runtime_name TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_session_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'starting',
        'idle',
        'running',
        'waiting_input',
        'waiting_approval',
        'completed',
        'failed',
        'cancelled'
    )),
    created_by TEXT,
    forked_from_session_id TEXT REFERENCES agent_session(id) ON DELETE SET NULL,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
);

INSERT INTO agent_session_next (
    id,
    workspace_id,
    runtime_kind,
    runtime_name,
    provider,
    provider_session_id,
    title,
    status,
    created_by,
    forked_from_session_id,
    last_message_at,
    created_at,
    updated_at,
    ended_at
)
SELECT
    id,
    workspace_id,
    runtime_kind,
    runtime_name,
    provider,
    provider_session_id,
    title,
    status,
    created_by,
    forked_from_session_id,
    last_message_at,
    created_at,
    updated_at,
    ended_at
FROM agent_session;

DROP TABLE agent_session;
ALTER TABLE agent_session_next RENAME TO agent_session;

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_updated_at
ON agent_session(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_last_message_at
ON agent_session(workspace_id, last_message_at DESC);

PRAGMA foreign_keys=ON;
