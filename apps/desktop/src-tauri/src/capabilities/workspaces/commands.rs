use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::SupervisorMap;
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    project_id: String,
    project_path: String,
    workspace_name: Option<String>,
    base_ref: Option<String>,
    worktree_root: Option<String>,
) -> Result<String, LifecycleError> {
    super::create::create_workspace(
        app,
        db_path,
        project_id,
        project_path,
        workspace_name,
        base_ref,
        worktree_root,
    )
    .await
}

#[tauri::command]
pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
    manifest_json: String,
) -> Result<(), LifecycleError> {
    super::start::start_services(app, db_path, supervisors, workspace_id, manifest_json).await
}

#[tauri::command]
pub async fn stop_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::stop::stop_workspace(app, db_path, supervisors, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace(
    db_path: State<'_, DbPath>,
    project_id: String,
) -> Result<Option<super::query::WorkspaceRow>, LifecycleError> {
    super::query::get_workspace(&db_path.0, project_id).await
}

#[tauri::command]
pub async fn get_workspace_by_id(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<super::query::WorkspaceRow>, LifecycleError> {
    super::query::get_workspace_by_id(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn list_workspaces(
    db_path: State<'_, DbPath>,
) -> Result<Vec<super::query::WorkspaceRow>, LifecycleError> {
    super::query::list_workspaces(&db_path.0).await
}

#[tauri::command]
pub async fn list_workspaces_by_project(
    db_path: State<'_, DbPath>,
) -> Result<HashMap<String, Vec<super::query::WorkspaceRow>>, LifecycleError> {
    super::query::list_workspaces_by_project(&db_path.0).await
}

#[tauri::command]
pub async fn get_workspace_services(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::query::ServiceRow>, LifecycleError> {
    super::query::get_workspace_services(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    super::query::get_current_branch(project_path).await
}
