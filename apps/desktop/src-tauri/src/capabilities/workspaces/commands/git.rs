use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::WorkspaceControllerRegistryHandle;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_workspace_git_status(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::status::GitStatusResult, LifecycleError> {
    super::super::git::get_workspace_git_status(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_diff(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
    scope: String,
) -> Result<crate::platform::git::status::GitDiffResult, LifecycleError> {
    super::super::git::get_workspace_git_diff(&db_path.0, workspace_id, file_path, scope).await
}

#[tauri::command]
pub async fn get_workspace_git_scope_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    scope: String,
) -> Result<String, LifecycleError> {
    super::super::git::get_workspace_git_scope_patch(&db_path.0, workspace_id, scope).await
}

#[tauri::command]
pub async fn get_workspace_git_changes_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<String, LifecycleError> {
    super::super::git::get_workspace_git_changes_patch(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn list_workspace_git_log(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    limit: u32,
) -> Result<Vec<crate::platform::git::status::GitLogEntry>, LifecycleError> {
    super::super::git::list_workspace_git_log(&db_path.0, workspace_id, limit).await
}

#[tauri::command]
pub async fn list_workspace_git_pull_requests(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestListResult, LifecycleError> {
    super::super::git::list_workspace_git_pull_requests(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_current_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitBranchPullRequestResult, LifecycleError> {
    super::super::git::get_workspace_current_git_pull_request(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestDetailResult, LifecycleError> {
    super::super::git::get_workspace_git_pull_request(&db_path.0, workspace_id, pull_request_number)
        .await
}

#[tauri::command]
pub async fn get_workspace_git_base_ref(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<String>, LifecycleError> {
    super::super::git::get_workspace_git_base_ref(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_ref_diff_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    base_ref: String,
    head_ref: String,
) -> Result<String, LifecycleError> {
    super::super::git::get_workspace_git_ref_diff_patch(
        &db_path.0,
        workspace_id,
        base_ref,
        head_ref,
    )
    .await
}

#[tauri::command]
pub async fn get_workspace_git_pull_request_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<String, LifecycleError> {
    super::super::git::get_workspace_git_pull_request_patch(
        &db_path.0,
        workspace_id,
        pull_request_number,
    )
    .await
}

#[tauri::command]
pub async fn get_workspace_git_commit_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    sha: String,
) -> Result<crate::platform::git::status::GitCommitDiffResult, LifecycleError> {
    super::super::git::get_workspace_git_commit_patch(&db_path.0, workspace_id, sha).await
}

#[tauri::command]
pub async fn stage_workspace_git_files(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::stage_workspace_git_files(&app, &db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn unstage_workspace_git_files(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::unstage_workspace_git_files(&app, &db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn commit_workspace_git(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    message: String,
) -> Result<crate::platform::git::status::GitCommitResult, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::commit_workspace_git(&app, &db_path.0, workspace_id, message).await
}

#[tauri::command]
pub async fn push_workspace_git(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<crate::platform::git::status::GitPushResult, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::push_workspace_git(&app, &db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn create_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::create_workspace_git_pull_request(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn merge_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::git::merge_workspace_git_pull_request(
        &db_path.0,
        workspace_id,
        pull_request_number,
    )
    .await
}

#[tauri::command]
pub async fn git_branch_has_upstream(
    worktree_path: String,
    branch_name: String,
) -> Result<bool, LifecycleError> {
    crate::platform::git::worktree::branch_has_upstream(&worktree_path, &branch_name).await
}
