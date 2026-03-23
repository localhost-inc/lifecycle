CREATE TABLE IF NOT EXISTS project (
    id TEXT PRIMARY KEY NOT NULL,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    manifest_path TEXT NOT NULL DEFAULT 'lifecycle.json',
    manifest_valid INTEGER NOT NULL DEFAULT 0,
    organization_id TEXT,
    repository_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL REFERENCES project(id),
    name TEXT NOT NULL DEFAULT '',
    name_origin TEXT NOT NULL DEFAULT 'manual',
    source_ref TEXT NOT NULL,
    source_ref_origin TEXT NOT NULL DEFAULT 'manual',
    git_sha TEXT,
    worktree_path TEXT,
    target TEXT NOT NULL DEFAULT 'local',
    checkout_type TEXT NOT NULL DEFAULT 'worktree',
    created_by TEXT,
    source_workspace_id TEXT REFERENCES workspace(id),
    manifest_fingerprint TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    prepared_at TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    failure_reason TEXT,
    failed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_workspace_project_checkout_type ON workspace(project_id, checkout_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_project_root_unique
ON workspace(project_id)
WHERE checkout_type = 'root';

CREATE TABLE IF NOT EXISTS service (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'stopped',
    status_reason TEXT,
    assigned_port INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, name)
);

CREATE TABLE IF NOT EXISTS terminal (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    launch_type TEXT NOT NULL DEFAULT 'shell',
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

CREATE TABLE IF NOT EXISTS agent_session (
    id TEXT PRIMARY KEY NOT NULL,
    workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    runtime_kind TEXT NOT NULL CHECK (runtime_kind IN ('native', 'adapter')),
    runtime_name TEXT,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_session_id TEXT,
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
    forked_from_session_id TEXT REFERENCES agent_session(id) ON DELETE SET NULL,
    last_message_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_updated_at
ON agent_session(workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace_last_message_at
ON agent_session(workspace_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS agent_message (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    text TEXT NOT NULL DEFAULT '',
    turn_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_message_session_created_at
ON agent_message(session_id, created_at ASC);

CREATE TABLE IF NOT EXISTS agent_message_part (
    id TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL REFERENCES agent_message(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    part_index INTEGER NOT NULL DEFAULT 0,
    part_type TEXT NOT NULL,
    text TEXT,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_message_part_message
ON agent_message_part(message_id, part_index ASC);

CREATE TABLE IF NOT EXISTS agent_event (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_session_id TEXT,
    turn_id TEXT,
    event_index INTEGER NOT NULL,
    event_kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (session_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_event_session_index
ON agent_event(session_id, event_index ASC);

CREATE INDEX IF NOT EXISTS idx_agent_event_workspace_created_at
ON agent_event(workspace_id, created_at ASC);
