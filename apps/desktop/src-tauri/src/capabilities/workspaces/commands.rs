use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::RootGitWatcherMap;
use crate::SupervisorMap;
use std::collections::HashMap;
use tauri::{AppHandle, State, WebviewWindow};

#[tauri::command]
pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    project_id: String,
    project_path: String,
    workspace_name: Option<String>,
    base_ref: Option<String>,
    worktree_root: Option<String>,
    kind: Option<String>,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
) -> Result<String, LifecycleError> {
    let db_path_value = db_path.0.clone();
    let workspace_id = super::create::create_workspace(
        app.clone(),
        db_path,
        project_id,
        project_path,
        workspace_name,
        base_ref,
        worktree_root,
        kind,
        manifest_json,
        manifest_fingerprint,
    )
    .await?;

    if let Err(error) = super::git_watcher::ensure_root_git_watcher(
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
    workspace_id: String,
    name: String,
) -> Result<super::query::WorkspaceRecord, LifecycleError> {
    super::rename::rename_workspace(app, &db_path.0, &workspace_id, &name).await
}

#[tauri::command]
pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
    manifest_json: String,
    manifest_fingerprint: String,
) -> Result<(), LifecycleError> {
    super::start::start_services(
        app,
        db_path,
        supervisors,
        workspace_id,
        manifest_json,
        manifest_fingerprint,
    )
    .await
}

#[tauri::command]
pub async fn sync_workspace_manifest(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
) -> Result<(), LifecycleError> {
    super::start::sync_workspace_manifest(
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
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::stop::stop_workspace(app, db_path, supervisors, workspace_id).await
}

#[tauri::command]
pub async fn destroy_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    super::destroy::destroy_workspace(app, db_path, root_git_watchers, supervisors, workspace_id)
        .await
}

#[tauri::command]
pub async fn get_workspace(
    db_path: State<'_, DbPath>,
    project_id: String,
) -> Result<Option<super::query::WorkspaceRecord>, LifecycleError> {
    super::query::get_workspace(&db_path.0, project_id).await
}

