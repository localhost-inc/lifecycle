use crate::shared::errors::LifecycleError;

const MIGRATIONS: [(&str, &str); 11] = [
    (
        "0001_initial_schema",
        include_str!("migrations/0001_initial_schema.sql"),
    ),
    (
        "0002_terminal_schema",
        include_str!("migrations/0002_terminal_schema.sql"),
    ),
    (
        "0003_workspace_name",
        include_str!("migrations/0003_workspace_name.sql"),
    ),
    (
        "0004_workspace_name_origin",
        include_str!("migrations/0004_workspace_name_origin.sql"),
    ),
    (
        "0005_workspace_source_ref_origin",
        include_str!("migrations/0005_workspace_source_ref_origin.sql"),
    ),
    (
        "0006_terminal_launch_type",
        include_str!("migrations/0006_terminal_launch_type.sql"),
    ),
    (
        "0007_terminal_harness_provider",
        include_str!("migrations/0007_terminal_harness_provider.sql"),
    ),
    (
        "0008_terminal_label_origin",
        include_str!("migrations/0008_terminal_label_origin.sql"),
    ),
    (
        "0009_workspace_manifest_fingerprint",
        include_str!("migrations/0009_workspace_manifest_fingerprint.sql"),
    ),
    (
        "0010_workspace_status_idle_active_stopping",
        include_str!("migrations/0010_workspace_status_idle_active_stopping.sql"),
    ),
    (
        "0011_workspace_service_preview_status",
        include_str!("migrations/0011_workspace_service_preview_status.sql"),
    ),
];

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
    let mut conn = open_db(db_path)?;
    initialize_migration_table(&conn)?;

    for (version, sql) in MIGRATIONS {
        apply_migration(&mut conn, version, sql)?;
    }

    reconcile_ephemeral_terminals(&conn)?;
    Ok(())
}

