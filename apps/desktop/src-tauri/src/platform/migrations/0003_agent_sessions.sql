CREATE TABLE IF NOT EXISTS agent_session (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL,
    runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('native', 'adapter')),
    runtime_name TEXT,
    backend TEXT NOT NULL CHECK (backend IN ('claude', 'codex')),
    runtime_session_id TEXT,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'idle',
        'running',
        'waiting_input',
        'waiting_approval',
        'completed',
        'failed',
        'cancelled'
    )),
    created_by TEXT,
    forked_from_session_id TEXT,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE,
    FOREIGN KEY (forked_from_session_id) REFERENCES agent_session(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_updated_at
ON agent_session(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_last_message_at
ON agent_session(workspace_id, last_message_at DESC);