#[tauri::command]
pub async fn get_workspace_by_id(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<super::query::WorkspaceRecord>, LifecycleError> {
    super::query::get_workspace_by_id(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn list_workspaces(
    db_path: State<'_, DbPath>,
) -> Result<Vec<super::query::WorkspaceRecord>, LifecycleError> {
    super::query::list_workspaces(&db_path.0).await
}

#[tauri::command]
pub async fn list_workspaces_by_project(
    db_path: State<'_, DbPath>,
) -> Result<HashMap<String, Vec<super::query::WorkspaceRecord>>, LifecycleError> {
    super::query::list_workspaces_by_project(&db_path.0).await
}

#[tauri::command]
pub async fn get_workspace_services(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::query::ServiceRecord>, LifecycleError> {
    super::query::get_workspace_services(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn update_workspace_service(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    service_name: String,
    exposure: String,
    port_override: Option<i64>,
) -> Result<(), LifecycleError> {
    super::service::update_workspace_service(
        &db_path.0,
        workspace_id,
        service_name,
        exposure,
        port_override,
    )
    .await
}

#[tauri::command]
pub async fn get_current_branch(project_path: String) -> Result<String, LifecycleError> {
    super::query::get_current_branch(project_path).await
}

#[tauri::command]
pub async fn list_workspace_terminals(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::query::TerminalRecord>, LifecycleError> {
    super::query::list_workspace_terminals(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_terminal(
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<Option<super::query::TerminalRecord>, LifecycleError> {
    super::query::get_terminal_by_id(&db_path.0, terminal_id).await
}

#[tauri::command]
pub async fn rename_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
    label: String,
) -> Result<super::query::TerminalRecord, LifecycleError> {
    super::rename::rename_terminal(&app, &db_path.0, &terminal_id, &label)
}

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
) -> Result<super::query::TerminalRecord, LifecycleError> {
    super::terminal::create_terminal(
        app,
        db_path,
        workspace_id,
        launch_type,
        harness_provider,
        harness_session_id,
    )
    .await
}

#[tauri::command]
pub async fn save_terminal_attachment(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_name: String,
    media_type: Option<String>,
    base64_data: String,
) -> Result<super::terminal::SavedTerminalAttachment, LifecycleError> {
    super::terminal::save_terminal_attachment(
        db_path,
        workspace_id,
        file_name,
        media_type,
        base64_data,
    )
    .await
}

#[tauri::command]
pub async fn sync_native_terminal_surface(
    window: WebviewWindow,
    db_path: State<'_, DbPath>,
    terminal_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
    focused: bool,
    pointer_passthrough: bool,
    appearance: String,
    font_family: String,
    theme: super::terminal::NativeTerminalTheme,
    font_size: f64,
    scale_factor: f64,
) -> Result<(), LifecycleError> {
    super::terminal::sync_native_terminal_surface(
        window,
        db_path,
        terminal_id,
        x,
        y,
        width,
        height,
        visible,
        focused,
        pointer_passthrough,
        appearance,
        font_family,
        theme,
        font_size,
        scale_factor,
    )
    .await
}

#[tauri::command]
pub async fn hide_native_terminal_surface(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::hide_native_terminal_surface(app, db_path, terminal_id).await
}

#[tauri::command]
pub async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::detach_terminal(app, db_path, terminal_id).await
}

#[tauri::command]
pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::kill_terminal(app, db_path, terminal_id).await
}

#[tauri::command]
pub async fn get_workspace_git_status(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::status::GitStatusResult, LifecycleError> {
    super::git::get_workspace_git_status(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_diff(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
    scope: String,
) -> Result<crate::platform::git::status::GitDiffResult, LifecycleError> {
    super::git::get_workspace_git_diff(&db_path.0, workspace_id, file_path, scope).await
}

#[tauri::command]
pub async fn get_workspace_git_scope_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    scope: String,
) -> Result<String, LifecycleError> {
    super::git::get_workspace_git_scope_patch(&db_path.0, workspace_id, scope).await
}

#[tauri::command]
pub async fn get_workspace_git_changes_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<String, LifecycleError> {
    super::git::get_workspace_git_changes_patch(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn list_workspace_git_log(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    limit: u32,
) -> Result<Vec<crate::platform::git::status::GitLogEntry>, LifecycleError> {
    super::git::list_workspace_git_log(&db_path.0, workspace_id, limit).await
}

#[tauri::command]
pub async fn list_workspace_git_pull_requests(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestListResult, LifecycleError> {
    super::git::list_workspace_git_pull_requests(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_current_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitBranchPullRequestResult, LifecycleError> {
    super::git::get_workspace_current_git_pull_request(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestDetailResult, LifecycleError> {
    super::git::get_workspace_git_pull_request(&db_path.0, workspace_id, pull_request_number).await
}

#[tauri::command]
pub async fn get_workspace_git_base_ref(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<String>, LifecycleError> {
    super::git::get_workspace_git_base_ref(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_workspace_git_ref_diff_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    base_ref: String,
    head_ref: String,
) -> Result<String, LifecycleError> {
    super::git::get_workspace_git_ref_diff_patch(&db_path.0, workspace_id, base_ref, head_ref).await
}

#[tauri::command]
pub async fn get_workspace_git_pull_request_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<String, LifecycleError> {
    super::git::get_workspace_git_pull_request_patch(&db_path.0, workspace_id, pull_request_number)
        .await
}

#[tauri::command]
pub async fn get_workspace_git_commit_patch(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    sha: String,
) -> Result<crate::platform::git::status::GitCommitDiffResult, LifecycleError> {
    super::git::get_workspace_git_commit_patch(&db_path.0, workspace_id, sha).await
}

#[tauri::command]
pub fn read_workspace_file(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
) -> Result<super::file::WorkspaceFileReadResult, LifecycleError> {
    super::file::read_workspace_file(&db_path.0, workspace_id, file_path)
}

#[tauri::command]
pub fn open_workspace_file(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
) -> Result<(), LifecycleError> {
    super::open::open_workspace_file(&app, &db_path.0, workspace_id, file_path)
}

#[tauri::command]
pub fn open_workspace_in_app(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    app_id: String,
) -> Result<(), LifecycleError> {
    super::open::open_workspace_in_app(&app, &db_path.0, workspace_id, app_id)
}

#[tauri::command]
pub fn list_workspace_open_in_apps() -> Result<Vec<super::open::WorkspaceOpenInApp>, LifecycleError>
{
    super::open::list_workspace_open_in_apps()
}

#[tauri::command]
pub async fn stage_workspace_git_files(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    super::git::stage_workspace_git_files(&app, &db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn unstage_workspace_git_files(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    super::git::unstage_workspace_git_files(&app, &db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn commit_workspace_git(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    message: String,
) -> Result<crate::platform::git::status::GitCommitResult, LifecycleError> {
    super::git::commit_workspace_git(&app, &db_path.0, workspace_id, message).await
}

#[tauri::command]
pub async fn push_workspace_git(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::status::GitPushResult, LifecycleError> {
    super::git::push_workspace_git(&app, &db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn create_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    super::git::create_workspace_git_pull_request(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn merge_workspace_git_pull_request(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    super::git::merge_workspace_git_pull_request(&db_path.0, workspace_id, pull_request_number)
        .await
}
