use super::environment::sync_workspace_manifest_from_disk_if_idle;
use super::preview::preview_url_for_service;
#[cfg(test)]
use crate::platform::db::open_db;
use crate::platform::db::run_blocking_db_read;
use crate::platform::git::worktree;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub checkout_type: String,
    pub source_ref: String,
    pub git_sha: Option<String>,
    pub worktree_path: Option<String>,
    pub host: String,
    pub manifest_fingerprint: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_active_at: String,
    pub prepared_at: Option<String>,
    pub status: String,
    pub failure_reason: Option<String>,
    pub failed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceRecord {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub status: String,
    pub status_reason: Option<String>,
    pub assigned_port: Option<i64>,
    pub preview_url: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn map_workspace_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceRecord> {
    Ok(WorkspaceRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        checkout_type: row.get(3)?,
        source_ref: row.get(4)?,
        git_sha: row.get(5)?,
        worktree_path: row.get(6)?,
        host: row.get(7)?,
        manifest_fingerprint: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        last_active_at: row.get(11)?,
        prepared_at: row.get(12)?,
        status: row.get(13)?,
        failure_reason: row.get(14)?,
        failed_at: row.get(15)?,
    })
}

fn get_workspace_by_id_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, checkout_type, source_ref, git_sha, worktree_path, host, manifest_fingerprint, created_at, updated_at, last_active_at, prepared_at, status, failure_reason, failed_at
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

fn get_workspace_services_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Vec<ServiceRecord>, LifecycleError> {
    if !workspace_exists_sync(conn, &workspace_id)? {
        return Err(LifecycleError::WorkspaceNotFound(workspace_id));
    }

    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, name, status, status_reason, assigned_port, created_at, updated_at
         FROM service
         WHERE workspace_id = ?1
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
        let (id, workspace_id, name, status, status_reason, assigned_port, created_at, updated_at) =
            row.map_err(|e| LifecycleError::Database(e.to_string()))?;
        let preview_url = preview_url_for_service(conn, &workspace_id, &name)?;
        result.push(ServiceRecord {
            id,
            workspace_id,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::manifest::parse_lifecycle_config_with_fingerprint;
    use crate::platform::db::apply_test_schema;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-query-workspaces-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    #[tokio::test]
    async fn get_workspace_services_reconciles_idle_manifest_from_disk() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);
        let worktree_path =
            std::env::temp_dir().join(format!("lifecycle-query-worktree-{}", uuid::Uuid::new_v4()));
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
                id, project_id, name, checkout_type, source_ref, worktree_path, host, status, manifest_fingerprint,
                created_at, updated_at, last_active_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?10)",
            rusqlite::params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "worktree",
                "lifecycle/workspace-1",
                worktree_path.to_string_lossy().to_string(),
                "local",
                "active",
                "stale-manifest",
                "2026-03-19 12:00:00"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (
                id, workspace_id, name, status, status_reason, assigned_port
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
            .prepare("SELECT name FROM service WHERE workspace_id = ?1 ORDER BY name")
            .expect("prepare service query")
            .query_map(rusqlite::params!["workspace_1"], |row| {
                row.get::<_, String>(0)
            })
            .expect("query services")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect services");
        assert_eq!(persisted_names, vec!["api"]);

        let _ = std::fs::remove_file(db_path);
        let _ = std::fs::remove_dir_all(worktree_path);
    }

    #[tokio::test]
    async fn get_workspace_services_fails_when_workspace_is_missing() {
        let db_path = temp_db_path();
        apply_test_schema(&db_path);

        let error = get_workspace_services(&db_path, "workspace_1".to_string())
            .await
            .expect_err("missing workspace should fail");

        match error {
            LifecycleError::WorkspaceNotFound(workspace_id) => {
                assert_eq!(workspace_id, "workspace_1");
            }
            other => panic!("expected workspace missing error, got {other:?}"),
        }

        let _ = std::fs::remove_file(db_path);
    }
}
