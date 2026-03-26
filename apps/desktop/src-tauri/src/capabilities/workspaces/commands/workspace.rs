use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::RootGitWatcherMap;
use crate::WorkspaceControllerRegistryHandle;
use serde::Deserialize;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnsureWorkspaceCommandInput {
    workspace_id: String,
    project_path: String,
    name: String,
    source_ref: String,
    checkout_type: String,
    base_ref: Option<String>,
    worktree_root: Option<String>,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
}

#[tauri::command]
pub async fn ensure_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    input: EnsureWorkspaceCommandInput,
) -> Result<super::super::query::WorkspaceRecord, LifecycleError> {
    let db_path_value = db_path.0.clone();
    let workspace_id = super::super::ensure::ensure_workspace(
        app.clone(),
        db_path,
        super::super::ensure::EnsureWorkspaceRequest {
            workspace_id: input.workspace_id,
            project_path: input.project_path,
            name: input.name,
            source_ref: input.source_ref,
            checkout_type: input.checkout_type,
            base_ref: input.base_ref,
            worktree_root: input.worktree_root,
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

    let workspace = super::super::query::get_workspace_by_id(&db_path_value, workspace_id.clone())
        .await?
        .ok_or(LifecycleError::WorkspaceNotFound(workspace_id))?;

    Ok(workspace)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameWorkspaceCommandInput {
    workspace_id: String,
    name: String,
    source_ref: String,
    name_origin: String,
    source_ref_origin: String,
    rename_branch: bool,
    move_worktree: bool,
}

#[tauri::command]
pub async fn rename_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    input: RenameWorkspaceCommandInput,
) -> Result<super::super::query::WorkspaceRecord, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&input.workspace_id)
        .await?;
    super::super::rename::rename_workspace(
        &app,
        &db_path.0,
        super::super::rename::RenameWorkspaceRequest {
            workspace_id: input.workspace_id,
            name: input.name,
            source_ref: input.source_ref,
            name_origin: input.name_origin,
            source_ref_origin: input.source_ref_origin,
            rename_branch: input.rename_branch,
            move_worktree: input.move_worktree,
        },
    )
    .await
}

#[tauri::command]
pub async fn start_workspace_services(
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
    super::super::environment::start_workspace_services(
        app,
        db_path,
        workspace_controllers,
        workspace_id,
        manifest_json,
        manifest_fingerprint,
        service_names,
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn stop_workspace_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::super::stop::stop_workspace_services(app, db_path, workspace_controllers, workspace_id)
        .await
}

#[tauri::command]
pub async fn archive_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    input: super::super::archive::ArchiveWorkspaceRequest,
) -> Result<(), LifecycleError> {
    super::super::archive::archive_workspace(
        app,
        db_path,
        root_git_watchers,
        workspace_controllers,
        input,
    )
    .await
}

#[tauri::command]
pub async fn get_workspace_activity(
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<Vec<crate::shared::lifecycle_events::LifecycleEnvelope>, LifecycleError> {
    Ok(workspace_controllers
        .get(&workspace_id)
        .await
        .map(|controller| controller.activity())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn get_workspace_service_logs(
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<Vec<super::super::controller::ServiceLogSnapshot>, LifecycleError> {
    Ok(workspace_controllers
        .get(&workspace_id)
        .await
        .map(|controller| controller.service_logs())
        .unwrap_or_default())
}

#[tauri::command]
pub async fn get_workspace_services(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::super::query::ServiceRecord>, LifecycleError> {
    super::super::query::get_workspace_services(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    super::super::query::get_current_branch(project_path).await
}
