use crate::platform::db::{open_db, DbPath};
use crate::shared::errors::LifecycleError;
use crate::RootGitWatcherMap;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectRow {
    pub id: String,
    pub path: String,
    pub name: String,
    pub manifest_path: String,
    pub manifest_valid: bool,
    pub organization_id: Option<String>,
    pub repository_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[tauri::command]
pub async fn list_projects(db_path: State<'_, DbPath>) -> Result<Vec<ProjectRow>, LifecycleError> {
    let conn = open_db(&db_path.0)?;
    let mut stmt = conn
        .prepare("SELECT id, path, name, manifest_path, manifest_valid, organization_id, repository_id, created_at, updated_at FROM project ORDER BY created_at DESC")
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            let valid_int: i64 = row.get(4)?;
            Ok(ProjectRow {
                id: row.get(0)?,
                path: row.get(1)?,
                name: row.get(2)?,
                manifest_path: row.get(3)?,
                manifest_valid: valid_int != 0,
                organization_id: row.get(5)?,
                repository_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    Ok(result)
}

#[tauri::command]
pub async fn add_project(
    db_path: State<'_, DbPath>,
    id: String,
    path: String,
    name: String,
    manifest_valid: bool,
) -> Result<ProjectRow, LifecycleError> {
    let conn = open_db(&db_path.0)?;
    conn.execute(
        "INSERT INTO project (id, path, name, manifest_valid) VALUES (?1, ?2, ?3, ?4)",
        params![id, path, name, manifest_valid as i64],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut stmt = conn
        .prepare("SELECT id, path, name, manifest_path, manifest_valid, organization_id, repository_id, created_at, updated_at FROM project WHERE id = ?1")
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    stmt.query_row(params![id], |row| {
        let valid_int: i64 = row.get(4)?;
        Ok(ProjectRow {
            id: row.get(0)?,
            path: row.get(1)?,
            name: row.get(2)?,
            manifest_path: row.get(3)?,
            manifest_valid: valid_int != 0,
            organization_id: row.get(5)?,
            repository_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })
    .map_err(|e| LifecycleError::Database(e.to_string()))
}

#[tauri::command]
pub async fn remove_project(
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    id: String,
) -> Result<(), LifecycleError> {
    crate::capabilities::workspaces::git_watcher::stop_root_git_watchers_for_project(
        &db_path.0,
        &root_git_watchers,
        &id,
    )?;

    let mut conn = open_db(&db_path.0)?;
    let tx = conn
        .transaction()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    tx.execute("DELETE FROM workspace WHERE project_id = ?1", params![id])
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    tx.execute("DELETE FROM project WHERE id = ?1", params![id])
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    tx.commit()
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn update_manifest_status(
    db_path: State<'_, DbPath>,
    id: String,
    valid: bool,
) -> Result<(), LifecycleError> {
    let conn = open_db(&db_path.0)?;
    conn.execute(
        "UPDATE project SET manifest_valid = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![valid as i64, id],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn read_manifest_text(dir_path: String) -> Result<Option<String>, LifecycleError> {
    let manifest_path = PathBuf::from(dir_path).join("lifecycle.json");

    match std::fs::read_to_string(&manifest_path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(LifecycleError::Io(format!(
            "failed to read {}: {}",
            manifest_path.display(),
            error
        ))),
    }
}
