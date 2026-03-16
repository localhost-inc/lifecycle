use crate::platform::diagnostics;
use crate::shared::errors::LifecycleError;
use std::time::Instant;

const MIGRATIONS: [(&str, &str); 5] = [
    (
        "0001_initial_schema",
        include_str!("migrations/0001_initial_schema.sql"),
    ),
    (
        "0002_terminal_schema",
        include_str!("migrations/0002_terminal_schema.sql"),
    ),
    (
        "0003_workspace_kind",
        include_str!("migrations/0003_workspace_kind.sql"),
    ),
    (
        "0004_terminal_harness_launch_mode",
        include_str!("migrations/0004_terminal_harness_launch_mode.sql"),
    ),
    (
        "0005_terminal_harness_launch_config",
        include_str!("migrations/0005_terminal_harness_launch_config.sql"),
    ),
];

/// Holds the resolved path to the SQLite database file.
pub struct DbPath(pub String);

pub fn database_error(error: impl std::fmt::Display) -> LifecycleError {
    LifecycleError::Database(error.to_string())
}

pub fn map_database_result<T>(result: rusqlite::Result<T>) -> Result<T, LifecycleError> {
    result.map_err(database_error)
}

pub fn optional_database_result<T>(
    result: rusqlite::Result<T>,
) -> Result<Option<T>, LifecycleError> {
    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(database_error(error)),
    }
}

pub fn open_db(db_path: &str) -> Result<rusqlite::Connection, LifecycleError> {
    let conn = map_database_result(rusqlite::Connection::open(db_path))?;
    map_database_result(conn.pragma_update(None, "foreign_keys", true))?;
    Ok(conn)
}

pub async fn run_blocking_db_read<T, F>(
    db_path: String,
    label: &'static str,
    task: F,
) -> Result<T, LifecycleError>
where
    T: Send + 'static,
    F: FnOnce(&rusqlite::Connection) -> Result<T, LifecycleError> + Send + 'static,
{
    let started_at = Instant::now();
    let result = tokio::task::spawn_blocking(move || {
        let conn = open_db(&db_path)?;
        task(&conn)
    })
    .await
    .map_err(|error| {
        LifecycleError::Database(format!("blocking database task '{label}' failed: {error}"))
    })?;

    if diagnostics::performance_diagnostics_enabled() {
        let status = if result.is_ok() { "ok" } else { "error" };
        diagnostics::append_diagnostic(
            "db-query",
            &format!("{label} {status} in {}ms", started_at.elapsed().as_millis()),
        );
    }

    result
}

pub fn run_migrations(db_path: &str) -> Result<(), LifecycleError> {
    let mut conn = open_db(db_path)?;
    initialize_migration_table(&conn)?;

    for (version, sql) in MIGRATIONS {
        apply_migration(&mut conn, version, sql)?;
    }

    reconcile_workspace_environments(&conn)?;
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
    .map_err(database_error)?;

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
        .map_err(database_error)?;
    if already_applied > 0 {
        return Ok(());
    }

    let tx = conn.transaction().map_err(database_error)?;
    tx.execute_batch(sql)
        .map_err(|error| database_error(format!("migration {version} failed: {error}")))?;
    tx.execute(
        "INSERT INTO schema_migration (version) VALUES (?1)",
        [version],
    )
    .map_err(database_error)?;
    tx.commit().map_err(database_error)?;

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
    .map_err(database_error)?;

    Ok(())
}

