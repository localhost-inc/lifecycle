use super::kind::is_root_workspace_kind;
#[cfg(test)]
use crate::platform::db::open_db;
use crate::platform::db::run_blocking_db_read;
use crate::platform::git::worktree;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub kind: String,
    pub source_ref: String,
    pub git_sha: Option<String>,
    pub worktree_path: Option<String>,
    pub mode: String,
    pub status: String,
    pub manifest_fingerprint: Option<String>,
    pub failure_reason: Option<String>,
    pub failed_at: Option<String>,
    pub created_by: Option<String>,
    pub source_workspace_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRecord {
    pub id: String,
    pub workspace_id: String,
    pub service_name: String,
    pub exposure: String,
    pub port_override: Option<i64>,
    pub status: String,
    pub status_reason: Option<String>,
    pub default_port: Option<i64>,
    pub effective_port: Option<i64>,
    pub preview_status: String,
    pub preview_failure_reason: Option<String>,
    pub preview_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalRecord {
    pub id: String,
    pub workspace_id: String,
    pub launch_type: String,
    pub harness_provider: Option<String>,
    pub harness_session_id: Option<String>,
    pub created_by: Option<String>,
    pub label: String,
    #[allow(dead_code)]
    #[serde(skip_serializing)]
    pub label_origin: Option<String>,
    pub status: String,
    pub failure_reason: Option<String>,
    pub exit_code: Option<i64>,
    pub started_at: String,
    pub last_active_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceSnapshotResult {
    pub workspace: Option<WorkspaceRecord>,
    pub services: Vec<ServiceRecord>,
    pub terminals: Vec<TerminalRecord>,
}

fn map_terminal_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<TerminalRecord> {
    Ok(TerminalRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        launch_type: row.get(2)?,
        harness_provider: row.get(3)?,
        harness_session_id: row.get(4)?,
        created_by: row.get(5)?,
        label: row.get(6)?,
        label_origin: row.get(7)?,
        status: row.get(8)?,
        failure_reason: row.get(9)?,
        exit_code: row.get(10)?,
        started_at: row.get(11)?,
        last_active_at: row.get(12)?,
        ended_at: row.get(13)?,
    })
}

fn map_workspace_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceRecord> {
    Ok(WorkspaceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        kind: row.get(3)?,
        source_ref: row.get(4)?,
        git_sha: row.get(5)?,
        worktree_path: row.get(6)?,
        mode: row.get(7)?,
        status: row.get(8)?,
        manifest_fingerprint: row.get(9)?,
        failure_reason: row.get(10)?,
        failed_at: row.get(11)?,
        created_by: row.get(12)?,
        source_workspace_id: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        last_active_at: row.get(16)?,
        expires_at: row.get(17)?,
    })
}

fn sort_project_workspaces(workspaces: &mut [WorkspaceRecord]) {
    workspaces.sort_by(|left, right| {
        match (
            is_root_workspace_kind(&left.kind),
            is_root_workspace_kind(&right.kind),
        ) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => right.created_at.cmp(&left.created_at),
        }
    });
}

fn get_workspace_sync(
    conn: &rusqlite::Connection,
    project_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, status, manifest_fingerprint, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at
         FROM workspace
         WHERE project_id = ?1
         ORDER BY CASE WHEN kind = 'root' THEN 0 ELSE 1 END, created_at DESC
         LIMIT 1"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![project_id], map_workspace_record);

    match row {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(LifecycleError::Database(e.to_string())),
    }
}

pub async fn get_workspace(
    db_path: &str,
    project_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.get", move |conn| {
        get_workspace_sync(conn, project_id)
    })
    .await
}

fn get_workspace_by_id_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, status, manifest_fingerprint, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at
         FROM workspace
         WHERE id = ?1
         LIMIT 1"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![workspace_id], map_workspace_record);

    match row {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(LifecycleError::Database(e.to_string())),
    }
}

pub async fn get_workspace_by_id(
    db_path: &str,
    workspace_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.get_by_id", move |conn| {
        get_workspace_by_id_sync(conn, workspace_id)
    })
    .await
}

fn list_workspaces_sync(
    conn: &rusqlite::Connection,
) -> Result<Vec<WorkspaceRecord>, LifecycleError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, status, manifest_fingerprint, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at
         FROM workspace
         ORDER BY created_at DESC"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], map_workspace_record)
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    Ok(result)
}

pub async fn list_workspaces(db_path: &str) -> Result<Vec<WorkspaceRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.list", list_workspaces_sync).await
}

fn list_workspaces_by_project_sync(
    conn: &rusqlite::Connection,
) -> Result<HashMap<String, Vec<WorkspaceRecord>>, LifecycleError> {
    let workspace_rows = list_workspaces_sync(conn)?;
    let mut grouped: HashMap<String, Vec<WorkspaceRecord>> = HashMap::new();

    for workspace in workspace_rows {
        grouped
            .entry(workspace.project_id.clone())
            .or_default()
            .push(workspace);
    }

    for workspaces in grouped.values_mut() {
        sort_project_workspaces(workspaces);
    }

    Ok(grouped)
}

pub async fn list_workspaces_by_project(
    db_path: &str,
) -> Result<HashMap<String, Vec<WorkspaceRecord>>, LifecycleError> {
    run_blocking_db_read(
        db_path.to_string(),
        "workspace.list_by_project",
        list_workspaces_by_project_sync,
    )
    .await
}

