use crate::shared::errors::LifecycleError;

/// Holds the resolved path to the SQLite database file.
pub struct DbPath(pub String);

pub fn open_db(db_path: &str) -> Result<rusqlite::Connection, LifecycleError> {
    let conn =
        rusqlite::Connection::open(db_path).map_err(|e| LifecycleError::Database(e.to_string()))?;
    conn.pragma_update(None, "foreign_keys", true)
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(conn)
}

pub fn run_migrations(db_path: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
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
        CREATE TABLE IF NOT EXISTS workspaces (
            id TEXT PRIMARY KEY NOT NULL,
            project_id TEXT NOT NULL REFERENCES projects(id),
            source_ref TEXT NOT NULL,
            git_sha TEXT,
            worktree_path TEXT,
            mode TEXT NOT NULL DEFAULT 'local',
            mode_state TEXT,
            status TEXT NOT NULL DEFAULT 'creating',
            failure_reason TEXT,
            failed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at TEXT
        );
        CREATE TABLE IF NOT EXISTS workspace_services (
            id TEXT PRIMARY KEY NOT NULL,
            workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
            service_name TEXT NOT NULL,
            exposure TEXT NOT NULL DEFAULT 'local',
            port_override INTEGER,
            status TEXT NOT NULL DEFAULT 'stopped',
            status_reason TEXT,
            default_port INTEGER,
            effective_port INTEGER,
            preview_state TEXT NOT NULL DEFAULT 'disabled',
            preview_failure_reason TEXT,
            preview_url TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(workspace_id, service_name)
        );",
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
}
