use crate::capabilities::workspaces::manifest::LifecycleConfig;
use crate::capabilities::workspaces::state_machine::validate_environment_transition;
use crate::platform::db::open_db;
use crate::shared::errors::{
    LifecycleError, ServiceStatus, EnvironmentFailureReason, EnvironmentStatus,
};
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use rusqlite::params;
use tauri::AppHandle;

pub(super) fn emit_environment_status(
    app: &AppHandle,
    workspace_id: &str,
    status: &str,
    failure_reason: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::EnvironmentStatusChanged {
            workspace_id: workspace_id.to_string(),
            status: status.to_string(),
            failure_reason: failure_reason.map(|s| s.to_string()),
        },
    );
}

pub(super) fn emit_service_status(
    app: &AppHandle,
    workspace_id: &str,
    name: &str,
    status: &str,
    reason: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::ServiceStatusChanged {
            workspace_id: workspace_id.to_string(),
            name: name.to_string(),
            status: status.to_string(),
            status_reason: reason.map(|s| s.to_string()),
        },
    );
}

pub(super) fn update_environment_status_db(
    db_path: &str,
    workspace_id: &str,
    status: &EnvironmentStatus,
    failure_reason: Option<&EnvironmentFailureReason>,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    let failure_str: Option<&str> = failure_reason.map(|r| r.as_str());

    if failure_reason.is_some() {
        conn.execute(
            "UPDATE environment
             SET status = ?1, failure_reason = ?2, failed_at = datetime('now'), updated_at = datetime('now')
             WHERE workspace_id = ?3",
            params![status.as_str(), failure_str, workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE environment
             SET status = ?1, failure_reason = NULL, failed_at = NULL, updated_at = datetime('now')
             WHERE workspace_id = ?2",
            params![status.as_str(), workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }
    conn.execute(
        "UPDATE workspace
         SET updated_at = datetime('now'),
             last_active_at = datetime('now')
         WHERE id = ?1",
        params![workspace_id],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

pub(super) fn update_service_status_db(
    db_path: &str,
    workspace_id: &str,
    name: &str,
    status: &ServiceStatus,
    reason: Option<&str>,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    let current_assigned_port: Option<i64> = conn
        .query_row(
            "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
            params![workspace_id, name],
            |row| row.get(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let next_assigned_port = match status {
        ServiceStatus::Stopped | ServiceStatus::Failed => None,
        ServiceStatus::Starting | ServiceStatus::Ready => current_assigned_port,
    };
    conn.execute(
        "UPDATE service
         SET status = ?1,
             status_reason = ?2,
             assigned_port = ?3,
             updated_at = datetime('now')
         WHERE environment_id = ?4 AND name = ?5",
        params![
            status.as_str(),
            reason,
            next_assigned_port,
            workspace_id,
            name,
        ],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

pub(super) fn reconcile_workspace_services_db(
    db_path: &str,
    workspace_id: &str,
    config: Option<&LifecycleConfig>,
    manifest_fingerprint: Option<&str>,
    preserve_runtime_state: bool,
) -> Result<(), LifecycleError> {
    let mut conn = open_db(db_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    match config {
        Some(config) => {
            let mut existing_rows = tx
                .prepare(
                    "SELECT name, status, status_reason, assigned_port
                     FROM service
                     WHERE environment_id = ?1",
                )
                .map_err(|e| LifecycleError::Database(e.to_string()))?;
            let existing = existing_rows
                .query_map(params![workspace_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                })
                .map_err(|e| LifecycleError::Database(e.to_string()))?;

            let mut existing_rows_by_service = std::collections::HashMap::new();
            for row in existing {
                let (name, status, status_reason, assigned_port) =
                    row.map_err(|e| LifecycleError::Database(e.to_string()))?;
                existing_rows_by_service.insert(name, (status, status_reason, assigned_port));
            }
            drop(existing_rows);

            let mut service_names = config
                .declared_services()
                .map(|(name, _)| name.as_str())
                .collect::<Vec<_>>();
            service_names.sort_unstable();

            if service_names.is_empty() {
                tx.execute(
                    "DELETE FROM service WHERE environment_id = ?1",
                    params![workspace_id],
                )
                .map_err(|e| LifecycleError::Database(e.to_string()))?;
            } else {
                let placeholders = std::iter::repeat("?")
                    .take(service_names.len())
                    .collect::<Vec<_>>()
                    .join(", ");
                let query = format!(
                    "DELETE FROM service WHERE environment_id = ?1 AND name NOT IN ({placeholders})"
                );
                let delete_params =
                    std::iter::once(workspace_id).chain(service_names.iter().copied());
                tx.execute(&query, rusqlite::params_from_iter(delete_params))
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;
            }

            for (name, _service_config) in config.declared_services() {
                let (current_status, current_status_reason, current_assigned_port) =
                    existing_rows_by_service
                    .get(name)
                    .cloned()
                    .unwrap_or_else(|| ("stopped".to_string(), None, None));
                let assigned_port = if preserve_runtime_state
                    && matches!(current_status.as_str(), "ready" | "starting")
                {
                    current_assigned_port
                } else {
                    None
                };
                let next_status = if preserve_runtime_state {
                    current_status.as_str()
                } else {
                    "stopped"
                };
                let next_status_reason = if preserve_runtime_state {
                    current_status_reason.clone()
                } else {
                    None
                };

                let updated = tx
                    .execute(
                        "UPDATE service
                         SET status = ?1,
                             status_reason = ?2,
                             assigned_port = ?3,
                             updated_at = datetime('now')
                         WHERE environment_id = ?4 AND name = ?5",
                        params![
                            next_status,
                            next_status_reason,
                            assigned_port,
                            workspace_id,
                            name,
                        ],
                    )
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;

                if updated == 0 {
                    tx.execute(
                        "INSERT INTO service (
                            id, environment_id, name, status, status_reason, assigned_port
                         ) VALUES (?1, ?2, ?3, 'stopped', NULL, ?4)",
                        params![
                            uuid::Uuid::new_v4().to_string(),
                            workspace_id,
                            name,
                            assigned_port,
                        ],
                    )
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;
                }
            }
        }
        None => {
            tx.execute(
                "DELETE FROM service WHERE environment_id = ?1",
                params![workspace_id],
            )
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        }
    }

    tx.execute(
        "UPDATE workspace SET manifest_fingerprint = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![manifest_fingerprint, workspace_id],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    tx.commit()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

pub(super) fn transition_environment_to(
    db_path: &str,
    workspace_id: &str,
    target_status: &EnvironmentStatus,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let result = (|| -> Result<(), LifecycleError> {
        let status: String = conn
            .query_row(
                "SELECT status FROM environment WHERE workspace_id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    LifecycleError::WorkspaceNotFound(workspace_id.to_string())
                }
                _ => LifecycleError::Database(e.to_string()),
            })?;
        let current_status = EnvironmentStatus::from_str(&status)?;
        validate_environment_transition(&current_status, target_status)?;

        conn.execute(
            "UPDATE environment
             SET status = ?1, failure_reason = NULL, failed_at = NULL, updated_at = datetime('now')
             WHERE workspace_id = ?2",
            params![target_status.as_str(), workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
        conn.execute(
            "UPDATE workspace
             SET updated_at = datetime('now'), last_active_at = datetime('now')
             WHERE id = ?1",
            params![workspace_id],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

        Ok(())
    })();

    if let Err(error) = result {
        let _ = conn.execute_batch("ROLLBACK");
        return Err(error);
    }

    conn.execute_batch("COMMIT")
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

pub(super) fn workspace_failure_reason_for_start_error(
    error: &LifecycleError,
) -> EnvironmentFailureReason {
    match error {
        LifecycleError::DockerUnavailable(_) => EnvironmentFailureReason::LocalDockerUnavailable,
        LifecycleError::PortConflict { .. } | LifecycleError::PortExhausted { .. } => {
            EnvironmentFailureReason::LocalPortConflict
        }
        _ => EnvironmentFailureReason::ServiceStartFailed,
    }
}

pub(super) fn service_status_reason_for_start_error(error: &LifecycleError) -> &'static str {
    match error {
        LifecycleError::PortConflict { .. } | LifecycleError::PortExhausted { .. } => {
            "service_port_unreachable"
        }
        LifecycleError::ServiceStartFailed { .. } => "service_start_failed",
        _ => "service_start_failed",
    }
}

pub(super) fn service_name_for_start_error(error: &LifecycleError, fallback: &str) -> String {
    match error {
        LifecycleError::ServiceStartFailed { service, .. } => service.clone(),
        LifecycleError::PortConflict { service, .. }
        | LifecycleError::PortExhausted { service } => service.clone(),
        _ => fallback.to_string(),
    }
}

pub(super) fn mark_services_failed(
    db_path: &str,
    workspace_id: &str,
    service_names: &[String],
    reason: &str,
) -> Result<(), LifecycleError> {
    for name in service_names {
        update_service_status_db(
            db_path,
            workspace_id,
            name,
            &ServiceStatus::Failed,
            Some(reason),
        )?;
    }

    Ok(())
}

pub(super) fn mark_nonfailed_services_stopped(
    db_path: &str,
    workspace_id: &str,
) -> Result<Vec<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT name FROM service WHERE environment_id = ?1 AND status != 'failed'",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut names = Vec::new();
    for row in rows {
        names.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    drop(stmt);
    drop(conn);

    for name in &names {
        update_service_status_db(
            db_path,
            workspace_id,
            name,
            &ServiceStatus::Stopped,
            None,
        )?;
    }

    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::manifest::LifecycleConfig;
    use crate::capabilities::workspaces::test_support::available_test_port;
    use crate::platform::git::worktree::{short_workspace_id, slugify_workspace_name};

    #[test]
    fn maps_service_start_errors_to_service_start_failed_reason() {
        let error = LifecycleError::ServiceStartFailed {
            service: "postgres".to_string(),
            reason: "container exited".to_string(),
        };

        assert_eq!(
            service_status_reason_for_start_error(&error),
            "service_start_failed"
        );
    }

    fn temp_db_path() -> String {
        let path =
            std::env::temp_dir().join(format!("lifecycle-commands-{}.db", uuid::Uuid::new_v4()));
        path.to_string_lossy().into_owned()
    }

    fn init_workspace_tables(db_path: &str) {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                manifest_fingerprint TEXT,
                updated_at TEXT,
                last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE environment (
                workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                status TEXT NOT NULL,
                failure_reason TEXT,
                failed_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE service (
                id TEXT PRIMARY KEY NOT NULL,
                environment_id TEXT NOT NULL REFERENCES environment(workspace_id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                status_reason TEXT,
                assigned_port INTEGER,
                created_at TEXT,
                updated_at TEXT
            );",
        )
        .expect("create tables");
    }

    fn seed_managed_workspace(
        conn: &rusqlite::Connection,
        workspace_id: &str,
        environment_status: &str,
        failure_reason: Option<&str>,
        failed_at: Option<&str>,
    ) {
        let (name, source_ref) = managed_workspace_identity(workspace_id);
        conn.execute(
            "INSERT INTO workspace (id, kind, name, source_ref, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params![workspace_id, "managed", name, source_ref],
        )
        .expect("insert workspace shell");
        conn.execute(
            "INSERT INTO environment (
                workspace_id, status, failure_reason, failed_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            rusqlite::params![workspace_id, environment_status, failure_reason, failed_at],
        )
        .expect("insert environment");
    }

    fn managed_workspace_identity(workspace_id: &str) -> (String, String) {
        let name = workspace_id.replace('_', " ");
        let source_ref = format!(
            "lifecycle/{}-{}",
            slugify_workspace_name(&name),
            short_workspace_id(workspace_id)
        );
        (name, source_ref)
    }

    #[test]
    fn open_db_enables_foreign_keys() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE project (id TEXT PRIMARY KEY NOT NULL);
             CREATE TABLE workspace (
                 id TEXT PRIMARY KEY NOT NULL,
                 project_id TEXT NOT NULL REFERENCES project(id)
             );
             INSERT INTO project (id) VALUES ('p1');
             INSERT INTO workspace (id, project_id) VALUES ('w1', 'p1');",
        )
        .expect("seed rows");

        let err = conn
            .execute("DELETE FROM project WHERE id = 'p1'", [])
            .expect_err("fk should block orphaning workspace");
        assert!(
            err.to_string().contains("FOREIGN KEY constraint failed"),
            "unexpected error: {err}"
        );

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn transition_environment_to_starting_updates_status_and_clears_failure_fields() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(
            &conn,
            "ws_1",
            "idle",
            Some("service_start_failed"),
            Some("2026-03-04T00:00:00Z"),
        );
        drop(conn);

        transition_environment_to(&db_path, "ws_1", &EnvironmentStatus::Starting)
            .expect("transition succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let (status, failure_reason, failed_at): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT status, failure_reason, failed_at
                 FROM environment
                 WHERE workspace_id = ?1",
                rusqlite::params!["ws_1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("workspace exists");
        assert_eq!(status, "starting");
        assert!(failure_reason.is_none());
        assert!(failed_at.is_none());

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn transition_environment_to_starting_allows_incremental_boots_from_running() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_started", "running", None, None);
        drop(conn);

        transition_environment_to(&db_path, "ws_started", &EnvironmentStatus::Starting)
            .expect("transition succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let status: String = conn
            .query_row(
                "SELECT status
                 FROM environment
                 WHERE workspace_id = ?1",
                rusqlite::params!["ws_started"],
                |row| row.get(0),
            )
            .expect("query state");
        assert_eq!(status, "starting");

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn transition_environment_to_starting_rejects_invalid_transition() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_2", "starting", None, None);
        drop(conn);

        let err = transition_environment_to(&db_path, "ws_2", &EnvironmentStatus::Starting)
            .expect_err("must fail");
        match err {
            LifecycleError::InvalidStateTransition { from, to } => {
                assert_eq!(from, "starting");
                assert_eq!(to, "starting");
            }
            other => panic!("unexpected error: {other}"),
        }

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn mark_nonfailed_services_stopped_only_updates_nonfailed_rows() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_3", "idle", None, None);
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            rusqlite::params![
                "svc_1",
                "ws_3",
                "api",
                "ready",
                Option::<String>::None,
                Some(3000_i64),
            ],
        )
        .expect("insert api");
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            rusqlite::params![
                "svc_2",
                "ws_3",
                "db",
                "failed",
                Some("service_port_unreachable"),
                Some(5432_i64),
            ],
        )
        .expect("insert db");
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
            rusqlite::params![
                "svc_3",
                "ws_3",
                "worker",
                "starting",
                Option::<String>::None,
                Some(4173_i64),
            ],
        )
        .expect("insert worker");
        drop(conn);

        let mut updated = mark_nonfailed_services_stopped(&db_path, "ws_3").expect("update rows");
        updated.sort();
        assert_eq!(updated, vec!["api".to_string(), "worker".to_string()]);

        let values = {
            let conn = open_db(&db_path).expect("re-open db");
            let mut stmt = conn
                .prepare(
                    "SELECT name, status, status_reason, assigned_port
                     FROM service
                     WHERE environment_id = ?1
                     ORDER BY name",
                )
                .expect("prepare");
            let rows = stmt
                .query_map(rusqlite::params!["ws_3"], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                })
                .expect("query");
            let mut values = Vec::new();
            for row in rows {
                values.push(row.expect("row"));
            }
            values
        };
        assert_eq!(
            values,
            vec![
                (
                    "api".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
                (
                    "db".to_string(),
                    "failed".to_string(),
                    Some("service_port_unreachable".to_string()),
                    Some(5432_i64),
                ),
                (
                    "worker".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_seeds_and_updates_declared_services() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let stale_web_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_seed", "idle", None, None);
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason,
                assigned_port, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_old",
                "ws_seed",
                "web",
                "failed",
                Some("unknown"),
                Some(stale_web_port),
            ],
        )
        .expect("insert existing service");
        drop(conn);

        let config_json = r#"{
                "workspace": {
                    "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }]
                },
                "environment": {
                    "web": { "kind": "service", "runtime": "process", "command": "bun run dev" },
                    "admin": { "kind": "service", "runtime": "process", "command": "bun run admin" },
                    "migrate": { "kind": "task", "command": "bun run db:migrate", "depends_on": ["web"], "timeout_seconds": 30 },
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
                }
            }"#;
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(
            &db_path,
            "ws_seed",
            Some(&config),
            Some("fingerprint_1"),
            false,
        )
        .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let fingerprint: Option<String> = conn
            .query_row(
                "SELECT manifest_fingerprint FROM workspace WHERE id = ?1",
                rusqlite::params!["ws_seed"],
                |row| row.get(0),
            )
            .expect("query fingerprint");
        assert_eq!(fingerprint.as_deref(), Some("fingerprint_1"));

        let mut stmt = conn
            .prepare(
                "SELECT name, status, status_reason, assigned_port
                 FROM service
                 WHERE environment_id = ?1
                 ORDER BY name",
            )
            .expect("prepare select");
        let rows = stmt
            .query_map(rusqlite::params!["ws_seed"], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            })
            .expect("query services");
        let values = rows.map(|row| row.expect("row")).collect::<Vec<(
            String,
            String,
            Option<String>,
            Option<i64>,
        )>>();
        assert_eq!(
            values,
            vec![
                (
                    "admin".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
                (
                    "api".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
                (
                    "web".to_string(),
                    "stopped".to_string(),
                    None,
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_can_preserve_existing_runtime_state() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_started", "running", None, None);
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason,
                assigned_port,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_api",
                "ws_started",
                "api",
                "ready",
                Option::<String>::None,
                Option::<i64>::None,
            ],
        )
        .expect("insert existing service");
        drop(conn);

        let config_json = r#"{
                "workspace": { "prepare": [] },
                "environment": {
                    "api": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run api"
                    },
                    "www": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run www"
                    }
                }
            }"#;
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(
            &db_path,
            "ws_started",
            Some(&config),
            Some("fingerprint_active"),
            true,
        )
        .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let mut stmt = conn
            .prepare(
                "SELECT name, status, status_reason, assigned_port
                 FROM service
                 WHERE environment_id = ?1
                 ORDER BY name",
            )
            .expect("prepare query");
        let rows = stmt
            .query_map(rusqlite::params!["ws_started"], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                ))
            })
            .expect("query services");
        let values = rows
            .map(|row| row.expect("row"))
            .collect::<Vec<(String, String, Option<String>, Option<i64>)>>();
        drop(stmt);
        assert_eq!(
            values,
            vec![
                ("api".to_string(), "ready".to_string(), None, None),
                ("www".to_string(), "stopped".to_string(), None, None),
            ]
        );

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_does_not_assign_runtime_ports_while_idle() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let test_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_a", "idle", None, None);
        seed_managed_workspace(&conn, "ws_b", "idle", None, None);
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, assigned_port, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_a",
                "ws_a",
                "web",
                "stopped",
                Some(test_port),
            ],
        )
        .expect("insert reserved service");
        drop(conn);

        let config_json = r#"{
                "workspace": {
                    "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }]
                },
                "environment": {
                    "web": { "kind": "service", "runtime": "process", "command": "bun run dev" }
                }
            }"#;
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(
            &db_path,
            "ws_b",
            Some(&config),
            Some("fingerprint_2"),
            false,
        )
        .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let assigned_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
                rusqlite::params!["ws_b", "web"],
                |row| row.get(0),
            )
            .expect("query service");
        assert_eq!(assigned_port, None);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_clears_stale_assigned_port_when_environment_is_idle() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let port_guard = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind port");
        let stale_port = i64::from(
            port_guard
                .local_addr()
                .expect("port should have local addr")
                .port(),
        );

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_stopped", "idle", None, None);
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, assigned_port, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_idle",
                "ws_stopped",
                "postgres",
                "stopped",
                Some(stale_port),
            ],
        )
        .expect("insert existing service");
        drop(conn);

        let config_json = format!(
            r#"{{
                "workspace": {{
                    "prepare": [{{ "name": "install", "command": "bun install", "timeout_seconds": 30 }}]
                }},
                "environment": {{
                    "postgres": {{ "kind": "service", "runtime": "image", "image": "postgres:16", "port": {stale_port} }}
                }}
            }}"#,
        );
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(
            &db_path,
            "ws_stopped",
            Some(&config),
            Some("fingerprint_3"),
            false,
        )
        .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let assigned_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
                rusqlite::params!["ws_stopped", "postgres"],
                |row| row.get(0),
            )
            .expect("query service");
        assert_eq!(assigned_port, None);

        drop(port_guard);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_keeps_stopped_service_ports_unassigned() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        seed_managed_workspace(&conn, "ws_image", "idle", None, None);
        drop(conn);

        let config_json = r#"{
            "workspace": {
                "prepare": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }]
            },
            "environment": {
                "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16", "port": 5432 },
                "web": { "kind": "service", "runtime": "process", "command": "bun run dev" }
            }
        }"#;
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(
            &db_path,
            "ws_image",
            Some(&config),
            Some("fingerprint_4"),
            false,
        )
        .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let postgres_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
                rusqlite::params!["ws_image", "postgres"],
                |row| row.get(0),
            )
            .expect("query postgres");
        let web_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
                rusqlite::params!["ws_image", "web"],
                |row| row.get(0),
            )
            .expect("query web");

        assert_eq!(postgres_port, None);
        assert_eq!(web_port, None);

        let _ = std::fs::remove_file(db_path);
    }
}
