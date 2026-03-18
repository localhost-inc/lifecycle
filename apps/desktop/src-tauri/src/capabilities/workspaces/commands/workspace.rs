use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::RootGitWatcherMap;
use crate::WorkspaceControllerRegistryHandle;
use serde::Deserialize;
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceCommandInput {
    project_id: String,
    project_path: String,
    workspace_name: Option<String>,
    base_ref: Option<String>,
    worktree_root: Option<String>,
    kind: Option<String>,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
}

#[tauri::command]
pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    input: CreateWorkspaceCommandInput,
) -> Result<String, LifecycleError> {
    let db_path_value = db_path.0.clone();
    let workspace_id = super::super::create::create_workspace(
        app.clone(),
        db_path,
        super::super::create::CreateWorkspaceRequest {
            project_id: input.project_id,
            project_path: input.project_path,
            workspace_name: input.workspace_name,
            base_ref: input.base_ref,
            worktree_root: input.worktree_root,
            kind: input.kind,
            manifest_json: input.manifest_json,
            manifest_fingerprint: input.manifest_fingerprint,
        },
    )
    .await?;

    if let Err(error) = super::super::git_watcher::ensure_root_git_watcher(
        &app,
        &db_path_value,
        &root_git_watchers,
        &workspace_id,
    ) {
        crate::platform::diagnostics::append_error("root-git-watcher-create", error);
    }

    Ok(workspace_id)
}

#[tauri::command]
pub async fn rename_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    name: String,
) -> Result<super::super::query::WorkspaceRecord, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::rename::rename_workspace(app, &db_path.0, &workspace_id, &name).await
}

#[tauri::command]
pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    manifest_json: String,
    manifest_fingerprint: String,
    service_names: Option<Vec<String>>,
) -> Result<(), LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::environment::start_services(
        app,
        db_path,
        workspace_controllers,
        workspace_id,
        manifest_json,
        manifest_fingerprint,
        service_names,
    )
    .await
}

#[tauri::command]
pub async fn sync_workspace_manifest(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
) -> Result<(), LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::environment::sync_workspace_manifest(
        Some(&app),
        &db_path.0,
        workspace_id,
        manifest_json,
        manifest_fingerprint,
    )
    .await
}

#[tauri::command]
pub async fn stop_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::super::stop::stop_workspace(app, db_path, workspace_controllers, workspace_id).await
}

#[tauri::command]
pub async fn destroy_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::super::destroy::destroy_workspace(
        app,
        db_path,
        root_git_watchers,
        workspace_controllers,
        workspace_id,
    )
    .await
}

#[tauri::command]
pub async fn get_workspace(
    db_path: State<'_, DbPath>,
    project_id: String,
) -> Result<Option<super::super::query::WorkspaceRecord>, LifecycleError> {
    super::super::query::get_workspace(&db_path.0, project_id).await
}

#[tauri::command]
pub async fn get_workspace_by_id(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<super::super::query::WorkspaceRecord>, LifecycleError> {
    super::super::query::get_workspace_by_id(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_snapshot(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<super::super::query::WorkspaceSnapshotResult, LifecycleError> {
    super::super::query::get_workspace_snapshot(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_runtime_projection(
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<super::super::controller::WorkspaceRuntimeProjectionSnapshot, LifecycleError> {
    Ok(workspace_controllers
        .get(&workspace_id)
        .await
        .map(|controller| controller.runtime_projection_snapshot())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn list_workspaces(
    db_path: State<'_, DbPath>,
) -> Result<Vec<super::super::query::WorkspaceRecord>, LifecycleError> {
    super::super::query::list_workspaces(&db_path.0).await
}

#[tauri::command]
pub async fn list_workspaces_by_project(
    db_path: State<'_, DbPath>,
) -> Result<HashMap<String, Vec<super::super::query::WorkspaceRecord>>, LifecycleError> {
    super::super::query::list_workspaces_by_project(&db_path.0).await
}

#[tauri::command]
pub async fn get_workspace_services(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::super::query::ServiceRecord>, LifecycleError> {
    super::super::query::get_workspace_services(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn update_workspace_service(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    service_name: String,
    exposure: String,
    port_override: Option<i64>,
) -> Result<(), LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    let _service = super::super::service::update_workspace_service(
        Some(&app),
        &db_path.0,
        workspace_id,
        service_name,
        exposure,
        port_override,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    super::super::query::get_current_branch(project_path).await
}
