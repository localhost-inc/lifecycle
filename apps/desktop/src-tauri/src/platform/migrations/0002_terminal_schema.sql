CREATE TABLE IF NOT EXISTS terminal (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    launch_type TEXT NOT NULL DEFAULT 'shell',
    harness_provider TEXT,
    harness_session_id TEXT,
    created_by TEXT,
    label TEXT NOT NULL,
    label_origin TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'detached',
    failure_reason TEXT,
    exit_code INTEGER,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_terminal_workspace_id ON terminal(workspace_id);
CREATE INDEX IF NOT EXISTS idx_terminal_workspace_status ON terminal(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_terminal_workspace_last_active ON terminal(workspace_id, last_active_at);
