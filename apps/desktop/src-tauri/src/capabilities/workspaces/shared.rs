use crate::capabilities::workspaces::manifest::ServiceConfig;
use crate::capabilities::workspaces::state_machine::validate_workspace_transition;
use crate::platform::db::open_db;
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize)]
struct WorkspaceStatusEvent {
    workspace_id: String,
    status: String,
    failure_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ServiceStatusEvent {
    workspace_id: String,
    service_name: String,
    status: String,
    status_reason: Option<String>,
}

pub(super) fn emit_workspace_status(
    app: &AppHandle,
    workspace_id: &str,
    status: &str,
    failure_reason: Option<&str>,
) {
    let _ = app.emit(
        "workspace:status-changed",
        WorkspaceStatusEvent {
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
    let _ = app.emit(
        "service:status-changed",
        ServiceStatusEvent {
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

    if *status == WorkspaceStatus::Failed {
        conn.execute(
            "UPDATE workspaces SET status = ?1, failure_reason = ?2, failed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?3",
            params![status.as_str(), failure_str, workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE workspaces SET status = ?1, failure_reason = NULL, failed_at = NULL, updated_at = datetime('now') WHERE id = ?2",
            params![status.as_str(), workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }
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
    conn.execute(
        "UPDATE workspace_services SET status = ?1, status_reason = ?2, updated_at = datetime('now') WHERE workspace_id = ?3 AND service_name = ?4",
        params![status.as_str(), reason, workspace_id, service_name],
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;
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
                "SELECT status FROM workspaces WHERE id = ?1",
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
            "UPDATE workspaces SET status = 'starting', failure_reason = NULL, failed_at = NULL, updated_at = datetime('now') WHERE id = ?1",
            params![workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;

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
            "SELECT service_name FROM workspace_services WHERE workspace_id = ?1 AND status != 'failed'",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut names = Vec::new();
    for row in rows {
        names.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }

    conn.execute(
        "UPDATE workspace_services SET status = 'stopped', status_reason = NULL, updated_at = datetime('now') WHERE workspace_id = ?1 AND status != 'failed'",
        params![workspace_id],
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    Ok(names)
}

/// Topologically sort services by depends_on
pub(super) fn topo_sort_services<'a>(
    services: &'a std::collections::HashMap<String, ServiceConfig>,
) -> Result<Vec<(&'a str, &'a ServiceConfig)>, LifecycleError> {
    use std::collections::{HashMap, HashSet, VecDeque};

    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut missing_dependencies: Vec<(String, String)> = Vec::new();

    for name in services.keys() {
        in_degree.entry(name.as_str()).or_insert(0);
    }

    for (name, config) in services {
        for dep in config.depends_on() {
            if !services.contains_key(dep) {
                missing_dependencies.push((name.clone(), dep.clone()));
                continue;
            }

            dependents
                .entry(dep.as_str())
                .or_default()
                .push(name.as_str());
            *in_degree.entry(name.as_str()).or_insert(0) += 1;
        }
    }

    if let Some((service, dependency)) = missing_dependencies.first() {
        return Err(LifecycleError::ServiceStartFailed {
            service: service.clone(),
            reason: format!("service '{service}' depends on missing service '{dependency}'"),
        });
    }

    let mut queue: VecDeque<&str> = VecDeque::new();
    for (name, &degree) in &in_degree {
        if degree == 0 {
            queue.push_back(name);
        }
    }

    let mut result = Vec::new();
    while let Some(name) = queue.pop_front() {
        result.push((name, services.get(name).unwrap()));
        if let Some(deps) = dependents.get(name) {
            for dep in deps {
                if let Some(degree) = in_degree.get_mut(dep) {
                    *degree -= 1;
                    if *degree == 0 {
                        queue.push_back(dep);
                    }
                }
            }
        }
    }

    if result.len() != services.len() {
        let sorted: HashSet<&str> = result.iter().map(|(name, _)| *name).collect();
        let mut unresolved: Vec<String> = services
            .keys()
            .filter(|name| !sorted.contains(name.as_str()))
            .cloned()
            .collect();
        unresolved.sort();

        let service = unresolved
            .first()
            .cloned()
            .unwrap_or_else(|| "unknown".to_string());
        return Err(LifecycleError::ServiceStartFailed {
            service,
            reason: format!("dependency cycle detected: {}", unresolved.join(", ")),
        });
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::manifest::LifecycleConfig;
    use std::collections::HashMap;

    fn temp_db_path() -> String {
        let path =
            std::env::temp_dir().join(format!("lifecycle-commands-{}.db", uuid::Uuid::new_v4()));
        path.to_string_lossy().into_owned()
    }

    fn init_workspace_tables(db_path: &str) {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspaces (
                id TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                failure_reason TEXT,
                failed_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE workspace_services (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                service_name TEXT NOT NULL,
                status TEXT NOT NULL,
                status_reason TEXT,
                updated_at TEXT
            );",
        )
        .expect("create tables");
    }

    fn parse_services(json: &str) -> HashMap<String, ServiceConfig> {
        let config: LifecycleConfig = serde_json::from_str(json).expect("valid config");
        config.services
    }

    #[test]
    fn open_db_enables_foreign_keys() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL);
             CREATE TABLE workspaces (
                 id TEXT PRIMARY KEY NOT NULL,
                 project_id TEXT NOT NULL REFERENCES projects(id)
             );
             INSERT INTO projects (id) VALUES ('p1');
             INSERT INTO workspaces (id, project_id) VALUES ('w1', 'p1');",
        )
        .expect("seed rows");

        let err = conn
            .execute("DELETE FROM projects WHERE id = 'p1'", [])
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
            "INSERT INTO workspaces (id, status, failure_reason, failed_at, updated_at) VALUES (?1, ?2, ?3, ?4, datetime('now'))",
            rusqlite::params!["ws_1", "sleeping", "service_start_failed", "2026-03-04T00:00:00Z"],
        )
        .expect("insert workspace");
        drop(conn);

        transition_workspace_to_starting(&db_path, "ws_1").expect("transition succeeds");

        let conn = open_db(&db_path).expect("re-open db");
        let (status, failure_reason, failed_at): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT status, failure_reason, failed_at FROM workspaces WHERE id = ?1",
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
    fn transition_workspace_to_starting_rejects_invalid_transition() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspaces (id, status, updated_at) VALUES (?1, ?2, datetime('now'))",
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
            "INSERT INTO workspaces (id, status, updated_at) VALUES (?1, ?2, datetime('now'))",
            rusqlite::params!["ws_3", "failed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_services (id, workspace_id, service_name, status, status_reason, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            rusqlite::params!["svc_1", "ws_3", "api", "ready", Option::<String>::None],
        )
        .expect("insert api");
        conn.execute(
            "INSERT INTO workspace_services (id, workspace_id, service_name, status, status_reason, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            rusqlite::params!["svc_2", "ws_3", "db", "failed", Some("service_port_unreachable")],
        )
        .expect("insert db");
        conn.execute(
            "INSERT INTO workspace_services (id, workspace_id, service_name, status, status_reason, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            rusqlite::params!["svc_3", "ws_3", "worker", "starting", Option::<String>::None],
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
                    "SELECT service_name, status, status_reason FROM workspace_services WHERE workspace_id = ?1 ORDER BY service_name",
                )
                .expect("prepare");
            let rows = stmt
                .query_map(rusqlite::params!["ws_3"], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, Option<String>>(2)?,
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
                ("api".to_string(), "stopped".to_string(), None),
                (
                    "db".to_string(),
                    "failed".to_string(),
                    Some("service_port_unreachable".to_string())
                ),
                ("worker".to_string(), "stopped".to_string(), None),
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn topo_sort_orders_dependencies_before_dependents() {
        let services = parse_services(
            r#"{
                "setup": { "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }] },
                "services": {
                    "api": { "runtime": "process", "command": "bun run dev", "depends_on": ["db"] },
                    "db": { "runtime": "image", "image": "postgres:16" }
                }
            }"#,
        );

        let sorted = topo_sort_services(&services).expect("topo sort should succeed");
        let names: Vec<&str> = sorted.iter().map(|(name, _)| *name).collect();
        let db_index = names
            .iter()
            .position(|name| *name == "db")
            .expect("db exists");
        let api_index = names
            .iter()
            .position(|name| *name == "api")
            .expect("api exists");

        assert!(db_index < api_index, "db must start before api");
    }

    #[test]
    fn topo_sort_fails_when_dependency_is_missing() {
        let services = parse_services(
            r#"{
                "setup": { "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }] },
                "services": {
                    "api": { "runtime": "process", "command": "bun run dev", "depends_on": ["db"] }
                }
            }"#,
        );

        let error = topo_sort_services(&services).expect_err("missing dep should fail");
        match error {
            LifecycleError::ServiceStartFailed { service, reason } => {
                assert_eq!(service, "api");
                assert!(reason.contains("missing service"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn topo_sort_fails_on_dependency_cycle() {
        let services = parse_services(
            r#"{
                "setup": { "steps": [{ "name": "install", "command": "bun install", "timeout_seconds": 30 }] },
                "services": {
                    "api": { "runtime": "process", "command": "bun run dev", "depends_on": ["db"] },
                    "db": { "runtime": "process", "command": "bun run db", "depends_on": ["api"] }
                }
            }"#,
        );

        let error = topo_sort_services(&services).expect_err("cycle should fail");
        match error {
            LifecycleError::ServiceStartFailed { reason, .. } => {
                assert!(reason.contains("dependency cycle"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
