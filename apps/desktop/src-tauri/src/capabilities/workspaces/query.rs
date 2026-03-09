use crate::platform::db::open_db;
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
    pub source_ref: String,
    pub git_sha: Option<String>,
    pub worktree_path: Option<String>,
    pub mode: String,
    pub status: String,
    pub failure_reason: Option<String>,
    pub failed_at: Option<String>,
    pub created_by: Option<String>,
    pub source_workspace_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
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
    pub preview_state: String,
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
        source_ref: row.get(3)?,
        git_sha: row.get(4)?,
        worktree_path: row.get(5)?,
        mode: row.get(6)?,
        status: row.get(7)?,
        failure_reason: row.get(8)?,
        failed_at: row.get(9)?,
        created_by: row.get(10)?,
        source_workspace_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        last_active_at: row.get(14)?,
        expires_at: row.get(15)?,
    })
}

pub async fn get_workspace(
    db_path: &str,
    project_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, source_ref, git_sha, worktree_path, mode, status, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at FROM workspace WHERE project_id = ?1 ORDER BY created_at DESC LIMIT 1"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![project_id], map_workspace_record);

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
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, source_ref, git_sha, worktree_path, mode, status, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at FROM workspace WHERE id = ?1 LIMIT 1"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![workspace_id], map_workspace_record);

    match row {
        Ok(r) => Ok(Some(r)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(LifecycleError::Database(e.to_string())),
    }
}

pub async fn list_workspaces(db_path: &str) -> Result<Vec<WorkspaceRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, source_ref, git_sha, worktree_path, mode, status, failure_reason, failed_at, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at FROM workspace WHERE status != 'destroying' ORDER BY created_at DESC"
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

pub async fn list_workspaces_by_project(
    db_path: &str,
) -> Result<HashMap<String, Vec<WorkspaceRecord>>, LifecycleError> {
    let workspace_rows = list_workspaces(db_path).await?;
    let mut grouped: HashMap<String, Vec<WorkspaceRecord>> = HashMap::new();

    for workspace in workspace_rows {
        grouped
            .entry(workspace.project_id.clone())
            .or_default()
            .push(workspace);
    }

    Ok(grouped)
}

pub async fn get_workspace_services(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, service_name, exposure, port_override, status, status_reason, default_port, effective_port, preview_state, preview_failure_reason, preview_url, created_at, updated_at FROM workspace_service WHERE workspace_id = ?1 ORDER BY service_name"
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
                preview_state: row.get(9)?,
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

pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    worktree::get_current_branch(&project_path).await
}

pub async fn list_workspace_terminals(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<TerminalRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
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

pub async fn get_terminal_by_id(
    db_path: &str,
    terminal_id: String,
) -> Result<Option<TerminalRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
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
