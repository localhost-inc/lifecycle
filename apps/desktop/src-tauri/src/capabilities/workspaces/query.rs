use super::kind::is_root_workspace_kind;
use super::preview::preview_url_for_service;
use super::environment::sync_workspace_manifest_from_disk_if_idle;
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
    pub manifest_fingerprint: Option<String>,
    pub created_by: Option<String>,
    pub source_workspace_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: String,
    pub expires_at: Option<String>,
    pub prepared_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentRecord {
    pub workspace_id: String,
    pub status: String,
    pub failure_reason: Option<String>,
    pub failed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRecord {
    pub id: String,
    pub environment_id: String,
    pub name: String,
    pub status: String,
    pub status_reason: Option<String>,
    pub assigned_port: Option<i64>,
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
    #[allow(dead_code)]
    #[serde(skip_serializing)]
    pub harness_launch_mode: String,
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
        harness_launch_mode: row.get(5)?,
        created_by: row.get(6)?,
        label: row.get(7)?,
        label_origin: row.get(8)?,
        status: row.get(9)?,
        failure_reason: row.get(10)?,
        exit_code: row.get(11)?,
        started_at: row.get(12)?,
        last_active_at: row.get(13)?,
        ended_at: row.get(14)?,
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
        manifest_fingerprint: row.get(8)?,
        created_by: row.get(9)?,
        source_workspace_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        last_active_at: row.get(13)?,
        expires_at: row.get(14)?,
        prepared_at: row.get(15)?,
    })
}

