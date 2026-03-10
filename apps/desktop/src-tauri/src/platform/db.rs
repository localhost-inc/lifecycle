use crate::shared::errors::LifecycleError;

const MIGRATIONS: [(&str, &str); 2] = [
    (
        "0001_initial_schema",
        include_str!("migrations/0001_initial_schema.sql"),
    ),
    (
        "0002_terminal_schema",
        include_str!("migrations/0002_terminal_schema.sql"),
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

fn reconcile_workspace_environments(conn: &rusqlite::Connection) -> Result<(), LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, status FROM workspace WHERE status IN ('starting', 'active', 'stopping')",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut reconciled = Vec::new();
    for row in rows {
        reconciled.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
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
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
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
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
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
                     WHEN exposure = 'local' AND effective_port IS NOT NULL THEN 'http://localhost:' || effective_port
                     ELSE NULL
                 END,
                 updated_at = datetime('now')
             WHERE workspace_id = ?1",
            rusqlite::params![workspace_id],
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
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
                Some("http://localhost:3000"),
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
                Some("http://localhost:3001"),
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
}