fn initialize_migration_table(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migration (
            version TEXT PRIMARY KEY NOT NULL,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
}

fn apply_migration(
    conn: &mut rusqlite::Connection,
    version: &str,
    sql: &str,
) -> Result<(), LifecycleError> {
    let already_applied: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_migration WHERE version = ?1",
            [version],
            |row| row.get(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    if already_applied > 0 {
        return Ok(());
    }

    let tx = conn
        .transaction()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    tx.execute_batch(sql)
        .map_err(|e| LifecycleError::Database(format!("migration {version} failed: {e}")))?;
    tx.execute(
        "INSERT INTO schema_migration (version) VALUES (?1)",
        [version],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    tx.commit()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(())
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
        assert!(column_exists(&conn, "workspace", "manifest_fingerprint"));
        assert!(column_exists(&conn, "workspace_service", "preview_status"));
        assert!(column_exists(&conn, "terminal", "workspace_id"));
        assert!(column_exists(&conn, "terminal", "launch_type"));
        assert!(column_exists(&conn, "terminal", "harness_provider"));
        assert!(column_exists(&conn, "terminal", "label_origin"));
        assert!(column_exists(&conn, "terminal", "status"));
        assert!(!column_exists(&conn, "workspace_service", "preview_state"));
        assert!(!column_exists(&conn, "workspace", "mode_state"));
        let versions = {
            let mut stmt = conn
                .prepare("SELECT version FROM schema_migration ORDER BY version")
                .expect("prepare migration select");
            let rows = stmt
                .query_map([], |row| row.get::<_, String>(0))
                .expect("query migrations");
            rows.map(|row| row.expect("migration row"))
                .collect::<Vec<String>>()
        };
        assert_eq!(
            versions,
            vec![
                "0001_initial_schema".to_string(),
                "0002_terminal_schema".to_string(),
                "0003_workspace_name".to_string(),
                "0004_workspace_name_origin".to_string(),
                "0005_workspace_source_ref_origin".to_string(),
                "0006_terminal_launch_type".to_string(),
                "0007_terminal_harness_provider".to_string(),
                "0008_terminal_label_origin".to_string(),
                "0009_workspace_manifest_fingerprint".to_string(),
                "0010_workspace_status_idle_active_stopping".to_string(),
                "0011_workspace_service_preview_status".to_string(),
            ]
        );

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
                "active"
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
                "active"
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
        initialize_migration_table(&conn).expect("initialize migration table");
        conn.execute_batch(include_str!("migrations/0001_initial_schema.sql"))
            .expect("seed workspace schema");
        conn.execute_batch(include_str!("migrations/0003_workspace_name.sql"))
            .expect("apply workspace name migration");
        conn.execute_batch(include_str!("migrations/0004_workspace_name_origin.sql"))
            .expect("apply workspace name origin migration");
        conn.execute(
            "INSERT INTO schema_migration (version) VALUES (?1), (?2), (?3)",
            rusqlite::params![
                "0001_initial_schema",
                "0003_workspace_name",
                "0004_workspace_name_origin"
            ],
        )
        .expect("record applied migrations");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
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

    #[test]
    fn workspace_status_migration_sql_renames_legacy_statuses() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("run migrations");
        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref, source_ref_origin, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "workspace_active",
                "project_1",
                "Workspace Active",
                "manual",
                "lifecycle/workspace-active",
                "manual",
                "ready",
            ],
        )
        .expect("insert ready workspace");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref, source_ref_origin, status, failure_reason, failed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                "workspace_failed",
                "project_1",
                "Workspace Failed",
                "manual",
                "lifecycle/workspace-failed",
                "manual",
                "failed",
                "service_start_failed",
                "2026-03-10T00:00:00Z",
            ],
        )
        .expect("insert failed workspace");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref, source_ref_origin, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "workspace_sleeping",
                "project_1",
                "Workspace Sleeping",
                "manual",
                "lifecycle/workspace-sleeping",
                "manual",
                "sleeping",
            ],
        )
        .expect("insert sleeping workspace");
        conn.execute_batch(include_str!("migrations/0010_workspace_status_idle_active_stopping.sql"))
            .expect("apply status rename sql");

        let mut stmt = conn
            .prepare(
                "SELECT id, status, failure_reason, failed_at
                 FROM workspace
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
            .expect("query workspaces");
        let values = rows
            .map(|row| row.expect("row"))
            .collect::<Vec<(String, String, Option<String>, Option<String>)>>();

        assert_eq!(
            values,
            vec![
                (
                    "workspace_active".to_string(),
                    "active".to_string(),
                    None,
                    None,
                ),
                (
                    "workspace_failed".to_string(),
                    "idle".to_string(),
                    Some("service_start_failed".to_string()),
                    Some("2026-03-10T00:00:00Z".to_string()),
                ),
                (
                    "workspace_sleeping".to_string(),
                    "idle".to_string(),
                    None,
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn workspace_service_preview_status_migration_sql_renames_preview_state_column() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(include_str!("migrations/0001_initial_schema.sql"))
            .expect("seed initial schema");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, status)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["workspace_1", "project_1", "main", "creating"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (id, workspace_id, service_name, preview_state)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["service_1", "workspace_1", "web", "provisioning"],
        )
        .expect("insert workspace service");

        conn.execute_batch(include_str!("migrations/0011_workspace_service_preview_status.sql"))
            .expect("apply preview status rename sql");

        assert!(column_exists(&conn, "workspace_service", "preview_status"));
        assert!(!column_exists(&conn, "workspace_service", "preview_state"));
        let preview_status: String = conn
            .query_row(
                "SELECT preview_status FROM workspace_service WHERE id = ?1",
                rusqlite::params!["service_1"],
                |row| row.get(0),
            )
            .expect("query preview status");
        assert_eq!(preview_status, "provisioning");

        let _ = std::fs::remove_file(db_path);
    }
}