fn get_workspace_services_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, service_name, exposure, port_override, status, status_reason, default_port, effective_port, preview_status, preview_failure_reason, preview_url, created_at, updated_at FROM workspace_service WHERE workspace_id = ?1 ORDER BY service_name"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok(ServiceRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                service_name: row.get(2)?,
                exposure: row.get(3)?,
                port_override: row.get(4)?,
                status: row.get(5)?,
                status_reason: row.get(6)?,
                default_port: row.get(7)?,
                effective_port: row.get(8)?,
                preview_status: row.get(9)?,
                preview_failure_reason: row.get(10)?,
                preview_url: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    Ok(result)
}

pub async fn get_workspace_services(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.services", move |conn| {
        get_workspace_services_sync(conn, workspace_id)
    })
    .await
}

fn get_workspace_snapshot_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<WorkspaceSnapshotResult, LifecycleError> {
    let workspace = get_workspace_by_id_sync(conn, workspace_id.clone())?;
    let services = get_workspace_services_sync(conn, workspace_id.clone())?;
    let terminals = list_workspace_terminals_sync(conn, workspace_id)?;

    Ok(WorkspaceSnapshotResult {
        workspace,
        services,
        terminals,
    })
}

pub async fn get_workspace_snapshot(
    db_path: &str,
    workspace_id: String,
) -> Result<WorkspaceSnapshotResult, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.snapshot", move |conn| {
        get_workspace_snapshot_sync(conn, workspace_id)
    })
    .await
}

pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    worktree::get_current_branch(&project_path).await
}

fn list_workspace_terminals_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Vec<TerminalRecord>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
             FROM terminal
             WHERE workspace_id = ?1
             ORDER BY started_at DESC, id DESC",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let rows = stmt
        .query_map(params![workspace_id], map_terminal_record)
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }

    Ok(result)
}

pub async fn list_workspace_terminals(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<TerminalRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "workspace.terminals", move |conn| {
        list_workspace_terminals_sync(conn, workspace_id)
    })
    .await
}

fn get_terminal_by_id_sync(
    conn: &rusqlite::Connection,
    terminal_id: String,
) -> Result<Option<TerminalRecord>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
             FROM terminal
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![terminal_id], map_terminal_record);
    match row {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub async fn get_terminal_by_id(
    db_path: &str,
    terminal_id: String,
) -> Result<Option<TerminalRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "terminal.get_by_id", move |conn| {
        get_terminal_by_id_sync(conn, terminal_id)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::run_migrations;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-query-workspaces-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn seed_project_workspaces(db_path: &str) {
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3), (?4, ?5, ?6)",
            rusqlite::params![
                "project_1",
                "/tmp/project_1",
                "Project 1",
                "project_2",
                "/tmp/project_2",
                "Project 2"
            ],
        )
        .expect("insert projects");
        conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, kind, source_ref, status, mode, created_at, updated_at, last_active_at
            ) VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8),
                (?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?16),
                (?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?24, ?24),
                (?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?32, ?32)",
            rusqlite::params![
                "workspace_root",
                "project_1",
                "Root",
                "root",
                "main",
                "idle",
                "local",
                "2026-03-10 12:00:00",
                "workspace_managed_old",
                "project_1",
                "Old Managed",
                "managed",
                "lifecycle/old",
                "idle",
                "local",
                "2026-03-10 12:05:00",
                "workspace_managed_new",
                "project_1",
                "New Managed",
                "managed",
                "lifecycle/new",
                "idle",
                "local",
                "2026-03-10 12:10:00",
                "workspace_other_project",
                "project_2",
                "Other Root",
                "root",
                "develop",
                "idle",
                "local",
                "2026-03-10 12:15:00"
            ],
        )
        .expect("insert workspaces");
    }

    #[tokio::test]
    async fn get_workspace_snapshot_returns_workspace_services_and_terminals() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("run migrations");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, kind, source_ref, worktree_path, mode, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "managed",
                "main",
                "/tmp/project_1/worktree",
                "local",
                "active"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status, default_port, effective_port
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                "service_1",
                "workspace_1",
                "web",
                "local",
                "ready",
                3000_i64,
                3000_i64
            ],
        )
        .expect("insert service");
        conn.execute(
            "INSERT INTO terminal (id, workspace_id, label, status)
             VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params!["terminal_1", "workspace_1", "Shell", "detached"],
        )
        .expect("insert terminal");
        drop(conn);

        let snapshot = get_workspace_snapshot(&db_path, "workspace_1".to_string())
            .await
            .expect("query workspace snapshot");

        assert_eq!(
            snapshot
                .workspace
                .as_ref()
                .map(|workspace| workspace.id.as_str()),
            Some("workspace_1")
        );
        assert_eq!(snapshot.services.len(), 1);
        assert_eq!(snapshot.services[0].service_name, "web");
        assert_eq!(snapshot.terminals.len(), 1);
        assert_eq!(snapshot.terminals[0].id, "terminal_1");

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn get_workspace_prefers_root_workspace_for_project() {
        let db_path = temp_db_path();
        seed_project_workspaces(&db_path);

        let workspace = get_workspace(&db_path, "project_1".to_string())
            .await
            .expect("load workspace")
            .expect("workspace exists");

        assert_eq!(workspace.id, "workspace_root");
        assert_eq!(workspace.kind, "root");

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn list_workspaces_by_project_orders_root_first_then_newest_managed() {
        let db_path = temp_db_path();
        seed_project_workspaces(&db_path);

        let grouped = list_workspaces_by_project(&db_path)
            .await
            .expect("list workspaces by project");
        let project_workspaces = grouped.get("project_1").expect("project group exists");
        let ordered_ids = project_workspaces
            .iter()
            .map(|workspace| workspace.id.as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            ordered_ids,
            vec![
                "workspace_root",
                "workspace_managed_new",
                "workspace_managed_old",
            ]
        );

        let _ = std::fs::remove_file(db_path);
    }
}
