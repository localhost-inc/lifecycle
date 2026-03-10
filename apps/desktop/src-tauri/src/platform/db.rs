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

}
