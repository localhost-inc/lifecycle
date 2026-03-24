use crate::platform::diagnostics;
use crate::shared::errors::LifecycleError;
use std::time::Instant;
use tauri_plugin_sql::{Migration, MigrationKind};

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "baseline",
            sql: include_str!("migrations/0001_baseline.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "agent session starting status",
            sql: include_str!("migrations/0002_agent-session-starting.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

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
    map_database_result(conn.pragma_update(None, "journal_mode", "WAL"))?;
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

/// Applies all migration SQL directly for test databases. In production,
/// `tauri-plugin-sql` handles migration execution and tracking.
#[cfg(test)]
pub fn apply_test_schema(db_path: &str) {
    let conn = open_db(db_path).expect("open db for test schema");
    for m in migrations() {
        conn.execute_batch(m.sql)
            .expect(&format!("apply test migration {}", m.description));
    }
}

/// Resets ephemeral workspace/terminal/service state that may be stale after a
/// previous crash (where `cleanup_for_exit` never ran). Schema migrations are
/// handled by `tauri-plugin-sql` via `Builder::add_migrations`.
pub fn reconcile_on_startup(db_path: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    reconcile_workspaces(&conn)?;
    reconcile_ephemeral_terminals(&conn)?;
    Ok(())
}

/// Resets ephemeral execution state in the database before the application exits.
pub fn cleanup_for_exit(db_path: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    mark_interrupted_workspaces(&conn)?;

    conn.execute(
        "UPDATE service
         SET status = 'stopped',
             status_reason = NULL,
             assigned_port = NULL,
             updated_at = datetime('now')
         WHERE status NOT IN ('stopped', 'failed')",
        [],
    )
    .map_err(database_error)?;

    conn.execute(
        "UPDATE terminal
         SET status = 'sleeping',
             failure_reason = NULL,
             exit_code = NULL,
             ended_at = NULL,
             last_active_at = datetime('now')
         WHERE status IN ('active', 'detached')",
        [],
    )
    .map_err(database_error)?;

    Ok(())
}

fn reconcile_ephemeral_terminals(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    conn.execute(
        "UPDATE terminal
         SET status = 'sleeping',
             failure_reason = NULL,
             exit_code = NULL,
             ended_at = NULL
        WHERE status IN ('active', 'detached', 'sleeping')",
        [],
    )
    .map_err(database_error)?;

    Ok(())
}

fn reconcile_workspaces(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    mark_interrupted_workspaces(conn)?;
    conn.execute(
        "UPDATE service
         SET status = 'stopped',
             status_reason = NULL,
             assigned_port = NULL,
             updated_at = datetime('now')
         WHERE status != 'stopped'",
        [],
    )
    .map_err(database_error)?;
    Ok(())
}

fn mark_interrupted_workspaces(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT workspace.id
             FROM workspace
             WHERE workspace.status = 'preparing'
                OR EXISTS (
                    SELECT 1
                    FROM service
                    WHERE service.workspace_id = workspace.id
                      AND service.status IN ('starting', 'ready')
                )",
        )
        .map_err(database_error)?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(database_error)?;

    let mut reconciled = Vec::new();
    for row in rows {
        reconciled.push(row.map_err(database_error)?);
    }
    drop(stmt);

    for workspace_id in reconciled {
        conn.execute(
            "UPDATE workspace
             SET status = 'active',
                 failure_reason = 'local_app_not_running',
                 failed_at = datetime('now'),
                 updated_at = datetime('now')
             WHERE id = ?1",
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
        let path =
            std::env::temp_dir().join(format!("lifecycle-db-test-{}.db", uuid::Uuid::new_v4()));
        path.to_string_lossy().into_owned()
    }

    #[test]
    fn reconcile_on_startup_resets_stale_terminals() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "main",
                "/tmp/project_1/worktree"
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

        reconcile_on_startup(&db_path).expect("reconcile succeeds");

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
    fn reconcile_on_startup_resets_interrupted_workspaces() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_2", "/tmp/project_2", "Project 2"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, source_ref, worktree_path, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6), (?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                "workspace_started",
                "project_2",
                "Started",
                "main",
                "/tmp/project_2/worktree-active",
                "active",
                "workspace_stopping",
                "project_2",
                "Stopping",
                "main",
                "/tmp/project_2/worktree-stopping",
                "active",
            ],
        )
        .expect("insert workspaces");
        conn.execute(
            "INSERT INTO service (
                id, workspace_id, name, status, status_reason,
                assigned_port, created_at, updated_at
            ) VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now')),
                (?7, ?8, ?9, ?10, ?11, ?12, datetime('now'), datetime('now')),
                (?13, ?14, ?15, ?16, ?17, ?18, datetime('now'), datetime('now'))",
            rusqlite::params![
                "service_ready",
                "workspace_started",
                "web",
                "ready",
                Option::<String>::None,
                Some(3000_i64),
                "service_failed",
                "workspace_started",
                "api",
                "failed",
                Some("service_port_unreachable"),
                Some(3001_i64),
                "service_stopping",
                "workspace_stopping",
                "worker",
                "starting",
                Option::<String>::None,
                Some(4173_i64),
            ],
        )
        .expect("insert services");
        drop(conn);

        reconcile_on_startup(&db_path).expect("reconcile succeeds");

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
                    "workspace_started".to_string(),
                    "active".to_string(),
                    Some("local_app_not_running".to_string()),
                ),
                (
                    "workspace_stopping".to_string(),
                    "active".to_string(),
                    Some("local_app_not_running".to_string()),
                ),
            ]
        );

        let service_rows = {
            let mut stmt = conn
                .prepare(
                    "SELECT workspace_id, name, status, status_reason, assigned_port
                     FROM service
                     ORDER BY workspace_id, name",
                )
                .expect("prepare service query");
            let rows = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<i64>>(4)?,
                    ))
                })
                .expect("query services");
            rows.map(|row| row.expect("row")).collect::<Vec<_>>()
        };
        assert_eq!(
            service_rows,
            vec![
                (
                    "workspace_started".to_string(),
                    "api".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
                (
                    "workspace_started".to_string(),
                    "web".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
                (
                    "workspace_stopping".to_string(),
                    "worker".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn run_blocking_db_read_uses_opened_connection() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

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

    #[test]
    fn all_migration_files_are_registered() {
        let registered = migrations();
        let migration_dir =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/platform/migrations");
        let sql_files: Vec<String> = std::fs::read_dir(&migration_dir)
            .unwrap_or_else(|e| panic!("read migrations dir {}: {e}", migration_dir.display()))
            .filter_map(|entry| {
                let entry = entry.ok()?;
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".sql") {
                    Some(name)
                } else {
                    None
                }
            })
            .collect();

        assert_eq!(
            registered.len(),
            sql_files.len(),
            "Migration count mismatch: {} registered in db.rs but {} .sql files in migrations/.\n\
             Registered: {:?}\n\
             SQL files: {:?}",
            registered.len(),
            sql_files.len(),
            registered.iter().map(|m| m.description).collect::<Vec<_>>(),
            {
                let mut sorted = sql_files.clone();
                sorted.sort();
                sorted
            },
        );

        // Verify versions are sequential with no gaps.
        let mut versions: Vec<i64> = registered.iter().map(|m| m.version).collect();
        versions.sort();
        for (i, version) in versions.iter().enumerate() {
            assert_eq!(
                *version,
                (i + 1) as i64,
                "Migration versions must be sequential. Expected version {} at position {}, got {}.",
                i + 1,
                i,
                version,
            );
        }
    }

    #[test]
    fn apply_test_schema_creates_bootable_agent_schema() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_agent", "/tmp/project-agent", "Project Agent"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![
                "workspace_agent",
                "project_agent",
                "main",
                "/tmp/project-agent/worktree"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO agent_session (
                id, workspace_id, runtime_kind, runtime_name, provider, provider_session_id,
                title, status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))",
            rusqlite::params![
                "session_agent",
                "workspace_agent",
                "native",
                Option::<String>::None,
                "codex",
                "thread_123",
                "Agent Session",
                "idle",
            ],
        )
        .expect("insert agent session");
        conn.execute(
            "INSERT INTO agent_message (
                id, session_id, role, text, turn_id, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            rusqlite::params![
                "message_agent",
                "session_agent",
                "assistant",
                "",
                "turn_123",
            ],
        )
        .expect("insert agent message");
        conn.execute(
            "INSERT INTO agent_message_part (
                id, message_id, session_id, part_index, part_type, text, data, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            rusqlite::params![
                "part_agent",
                "message_agent",
                "session_agent",
                0,
                "artifact_ref",
                Option::<String>::None,
                "{\"artifact_id\":\"artifact_123\",\"title\":\"Plan\"}",
            ],
        )
        .expect("insert agent message part");
        conn.execute(
            "INSERT INTO agent_event (
                id, session_id, workspace_id, provider, provider_session_id, turn_id,
                event_index, event_kind, payload, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            rusqlite::params![
                "event_agent",
                "session_agent",
                "workspace_agent",
                "codex",
                "thread_123",
                "turn_123",
                1,
                "agent.artifact.published",
                "{\"artifact_id\":\"artifact_123\"}",
            ],
        )
        .expect("insert agent event");

        let (part_data, payload): (String, String) = (
            conn.query_row(
                "SELECT data FROM agent_message_part WHERE id = 'part_agent'",
                [],
                |row| row.get(0),
            )
            .expect("query migrated part data"),
            conn.query_row(
                "SELECT payload FROM agent_event WHERE id = 'event_agent'",
                [],
                |row| row.get(0),
            )
            .expect("query migrated event payload"),
        );

        assert_eq!(
            part_data,
            "{\"artifact_id\":\"artifact_123\",\"title\":\"Plan\"}"
        );
        assert_eq!(payload, "{\"artifact_id\":\"artifact_123\"}");

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn cleanup_for_exit_resets_runtime_state() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, source_ref, worktree_path, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "main",
                "/tmp/project_1/worktree",
                "active",
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (
                id, workspace_id, name, status, assigned_port, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
            rusqlite::params!["service_1", "workspace_1", "web", "ready", Some(3000_i64),],
        )
        .expect("insert service");
        conn.execute(
            "INSERT INTO terminal (id, workspace_id, label, status)
             VALUES (?1, ?2, ?3, ?4), (?5, ?6, ?7, ?8)",
            rusqlite::params![
                "terminal_active",
                "workspace_1",
                "Terminal 1",
                "active",
                "terminal_finished",
                "workspace_1",
                "Terminal 2",
                "finished"
            ],
        )
        .expect("insert terminals");
        drop(conn);

        cleanup_for_exit(&db_path).expect("cleanup succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let (workspace_status, workspace_failure_reason): (String, Option<String>) = conn
            .query_row(
                "SELECT status, failure_reason FROM workspace WHERE id = 'workspace_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query workspace");
        assert_eq!(workspace_status, "active");
        assert_eq!(
            workspace_failure_reason.as_deref(),
            Some("local_app_not_running")
        );

        let (service_status, assigned_port): (String, Option<i64>) = conn
            .query_row(
                "SELECT status, assigned_port FROM service WHERE id = 'service_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query service");
        assert_eq!(service_status, "stopped");
        assert!(assigned_port.is_none());

        let terminal_statuses: Vec<(String, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, status FROM terminal ORDER BY id")
                .expect("prepare");
            stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .expect("query")
            .map(|r| r.expect("row"))
            .collect()
        };
        assert_eq!(
            terminal_statuses,
            vec![
                ("terminal_active".to_string(), "sleeping".to_string()),
                ("terminal_finished".to_string(), "finished".to_string()),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }
}
