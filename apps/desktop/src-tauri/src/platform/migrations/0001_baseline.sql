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
    target TEXT NOT NULL DEFAULT 'host',
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
    harness_provider TEXT,
    harness_session_id TEXT,
    harness_launch_mode TEXT NOT NULL DEFAULT 'new',
    harness_launch_config TEXT,
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
