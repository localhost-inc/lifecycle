-- ============================================================================
-- Lifecycle — single-file schema
-- ============================================================================

-- Projects -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project (
    id            TEXT PRIMARY KEY NOT NULL,
    path          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    manifest_path TEXT NOT NULL DEFAULT 'lifecycle.json',
    manifest_valid INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Workspaces ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workspace (
    id                   TEXT PRIMARY KEY NOT NULL,
    project_id           TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name                 TEXT NOT NULL DEFAULT '',
    name_origin          TEXT NOT NULL DEFAULT 'manual' CHECK (name_origin IN ('manual', 'default')),
    source_ref           TEXT NOT NULL,
    source_ref_origin    TEXT NOT NULL DEFAULT 'manual' CHECK (source_ref_origin IN ('manual', 'default')),
    git_sha              TEXT,
    worktree_path        TEXT,
    target               TEXT NOT NULL DEFAULT 'local' CHECK (target IN ('local', 'docker', 'remote', 'cloud')),
    checkout_type        TEXT NOT NULL DEFAULT 'worktree' CHECK (checkout_type IN ('root', 'worktree')),
    manifest_fingerprint TEXT,
    prepared_at          TEXT,
    status               TEXT NOT NULL DEFAULT 'provisioning'
                           CHECK (status IN ('provisioning', 'active', 'archiving', 'archived', 'failed')),
    failure_reason       TEXT,
    failed_at            TEXT,
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
    last_active_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workspace_project ON workspace(project_id, checkout_type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_project_root_unique
ON workspace(project_id) WHERE checkout_type = 'root';

-- Services -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS service (
    id            TEXT PRIMARY KEY NOT NULL,
    workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'stopped'
                    CHECK (status IN ('stopped', 'starting', 'ready', 'failed')),
    status_reason TEXT,
    assigned_port INTEGER,
    pid           INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(workspace_id, name)
);

-- Agent sessions -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_session (
    id                  TEXT PRIMARY KEY NOT NULL,
    workspace_id        TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_session_id TEXT,
    title               TEXT NOT NULL DEFAULT '',
    status              TEXT NOT NULL DEFAULT 'starting'
                          CHECK (status IN ('starting', 'idle', 'running', 'waiting_input',
                                            'waiting_approval', 'completed', 'failed', 'cancelled')),
    error_text          TEXT,
    last_message_at     TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_session_workspace
ON agent_session(workspace_id, created_at DESC);

-- Agent messages -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_message (
    id         TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    role       TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
    text       TEXT NOT NULL DEFAULT '',
    turn_id    TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_message_session
ON agent_message(session_id, created_at ASC);

-- Agent message parts ------------------------------------------------------

CREATE TABLE IF NOT EXISTS agent_message_part (
    id         TEXT PRIMARY KEY NOT NULL,
    message_id TEXT NOT NULL REFERENCES agent_message(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    part_index INTEGER NOT NULL DEFAULT 0,
    part_type  TEXT NOT NULL,
    text       TEXT,
    data       TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(message_id, part_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_message_part_message
ON agent_message_part(message_id, part_index ASC);

-- Agent events (replay journal) --------------------------------------------

CREATE TABLE IF NOT EXISTS agent_event (
    id                  TEXT PRIMARY KEY NOT NULL,
    session_id          TEXT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
    workspace_id        TEXT NOT NULL,
    provider            TEXT NOT NULL CHECK (provider IN ('claude', 'codex')),
    provider_session_id TEXT,
    turn_id             TEXT,
    event_index         INTEGER NOT NULL,
    event_kind          TEXT NOT NULL,
    payload             TEXT NOT NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(session_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_agent_event_session
ON agent_event(session_id, event_index ASC);

-- Plans --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plan (
    id           TEXT PRIMARY KEY NOT NULL,
    project_id   TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    workspace_id TEXT REFERENCES workspace(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    body         TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    position     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plan_project ON plan(project_id, position);

-- Tasks --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS task (
    id               TEXT PRIMARY KEY NOT NULL,
    plan_id          TEXT NOT NULL REFERENCES plan(id) ON DELETE CASCADE,
    project_id       TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    workspace_id     TEXT REFERENCES workspace(id) ON DELETE SET NULL,
    agent_session_id TEXT REFERENCES agent_session(id) ON DELETE SET NULL,
    name             TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
    priority         INTEGER NOT NULL DEFAULT 2 CHECK (priority BETWEEN 1 AND 4),
    position         INTEGER NOT NULL DEFAULT 0,
    completed_at     TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_task_plan ON task(plan_id, position);
CREATE INDEX IF NOT EXISTS idx_task_project ON task(project_id);

-- Task dependencies --------------------------------------------------------

CREATE TABLE IF NOT EXISTS task_dependency (
    task_id            TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    depends_on_task_id TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id != depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dep_reverse ON task_dependency(depends_on_task_id);