fn reconcile_workspace_environments(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, status FROM workspace WHERE status IN ('starting', 'active', 'stopping')",
        )
        .map_err(database_error)?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(database_error)?;

    let mut reconciled = Vec::new();
    for row in rows {
        reconciled.push(row.map_err(database_error)?);
    }
    drop(stmt);

    for (workspace_id, previous_status) in reconciled {
        let failure_reason = match previous_status.as_str() {
            "active" | "starting" => Some("local_app_not_running"),
            _ => None,
        };

        if let Some(failure_reason) = failure_reason {
            conn.execute(
                "UPDATE workspace
                 SET status = 'idle',
                     failure_reason = ?1,
                     failed_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?2",
                rusqlite::params![failure_reason, workspace_id],
            )
            .map_err(database_error)?;
        } else {
            conn.execute(
                "UPDATE workspace
                 SET status = 'idle',
                     failure_reason = NULL,
                     failed_at = NULL,
                     updated_at = datetime('now')
                 WHERE id = ?1",
                rusqlite::params![workspace_id],
            )
            .map_err(database_error)?;
        }

        conn.execute(
            "UPDATE workspace_service
             SET status = CASE WHEN status = 'failed' THEN status ELSE 'stopped' END,
                 status_reason = CASE WHEN status = 'failed' THEN status_reason ELSE NULL END,
                 preview_status = CASE
                     WHEN status = 'failed' THEN 'failed'
                     WHEN exposure = 'local' AND effective_port IS NOT NULL THEN 'sleeping'
                     ELSE 'disabled'
                 END,
                 preview_failure_reason = CASE
                     WHEN status = 'failed' THEN 'service_unreachable'
                     ELSE NULL
                 END,
                 preview_url = CASE
                     WHEN exposure = 'local' AND effective_port IS NOT NULL THEN 'http://127.0.0.1:' || effective_port
                     ELSE NULL
                 END,
                 updated_at = datetime('now')
            WHERE workspace_id = ?1",
            rusqlite::params![workspace_id],
        )
        .map_err(database_error)?;
    }

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
        assert!(column_exists(&conn, "terminal", "harness_launch_config"));
        assert!(column_exists(&conn, "workspace", "name_origin"));
        assert!(column_exists(&conn, "workspace", "source_ref_origin"));
        assert!(column_exists(&conn, "workspace", "source_workspace_id"));
        assert!(column_exists(&conn, "workspace", "kind"));
        assert!(column_exists(&conn, "workspace", "setup_completed_at"));
        assert!(column_exists(&conn, "workspace", "manifest_fingerprint"));
        assert!(column_exists(&conn, "workspace_service", "preview_status"));
        assert!(column_exists(&conn, "terminal", "workspace_id"));
        assert!(column_exists(&conn, "terminal", "launch_type"));
        assert!(column_exists(&conn, "terminal", "harness_provider"));
        assert!(column_exists(&conn, "terminal", "harness_launch_mode"));
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
                "0003_workspace_kind".to_string(),
                "0004_terminal_harness_launch_mode".to_string(),
                "0005_terminal_harness_launch_config".to_string(),
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
    fn run_migrations_backfills_harness_launch_mode_for_existing_sessions() {
        let db_path = temp_db_path();
        let mut conn = open_db(&db_path).expect("open db");
        initialize_migration_table(&conn).expect("initialize migration table");
        apply_migration(
            &mut conn,
            "0001_initial_schema",
            include_str!("migrations/0001_initial_schema.sql"),
        )
        .expect("apply initial schema");
        apply_migration(
            &mut conn,
            "0002_terminal_schema",
            include_str!("migrations/0002_terminal_schema.sql"),
        )
        .expect("apply terminal schema");
        apply_migration(
            &mut conn,
            "0003_workspace_kind",
            include_str!("migrations/0003_workspace_kind.sql"),
        )
        .expect("apply workspace kind schema");

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
            "INSERT INTO terminal (id, workspace_id, launch_type, harness_provider, harness_session_id, label, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "terminal_1",
                "workspace_1",
                "harness",
                "claude",
                "session-123",
                "Claude · Session 1",
                "sleeping"
            ],
        )
        .expect("insert legacy harness terminal");
        drop(conn);

        run_migrations(&db_path).expect("migration backfill succeeds");

        let conn = open_db(&db_path).expect("reopen db");
        let launch_mode: String = conn
            .query_row(
                "SELECT harness_launch_mode FROM terminal WHERE id = ?1",
                rusqlite::params!["terminal_1"],
                |row| row.get(0),
            )
            .expect("query launch mode");
        assert_eq!(launch_mode, "resume");

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn run_migrations_reconciles_stale_workspace_environments() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("migration run succeeds");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_2", "/tmp/project_2", "Project 2"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path, status)
             VALUES (?1, ?2, ?3, ?4, ?5), (?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                "workspace_active",
                "project_2",
                "main",
                "/tmp/project_2/worktree-active",
                "active",
                "workspace_stopping",
                "project_2",
                "main",
                "/tmp/project_2/worktree-stopping",
                "stopping"
            ],
        )
        .expect("insert workspaces");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status, status_reason, default_port,
                effective_port, preview_status, preview_failure_reason, preview_url, created_at, updated_at
            ) VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now')),
                (?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, datetime('now'), datetime('now')),
                (?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, datetime('now'), datetime('now'))",
            rusqlite::params![
                "service_ready",
                "workspace_active",
                "web",
                "local",
                "ready",
                Option::<String>::None,
                Some(3000_i64),
                Some(3000_i64),
                "ready",
                Option::<String>::None,
                Some("http://127.0.0.1:3000"),
                "service_failed",
                "workspace_active",
                "api",
                "local",
                "failed",
                Some("service_port_unreachable"),
                Some(3001_i64),
                Some(3001_i64),
                "failed",
                Some("service_unreachable"),
                Some("http://127.0.0.1:3001"),
                "service_stopping",
                "workspace_stopping",
                "worker",
                "internal",
                "starting",
                Option::<String>::None,
                Some(4173_i64),
                Some(4173_i64),
                "provisioning",
                Option::<String>::None,
                Option::<String>::None
            ],
        )
        .expect("insert workspace services");
        drop(conn);

        run_migrations(&db_path).expect("second migration run succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let workspace_rows = {
            let mut stmt = conn
                .prepare(
                    "SELECT id, status, failure_reason
                     FROM workspace
                     ORDER BY id",
                )
                .expect("prepare workspace query");
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                    ))
                })
                .expect("query workspaces");
            rows.map(|row| row.expect("row")).collect::<Vec<_>>()
        };
        assert_eq!(
            workspace_rows,
            vec![
                (
                    "workspace_active".to_string(),
                    "idle".to_string(),
                    Some("local_app_not_running".to_string()),
                ),
                ("workspace_stopping".to_string(), "idle".to_string(), None,),
            ]
        );

        let service_rows = {
            let mut stmt = conn
                .prepare(
                    "SELECT workspace_id, service_name, status, status_reason, preview_status, preview_failure_reason
                     FROM workspace_service
                     ORDER BY workspace_id, service_name",
                )
                .expect("prepare service query");
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                })
                .expect("query services");
            rows.map(|row| row.expect("row")).collect::<Vec<_>>()
        };
        assert_eq!(
            service_rows,
            vec![
                (
                    "workspace_active".to_string(),
                    "api".to_string(),
                    "failed".to_string(),
                    Some("service_port_unreachable".to_string()),
                    "failed".to_string(),
                    Some("service_unreachable".to_string()),
                ),
                (
                    "workspace_active".to_string(),
                    "web".to_string(),
                    "stopped".to_string(),
                    None,
                    "sleeping".to_string(),
                    None,
                ),
                (
                    "workspace_stopping".to_string(),
                    "worker".to_string(),
                    "stopped".to_string(),
                    None,
                    "disabled".to_string(),
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn run_migrations_enforces_single_root_workspace_per_project() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("migration run succeeds");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_root", "/tmp/project_root", "Project Root"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, kind, source_ref, status)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["workspace_root_1", "project_root", "root", "main", "idle"],
        )
        .expect("insert first root workspace");
        conn.execute(
            "INSERT INTO workspace (id, project_id, kind, source_ref, status)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![
                "workspace_managed",
                "project_root",
                "managed",
                "lifecycle/managed",
                "idle"
            ],
        )
        .expect("insert managed workspace");

        let second_root_error = conn
            .execute(
                "INSERT INTO workspace (id, project_id, kind, source_ref, status)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                rusqlite::params![
                    "workspace_root_2",
                    "project_root",
                    "root",
                    "develop",
                    "idle"
                ],
            )
            .expect_err("second root workspace should violate unique index");

        assert!(
            second_root_error
                .to_string()
                .contains("UNIQUE constraint failed: workspace.project_id"),
            "expected root uniqueness violation, got: {second_root_error}"
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn run_blocking_db_read_uses_opened_connection() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("migration run succeeds");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        drop(conn);

        let project_name = run_blocking_db_read(db_path.clone(), "db.test.read", |conn| {
            conn.query_row(
                "SELECT name FROM project WHERE id = ?1",
                rusqlite::params!["project_1"],
                |row| row.get::<_, String>(0),
            )
            .map_err(LifecycleError::from)
        })
        .await
        .expect("read project name");

        assert_eq!(project_name, "Project 1");

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn run_blocking_db_read_preserves_typed_errors() {
        let db_path = temp_db_path();

        let error = run_blocking_db_read(db_path.clone(), "db.test.typed_error", |_conn| {
            Err::<String, LifecycleError>(LifecycleError::WorkspaceNotFound(
                "workspace_missing".to_string(),
            ))
        })
        .await
        .expect_err("expected typed error");

        assert!(matches!(
            error,
            LifecycleError::WorkspaceNotFound(workspace_id) if workspace_id == "workspace_missing"
        ));

        let _ = std::fs::remove_file(db_path);
    }
}
