use crate::capabilities::workspaces::manifest::LifecycleConfig;
use crate::capabilities::workspaces::state_machine::validate_workspace_transition;
use crate::platform::db::open_db;
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use rusqlite::{params, OptionalExtension};
use tauri::AppHandle;

use super::ports::resolve_effective_port;
use super::preview::{preview_fields_for_service, refresh_workspace_preview_rows};

pub(super) fn emit_workspace_status(
    app: &AppHandle,
    workspace_id: &str,
    status: &str,
    failure_reason: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::WorkspaceStatusChanged {
            workspace_id: workspace_id.to_string(),
            status: status.to_string(),
            failure_reason: failure_reason.map(|s| s.to_string()),
        },
    );
}

pub(super) fn emit_service_status(
    app: &AppHandle,
    workspace_id: &str,
    service_name: &str,
    status: &str,
    reason: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::ServiceStatusChanged {
            workspace_id: workspace_id.to_string(),
            service_name: service_name.to_string(),
            status: status.to_string(),
            status_reason: reason.map(|s| s.to_string()),
        },
    );
}

pub(super) fn update_workspace_status_db(
    db_path: &str,
    workspace_id: &str,
    status: &WorkspaceStatus,
    failure_reason: Option<&WorkspaceFailureReason>,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    let failure_str: Option<&str> = failure_reason.map(|r| r.as_str());

    if failure_reason.is_some() {
        conn.execute(
            "UPDATE workspace SET status = ?1, failure_reason = ?2, failed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?3",
            params![status.as_str(), failure_str, workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE workspace SET status = ?1, failure_reason = NULL, failed_at = NULL, updated_at = datetime('now') WHERE id = ?2",
            params![status.as_str(), workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }
    refresh_workspace_preview_rows(&conn, workspace_id, status)?;
    Ok(())
}

pub(super) fn update_service_status_db(
    db_path: &str,
    workspace_id: &str,
    service_name: &str,
    status: &ServiceStatus,
    reason: Option<&str>,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    let workspace_status = conn
        .query_row(
            "SELECT status FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))
        .and_then(|status| WorkspaceStatus::from_str(&status))?;
    let (exposure, effective_port): (String, Option<i64>) = conn
        .query_row(
            "SELECT exposure, effective_port FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
            params![workspace_id, service_name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let (preview_status, preview_failure_reason, preview_url) = preview_fields_for_service(
        &exposure,
        effective_port,
        status.as_str(),
        &workspace_status,
    );
    conn.execute(
        "UPDATE workspace_service
         SET status = ?1,
             status_reason = ?2,
             preview_status = ?3,
             preview_failure_reason = ?4,
             preview_url = ?5,
             updated_at = datetime('now')
         WHERE workspace_id = ?6 AND service_name = ?7",
        params![
            status.as_str(),
            reason,
            preview_status,
            preview_failure_reason,
            preview_url,
            workspace_id,
            service_name,
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
) -> Result<(), LifecycleError> {
    let mut conn = open_db(db_path)?;
    let tx = conn
        .transaction()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let workspace_status = tx
        .query_row(
            "SELECT status FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))
        .and_then(|status| WorkspaceStatus::from_str(&status))?;

    match config {
        Some(config) => {
            let mut existing_rows = tx
                .prepare(
                    "SELECT service_name, exposure, port_override
                     FROM workspace_service
                     WHERE workspace_id = ?1",
                )
                .map_err(|e| LifecycleError::Database(e.to_string()))?;
            let existing = existing_rows
                .query_map(params![workspace_id], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                    ))
                })
                .map_err(|e| LifecycleError::Database(e.to_string()))?;

            let mut existing_rows_by_service = std::collections::HashMap::new();
            for row in existing {
                let (service_name, exposure, port_override) =
                    row.map_err(|e| LifecycleError::Database(e.to_string()))?;
                existing_rows_by_service.insert(service_name, (exposure, port_override));
            }
            drop(existing_rows);

            let mut service_names: Vec<&str> = config.services.keys().map(String::as_str).collect();
            service_names.sort_unstable();

            if service_names.is_empty() {
                tx.execute(
                    "DELETE FROM workspace_service WHERE workspace_id = ?1",
                    params![workspace_id],
                )
                .map_err(|e| LifecycleError::Database(e.to_string()))?;
            } else {
                let placeholders = std::iter::repeat("?")
                    .take(service_names.len())
                    .collect::<Vec<_>>()
                    .join(", ");
                let query = format!(
                    "DELETE FROM workspace_service WHERE workspace_id = ?1 AND service_name NOT IN ({placeholders})"
                );
                let delete_params =
                    std::iter::once(workspace_id).chain(service_names.iter().copied());
                tx.execute(&query, rusqlite::params_from_iter(delete_params))
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;
            }

            for (service_name, service_config) in &config.services {
                let default_port = service_config.port().map(|port| port as i64);
                let (exposure, port_override) = existing_rows_by_service
                    .get(service_name)
                    .cloned()
                    .unwrap_or_else(|| {
                        (
                            if service_config.share_default() {
                                "local".to_string()
                            } else {
                                "internal".to_string()
                            },
                            None,
                        )
                    });
                let current_effective_port = tx
                    .query_row(
                        "SELECT effective_port FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                        params![workspace_id, service_name],
                        |row| row.get::<_, Option<i64>>(0),
                    )
                    .optional()
                    .map_err(|error| LifecycleError::Database(error.to_string()))?
                    .flatten();
                let effective_port = resolve_effective_port(
                    &tx,
                    workspace_id,
                    service_name,
                    default_port,
                    port_override,
                    current_effective_port,
                )?;
                let (preview_status, preview_failure_reason, preview_url) =
                    preview_fields_for_service(
                        &exposure,
                        effective_port,
                        "stopped",
                        &workspace_status,
                    );

                let updated = tx
                    .execute(
                        "UPDATE workspace_service
                         SET status = 'stopped',
                             status_reason = NULL,
                             default_port = ?1,
                             effective_port = ?2,
                             preview_status = ?3,
                             preview_failure_reason = ?4,
                             preview_url = ?5,
                             updated_at = datetime('now')
                         WHERE workspace_id = ?6 AND service_name = ?7",
                        params![
                            default_port,
                            effective_port,
                            preview_status,
                            preview_failure_reason,
                            preview_url,
                            workspace_id,
                            service_name,
                        ],
                    )
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;

                if updated == 0 {
                    let (preview_status, preview_failure_reason, preview_url) =
                        preview_fields_for_service(
                            &exposure,
                            effective_port,
                            "stopped",
                            &workspace_status,
                        );
                    tx.execute(
                        "INSERT INTO workspace_service (
                            id, workspace_id, service_name, exposure, status, default_port,
                            effective_port, preview_status, preview_failure_reason, preview_url
                         ) VALUES (?1, ?2, ?3, ?4, 'stopped', ?5, ?6, ?7, ?8, ?9)",
                        params![
                            uuid::Uuid::new_v4().to_string(),
                            workspace_id,
                            service_name,
                            exposure,
                            default_port,
                            effective_port,
                            preview_status,
                            preview_failure_reason,
                            preview_url,
                        ],
                    )
                    .map_err(|e| LifecycleError::Database(e.to_string()))?;
                }
            }
        }
        None => {
            tx.execute(
                "DELETE FROM workspace_service WHERE workspace_id = ?1",
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

pub(super) fn transition_workspace_to_starting(
    db_path: &str,
    workspace_id: &str,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute_batch("BEGIN IMMEDIATE TRANSACTION")
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let result = (|| -> Result<(), LifecycleError> {
        let status: String = conn
            .query_row(
                "SELECT status FROM workspace WHERE id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => {
                    LifecycleError::WorkspaceNotFound(workspace_id.to_string())
                }
                _ => LifecycleError::Database(e.to_string()),
            })?;
        let current_status = WorkspaceStatus::from_str(&status)?;
        validate_workspace_transition(&current_status, &WorkspaceStatus::Starting)?;

        conn.execute(
            "UPDATE workspace SET status = 'starting', failure_reason = NULL, failed_at = NULL, updated_at = datetime('now') WHERE id = ?1",
            params![workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
        refresh_workspace_preview_rows(&conn, workspace_id, &WorkspaceStatus::Starting)?;

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
) -> WorkspaceFailureReason {
    match error {
        LifecycleError::DockerUnavailable(_) => WorkspaceFailureReason::LocalDockerUnavailable,
        LifecycleError::PortConflict { .. } => WorkspaceFailureReason::LocalPortConflict,
        _ => WorkspaceFailureReason::ServiceStartFailed,
    }
}

pub(super) fn service_status_reason_for_start_error(error: &LifecycleError) -> &'static str {
    match error {
        LifecycleError::PortConflict { .. } => "service_port_unreachable",
        _ => "unknown",
    }
}

pub(super) fn service_name_for_start_error(error: &LifecycleError, fallback: &str) -> String {
    match error {
        LifecycleError::ServiceStartFailed { service, .. } => service.clone(),
        LifecycleError::PortConflict { service, .. } => service.clone(),
        _ => fallback.to_string(),
    }
}

pub(super) fn mark_services_failed(
    db_path: &str,
    workspace_id: &str,
    service_names: &[String],
    reason: &str,
) -> Result<(), LifecycleError> {
    for service_name in service_names {
        update_service_status_db(
            db_path,
            workspace_id,
            service_name,
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
            "SELECT service_name FROM workspace_service WHERE workspace_id = ?1 AND status != 'failed'",
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

    for service_name in &names {
        update_service_status_db(
            db_path,
            workspace_id,
            service_name,
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
                status TEXT NOT NULL,
                manifest_fingerprint TEXT,
                failure_reason TEXT,
                failed_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE workspace_service (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                service_name TEXT NOT NULL,
                exposure TEXT NOT NULL DEFAULT 'local',
                port_override INTEGER,
                status TEXT NOT NULL,
                status_reason TEXT,
                default_port INTEGER,
                effective_port INTEGER,
                preview_status TEXT NOT NULL DEFAULT 'disabled',
                preview_failure_reason TEXT,
                preview_url TEXT,
                created_at TEXT,
                updated_at TEXT
            );",
        )
        .expect("create tables");
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
    fn transition_workspace_to_starting_updates_status_and_clears_failure_fields() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status, failure_reason, failed_at, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params!["ws_1", "idle", "service_start_failed", "2026-03-04T00:00:00Z"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status, default_port, effective_port,
                preview_status, preview_url, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_ws_1",
                "ws_1",
                "web",
                "local",
                "stopped",
                Some(3000_i64),
                Some(3000_i64),
                "sleeping",
                Some("http://localhost:3000"),
            ],
        )
        .expect("insert service");
        drop(conn);

        transition_workspace_to_starting(&db_path, "ws_1").expect("transition succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let (status, failure_reason, failed_at): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT status, failure_reason, failed_at FROM workspace WHERE id = ?1",
                rusqlite::params!["ws_1"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("workspace exists");
        assert_eq!(status, "starting");
        assert!(failure_reason.is_none());
        assert!(failed_at.is_none());
        let preview_status: String = conn
            .query_row(
                "SELECT preview_status FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                rusqlite::params!["ws_1", "web"],
                |row| row.get(0),
            )
            .expect("query preview status");
        assert_eq!(preview_status, "provisioning");

        drop(conn);
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn transition_workspace_to_starting_rejects_invalid_transition() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status, updated_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params!["ws_2", "starting"],
        )
        .expect("insert workspace");
        drop(conn);

        let err = transition_workspace_to_starting(&db_path, "ws_2").expect_err("must fail");
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
        conn.execute(
            "INSERT INTO workspace (id, status, updated_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params!["ws_3", "idle"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, status, status_reason, effective_port,
                preview_status, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            rusqlite::params![
                "svc_1",
                "ws_3",
                "api",
                "ready",
                Option::<String>::None,
                Some(3000_i64),
                "ready",
                Some("http://localhost:3000"),
            ],
        )
        .expect("insert api");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, status, status_reason, effective_port,
                preview_status, preview_failure_reason, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            rusqlite::params![
                "svc_2",
                "ws_3",
                "db",
                "failed",
                Some("service_port_unreachable"),
                Some(5432_i64),
                "failed",
                Some("service_unreachable"),
                Some("http://localhost:5432"),
            ],
        )
        .expect("insert db");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, status, status_reason, effective_port,
                preview_status, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            rusqlite::params![
                "svc_3",
                "ws_3",
                "worker",
                "starting",
                Option::<String>::None,
                Some(4173_i64),
                "provisioning",
                Some("http://localhost:4173"),
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
                    "SELECT service_name, status, status_reason, preview_status, preview_failure_reason
                     FROM workspace_service
                     WHERE workspace_id = ?1
                     ORDER BY service_name",
                )
                .expect("prepare");
            let rows = stmt
                .query_map(rusqlite::params!["ws_3"], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
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
                    "sleeping".to_string(),
                    None,
                ),
                (
                    "db".to_string(),
                    "failed".to_string(),
                    Some("service_port_unreachable".to_string()),
                    "failed".to_string(),
                    Some("service_unreachable".to_string())
                ),
                (
                    "worker".to_string(),
                    "stopped".to_string(),
                    None,
                    "sleeping".to_string(),
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
        let web_default_port = available_test_port();
        let admin_default_port = available_test_port();
        let web_override_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status, updated_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params!["ws_seed", "idle"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, status_reason,
                default_port, effective_port, preview_status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_old",
                "ws_seed",
                "web",
                "organization",
                Some(web_override_port),
                "failed",
                Some("unknown"),
                Some(web_default_port),
                Some(web_override_port),
                "disabled",
            ],
        )
        .expect("insert existing service");
        drop(conn);

        let config_json = format!(
            r#"{{
                "setup": {{ "steps": [{{ "name": "install", "command": "bun install", "timeout_seconds": 30 }}] }},
                "services": {{
                    "web": {{ "runtime": "process", "command": "bun run dev", "port": {web_default_port} }},
                    "admin": {{ "runtime": "process", "command": "bun run admin", "port": {admin_default_port}, "share_default": true }},
                    "worker": {{ "runtime": "process", "command": "bun run worker" }}
                }}
            }}"#,
        );
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(&db_path, "ws_seed", Some(&config), Some("fingerprint_1"))
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
                "SELECT service_name, exposure, port_override, status, status_reason, default_port, effective_port, preview_status, preview_failure_reason, preview_url
                 FROM workspace_service
                 WHERE workspace_id = ?1
                 ORDER BY service_name",
            )
            .expect("prepare select");
        let rows = stmt
            .query_map(rusqlite::params!["ws_seed"], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<i64>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<i64>>(5)?,
                    row.get::<_, Option<i64>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                ))
            })
            .expect("query services");
        let values = rows.map(|row| row.expect("row")).collect::<Vec<(
            String,
            String,
            Option<i64>,
            String,
            Option<String>,
            Option<i64>,
            Option<i64>,
            String,
            Option<String>,
            Option<String>,
        )>>();
        assert_eq!(
            values,
            vec![
                (
                    "admin".to_string(),
                    "local".to_string(),
                    None,
                    "stopped".to_string(),
                    None,
                    Some(admin_default_port),
                    Some(admin_default_port),
                    "sleeping".to_string(),
                    None,
                    Some(format!("http://localhost:{admin_default_port}")),
                ),
                (
                    "web".to_string(),
                    "organization".to_string(),
                    Some(web_override_port),
                    "stopped".to_string(),
                    None,
                    Some(web_default_port),
                    Some(web_override_port),
                    "disabled".to_string(),
                    None,
                    None,
                ),
                (
                    "worker".to_string(),
                    "internal".to_string(),
                    None,
                    "stopped".to_string(),
                    None,
                    None,
                    None,
                    "disabled".to_string(),
                    None,
                    None,
                ),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn reconcile_workspace_services_db_assigns_next_available_port_for_conflicting_defaults() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let default_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status, updated_at) VALUES (?1, ?2, datetime('now')), (?3, ?4, datetime('now'))",
            rusqlite::params!["ws_a", "idle", "ws_b", "idle"],
        )
        .expect("insert workspaces");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status, default_port, effective_port,
                preview_status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'), datetime('now'))",
            rusqlite::params![
                "svc_a",
                "ws_a",
                "web",
                "local",
                "stopped",
                Some(default_port),
                Some(default_port),
                "sleeping",
            ],
        )
        .expect("insert reserved service");
        drop(conn);

        let config_json = format!(
            r#"{{
                "setup": {{ "steps": [{{ "name": "install", "command": "bun install", "timeout_seconds": 30 }}] }},
                "services": {{
                    "web": {{ "runtime": "process", "command": "bun run dev", "port": {default_port}, "share_default": true }}
                }}
            }}"#,
        );
        let config: LifecycleConfig = serde_json::from_str(&config_json).expect("valid config");

        reconcile_workspace_services_db(&db_path, "ws_b", Some(&config), Some("fingerprint_2"))
            .expect("reconcile succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let row: (Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT port_override, effective_port FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                rusqlite::params!["ws_b", "web"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query service");
        assert_eq!(row, (None, Some(default_port + 1)));

        let _ = std::fs::remove_file(db_path);
    }
}