fn map_environment_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<EnvironmentRecord> {
    Ok(EnvironmentRecord {
        workspace_id: row.get(0)?,
        status: row.get(1)?,
        failure_reason: row.get(2)?,
        failed_at: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
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
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, manifest_fingerprint, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at, prepared_at
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
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, manifest_fingerprint, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at, prepared_at
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
        "SELECT id, project_id, name, kind, source_ref, git_sha, worktree_path, mode, manifest_fingerprint, created_by, source_workspace_id, created_at, updated_at, last_active_at, expires_at, prepared_at
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

fn workspace_exists_sync(
    conn: &rusqlite::Connection,
    workspace_id: &str,
) -> Result<bool, LifecycleError> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM workspace WHERE id = ?1)",
        params![workspace_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|exists| exists > 0)
    .map_err(|error| LifecycleError::Database(error.to_string()))
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

fn get_workspace_environment_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<EnvironmentRecord, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT workspace_id, status, failure_reason, failed_at, created_at, updated_at
             FROM environment
             WHERE workspace_id = ?1
             LIMIT 1",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![workspace_id.clone()], map_environment_record);
    match row {
        Ok(row) => Ok(row),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            if workspace_exists_sync(conn, &workspace_id)? {
                Err(LifecycleError::Database(format!(
                    "workspace {workspace_id} is missing required environment row"
                )))
            } else {
                Err(LifecycleError::WorkspaceNotFound(workspace_id))
            }
        }
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub async fn get_workspace_environment(
    db_path: &str,
    workspace_id: String,
) -> Result<EnvironmentRecord, LifecycleError> {
    run_blocking_db_read(
        db_path.to_string(),
        "workspace.environment",
        move |conn| get_workspace_environment_sync(conn, workspace_id),
    )
    .await
}

fn get_workspace_services_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    if !workspace_exists_sync(conn, &workspace_id)? {
        return Err(LifecycleError::WorkspaceNotFound(workspace_id));
    }

    let has_environment = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM environment WHERE workspace_id = ?1)",
            params![workspace_id.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map(|exists| exists > 0)
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    if !has_environment {
        return Err(LifecycleError::Database(format!(
            "workspace {workspace_id} is missing required environment row"
        )));
    }

    let mut stmt = conn.prepare(
        "SELECT id, environment_id, name, status, status_reason, assigned_port, created_at, updated_at
         FROM service
         WHERE environment_id = ?1
         ORDER BY name"
    ).map_err(|e| LifecycleError::Database(e.to_string()))?;

    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for row in rows {
        let (
            id,
            environment_id,
            name,
            status,
            status_reason,
            assigned_port,
            created_at,
            updated_at,
        ) = row.map_err(|e| LifecycleError::Database(e.to_string()))?;
        let preview_url = preview_url_for_service(conn, &environment_id, &name)?;
        result.push(ServiceRecord {
            id,
            environment_id,
            name,
            status,
            status_reason,
            assigned_port,
            preview_url,
            created_at,
            updated_at,
        });
    }
    Ok(result)
}

pub async fn get_workspace_services(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    let sync_db_path = db_path.to_string();
    let sync_workspace_id = workspace_id.clone();
    tokio::task::spawn_blocking(move || {
        sync_workspace_manifest_from_disk_if_idle(&sync_db_path, &sync_workspace_id)
    })
    .await
    .map_err(|error| {
        LifecycleError::Database(format!(
            "blocking manifest sync task 'workspace.services.sync' failed: {error}"
        ))
    })??;

    run_blocking_db_read(db_path.to_string(), "workspace.services", move |conn| {
        get_workspace_services_sync(conn, workspace_id)
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
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, harness_launch_mode, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
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
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, harness_launch_mode, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
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
    use crate::capabilities::workspaces::manifest::parse_lifecycle_config_with_fingerprint;
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
                id, project_id, name, kind, source_ref, mode, created_at, updated_at, last_active_at
            ) VALUES
                (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?7),
                (?8, ?9, ?10, ?11, ?12, ?13, ?14, ?14, ?14),
                (?15, ?16, ?17, ?18, ?19, ?20, ?21, ?21, ?21),
                (?22, ?23, ?24, ?25, ?26, ?27, ?28, ?28, ?28)",
            rusqlite::params![
                "workspace_root",
                "project_1",
                "Root",
                "root",
                "main",
                "local",
                "2026-03-10 12:00:00",
                "workspace_managed_old",
                "project_1",
                "Old Managed",
                "managed",
                "lifecycle/old",
                "local",
                "2026-03-10 12:05:00",
                "workspace_managed_new",
                "project_1",
                "New Managed",
                "managed",
                "lifecycle/new",
                "local",
                "2026-03-10 12:10:00",
                "workspace_other_project",
                "project_2",
                "Other Root",
                "root",
                "develop",
                "local",
                "2026-03-10 12:15:00"
            ],
        )
        .expect("insert workspaces");
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

    #[tokio::test]
    async fn get_workspace_services_reconciles_idle_manifest_from_disk() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("run migrations");
        let worktree_path = std::env::temp_dir()
            .join(format!("lifecycle-query-worktree-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&worktree_path).expect("create worktree dir");
        let manifest_text = r#"{
            "workspace": { "prepare": [], "teardown": [] },
            "environment": {
                "api": {
                    "kind": "service",
                    "runtime": "process",
                    "command": "bun run api"
                }
            }
        }"#;
        std::fs::write(worktree_path.join("lifecycle.json"), manifest_text)
            .expect("write manifest");
        let (_, manifest_fingerprint) =
            parse_lifecycle_config_with_fingerprint(manifest_text).expect("parse manifest");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, kind, source_ref, worktree_path, mode, manifest_fingerprint,
                created_at, updated_at, last_active_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?9)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "managed",
                "lifecycle/workspace-1",
                worktree_path.to_string_lossy().to_string(),
                "local",
                "stale-manifest",
                "2026-03-19 12:00:00"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO environment (workspace_id, status) VALUES (?1, 'idle')",
            rusqlite::params!["workspace_1"],
        )
        .expect("insert environment");
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, status_reason, assigned_port
            ) VALUES (?1, ?2, ?3, 'stopped', NULL, NULL)",
            rusqlite::params!["svc_old", "workspace_1", "web"],
        )
        .expect("insert stale service");
        drop(conn);

        let services = get_workspace_services(&db_path, "workspace_1".to_string())
            .await
            .expect("load services");

        assert_eq!(services.len(), 1);
        assert_eq!(services[0].name, "api");

        let conn = open_db(&db_path).expect("reopen db");
        let fingerprint: Option<String> = conn
            .query_row(
                "SELECT manifest_fingerprint FROM workspace WHERE id = ?1",
                rusqlite::params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("load manifest fingerprint");
        assert_eq!(fingerprint.as_deref(), Some(manifest_fingerprint.as_str()));

        let persisted_names = conn
            .prepare("SELECT name FROM service WHERE environment_id = ?1 ORDER BY name")
            .expect("prepare service query")
            .query_map(rusqlite::params!["workspace_1"], |row| row.get::<_, String>(0))
            .expect("query services")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect services");
        assert_eq!(persisted_names, vec!["api"]);

        let _ = std::fs::remove_file(db_path);
        let _ = std::fs::remove_dir_all(worktree_path);
    }

    #[tokio::test]
    async fn get_workspace_services_fails_when_workspace_environment_invariant_is_broken() {
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
                id, project_id, name, kind, source_ref, worktree_path, mode,
                created_at, updated_at, last_active_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, ?8)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "managed",
                "lifecycle/workspace-1",
                "/tmp/project_1/worktree",
                "local",
                "2026-03-20 10:00:00"
            ],
        )
        .expect("insert workspace");
        drop(conn);

        let error = get_workspace_services(&db_path, "workspace_1".to_string())
            .await
            .expect_err("broken environment invariant should fail");

        match error {
            LifecycleError::Database(message) => {
                assert!(message.contains("missing required environment row"));
            }
            other => panic!("expected database invariant error, got {other:?}"),
        }

        let _ = std::fs::remove_file(db_path);
    }
}
