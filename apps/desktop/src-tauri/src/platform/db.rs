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
    conn.execute_batch(include_str!("migrations/0001_initial_schema.sql"))
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    conn.execute_batch(include_str!("migrations/0002_terminal_schema.sql"))
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    ensure_workspace_identity_columns(&conn)?;
    ensure_terminal_launch_columns(&conn)?;
    ensure_terminal_metadata_columns(&conn)?;
    reconcile_ephemeral_terminals(&conn)?;
    Ok(())
}

fn ensure_workspace_identity_columns(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    if !column_exists(conn, "workspace", "name") {
        conn.execute(
            "ALTER TABLE workspace ADD COLUMN name TEXT NOT NULL DEFAULT ''",
            [],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    if !column_exists(conn, "workspace", "name_origin") {
        conn.execute(
            "ALTER TABLE workspace ADD COLUMN name_origin TEXT NOT NULL DEFAULT 'manual'",
            [],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    if !column_exists(conn, "workspace", "source_ref_origin") {
        conn.execute(
            "ALTER TABLE workspace ADD COLUMN source_ref_origin TEXT NOT NULL DEFAULT 'manual'",
            [],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    conn.execute(
        "UPDATE workspace
         SET name = COALESCE(NULLIF(TRIM(name), ''), source_ref)
         WHERE name IS NULL OR TRIM(name) = ''",
        [],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    conn.execute(
        "UPDATE workspace
         SET source_ref_origin = 'manual'
         WHERE source_ref_origin IS NULL OR TRIM(source_ref_origin) = ''",
        [],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
}

fn ensure_terminal_launch_columns(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    if !column_exists(conn, "terminal", "launch_type") {
        conn.execute("ALTER TABLE terminal ADD COLUMN launch_type TEXT", [])
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    if !column_exists(conn, "terminal", "harness_provider") {
        conn.execute("ALTER TABLE terminal ADD COLUMN harness_provider TEXT", [])
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    if column_exists(conn, "terminal", "harness") {
        conn.execute(
            "UPDATE terminal
             SET harness_provider = COALESCE(harness_provider, harness)
             WHERE harness_provider IS NULL AND harness IS NOT NULL",
            [],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    conn.execute(
        "UPDATE terminal
         SET launch_type = CASE
             WHEN COALESCE(harness_provider, '') != '' THEN 'harness'
             ELSE 'shell'
         END
         WHERE launch_type IS NULL OR launch_type = ''",
        [],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
}

fn ensure_terminal_metadata_columns(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    if !column_exists(conn, "terminal", "label_origin") {
        conn.execute(
            "ALTER TABLE terminal ADD COLUMN label_origin TEXT NOT NULL DEFAULT 'manual'",
            [],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    Ok(())
}

fn column_exists(conn: &rusqlite::Connection, table: &str, column: &str) -> bool {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .expect("prepare table info");
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .expect("query table info");

    let exists = rows.flatten().any(|name| name == column);
    exists
}

fn reconcile_ephemeral_terminals(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    conn.execute(
        "UPDATE terminal
         SET status = 'sleeping',
             failure_reason = NULL,
             exit_code = NULL,
             ended_at = NULL,
             last_active_at = datetime('now')
         WHERE status IN ('active', 'detached', 'sleeping')",
        [],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db_path() -> String {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-db-migrations-{}.db",
            uuid::Uuid::new_v4()
        ));
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn run_migrations_is_idempotent() {
        let db_path = temp_db_path();

        run_migrations(&db_path).expect("first migration run succeeds");
        run_migrations(&db_path).expect("second migration run succeeds");

        let conn = open_db(&db_path).expect("open db");
        assert!(column_exists(&conn, "workspace", "created_by"));
        assert!(column_exists(&conn, "workspace", "name"));
        assert!(column_exists(&conn, "workspace", "name_origin"));
        assert!(column_exists(&conn, "workspace", "source_ref_origin"));
        assert!(column_exists(&conn, "workspace", "source_workspace_id"));
        assert!(column_exists(&conn, "workspace", "setup_completed_at"));
        assert!(column_exists(&conn, "terminal", "workspace_id"));
        assert!(column_exists(&conn, "terminal", "launch_type"));
        assert!(column_exists(&conn, "terminal", "harness_provider"));
        assert!(column_exists(&conn, "terminal", "label_origin"));
        assert!(column_exists(&conn, "terminal", "status"));
        assert!(!column_exists(&conn, "workspace", "mode_state"));

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn run_migrations_reconciles_stale_terminals() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("migration run succeeds");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path, status)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "main",
                "/tmp/project_1/worktree",
                "ready"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO terminal (id, workspace_id, label, status)
             VALUES (?1, ?2, ?3, ?4), (?5, ?6, ?7, ?8), (?9, ?10, ?11, ?12)",
            rusqlite::params![
                "terminal_active",
                "workspace_1",
                "Terminal 1",
                "active",
                "terminal_detached",
                "workspace_1",
                "Terminal 2",
                "detached",
                "terminal_finished",
                "workspace_1",
                "Terminal 3",
                "finished"
            ],
        )
        .expect("insert terminals");
        drop(conn);

        run_migrations(&db_path).expect("second migration run succeeds");

        let values = {
            let conn = open_db(&db_path).expect("re-open db");
            let mut stmt = conn
                .prepare(
                    "SELECT id, status, failure_reason, ended_at
                     FROM terminal
                     ORDER BY id",
                )
                .expect("prepare select");
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                })
                .expect("query terminals");

            rows.map(|row| row.expect("row"))
                .collect::<Vec<(String, String, Option<String>, Option<String>)>>()
        };

        assert_eq!(values.len(), 3);
        assert_eq!(values[0].0, "terminal_active");
        assert_eq!(values[0].1, "sleeping");
        assert!(values[0].2.is_none());
        assert!(values[0].3.is_none());

        assert_eq!(values[1].0, "terminal_detached");
        assert_eq!(values[1].1, "sleeping");
        assert!(values[1].2.is_none());
        assert!(values[1].3.is_none());

        assert_eq!(values[2].0, "terminal_finished");
        assert_eq!(values[2].1, "finished");
        assert!(values[2].2.is_none());
        assert!(values[2].3.is_none());
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn run_migrations_backfills_terminal_launch_columns_from_legacy_harness_data() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(include_str!("migrations/0001_initial_schema.sql"))
            .expect("seed workspace schema");
        conn.execute_batch(
            "CREATE TABLE terminal (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                harness TEXT,
                harness_session_id TEXT,
                created_by TEXT,
                label TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'detached',
                failure_reason TEXT,
                exit_code INTEGER,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                last_active_at TEXT NOT NULL DEFAULT (datetime('now')),
                ended_at TEXT
            );",
        )
        .expect("seed legacy terminal schema");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path, status)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "main",
                "/tmp/project_1/worktree",
                "ready"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO terminal (id, workspace_id, harness, label, status)
             VALUES (?1, ?2, ?3, ?4, ?5), (?6, ?7, NULL, ?8, ?9)",
            rusqlite::params![
                "terminal_harness",
                "workspace_1",
                "codex",
                "Codex · Session 1",
                "detached",
                "terminal_shell",
                "workspace_1",
                "Terminal 2",
                "detached"
            ],
        )
        .expect("insert terminals");
        drop(conn);

        run_migrations(&db_path).expect("upgrade migration succeeds");

        let conn = open_db(&db_path).expect("open upgraded db");
        let mut stmt = conn
            .prepare(
                "SELECT id, launch_type, harness_provider
                 FROM terminal
                 ORDER BY id",
            )
            .expect("prepare select");
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .expect("query upgraded terminals");
        let values = rows
            .map(|row| row.expect("row"))
            .collect::<Vec<(String, String, Option<String>)>>();

        assert_eq!(
            values,
            vec![
                (
                    "terminal_harness".to_string(),
                    "harness".to_string(),
                    Some("codex".to_string())
                ),
                ("terminal_shell".to_string(), "shell".to_string(), None),
            ]
        );
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn run_migrations_backfills_workspace_source_ref_origin_to_manual() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                name_origin TEXT NOT NULL DEFAULT 'manual',
                source_ref TEXT NOT NULL
            );",
        )
        .expect("seed legacy workspace schema");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Legacy Workspace",
                "manual",
                "lifecycle/legacy-workspace"
            ],
        )
        .expect("insert workspace");
        drop(conn);

        run_migrations(&db_path).expect("upgrade migration succeeds");

        let conn = open_db(&db_path).expect("open upgraded db");
        let source_ref_origin: String = conn
            .query_row(
                "SELECT source_ref_origin FROM workspace WHERE id = ?1",
                rusqlite::params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("query source ref origin");
        assert_eq!(source_ref_origin, "manual");

        let _ = std::fs::remove_file(db_path);
    }
}
