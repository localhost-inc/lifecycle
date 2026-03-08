use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::{SupervisorMap, TerminalSupervisorMap};
use std::collections::HashMap;
use tauri::{AppHandle, State, WebviewWindow};

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
pub async fn rename_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    name: String,
) -> Result<super::query::WorkspaceRow, LifecycleError> {
    super::rename::rename_workspace(app, &db_path.0, &workspace_id, &name).await
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

#[tauri::command]
pub async fn list_workspace_terminals(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::query::TerminalRow>, LifecycleError> {
    super::query::list_workspace_terminals(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_terminal(
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<Option<super::query::TerminalRow>, LifecycleError> {
    super::query::get_terminal_by_id(&db_path.0, terminal_id).await
}

#[tauri::command]
pub async fn rename_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
    label: String,
) -> Result<super::query::TerminalRow, LifecycleError> {
    super::rename::rename_terminal(&app, &db_path.0, &terminal_id, &label)
}

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<super::terminal::TerminalAttachResult, LifecycleError> {
    super::terminal::create_terminal(
        app,
        db_path,
        terminal_supervisors,
        workspace_id,
        launch_type,
        harness_provider,
        harness_session_id,
        cols,
        rows,
    )
    .await
}

#[tauri::command]
pub async fn attach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    cols: u16,
    rows: u16,
    replay_cursor: Option<String>,
    handler: tauri::ipc::Channel<crate::platform::runtime::terminal::TerminalStreamChunk>,
) -> Result<super::terminal::TerminalAttachResult, LifecycleError> {
    super::terminal::attach_terminal(
        app,
        db_path,
        terminal_supervisors,
        terminal_id,
        cols,
        rows,
        replay_cursor,
        handler,
    )
    .await
}

#[tauri::command]
pub async fn write_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    data: String,
) -> Result<(), LifecycleError> {
    super::terminal::write_terminal(app, db_path, terminal_supervisors, terminal_id, data).await
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
pub async fn native_terminal_capabilities(
) -> Result<super::terminal::NativeTerminalCapabilities, LifecycleError> {
    Ok(super::terminal::native_terminal_capabilities())
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
pub async fn resize_terminal(
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), LifecycleError> {
    super::terminal::resize_terminal(terminal_supervisors, terminal_id, cols, rows).await
}

#[tauri::command]
pub async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::detach_terminal(app, db_path, terminal_supervisors, terminal_id).await
}

#[tauri::command]
pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::kill_terminal(app, db_path, terminal_supervisors, terminal_id).await
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
pub async fn list_workspace_git_log(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    limit: u32,
) -> Result<Vec<crate::platform::git::status::GitLogEntry>, LifecycleError> {
    super::git::list_workspace_git_log(&db_path.0, workspace_id, limit).await
}

#[tauri::command]
pub async fn get_workspace_git_base_ref(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Option<String>, LifecycleError> {
    super::git::get_workspace_git_base_ref(&db_path.0, workspace_id).await
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
pub fn open_workspace_file(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
) -> Result<(), LifecycleError> {
    super::git::open_workspace_file(&app, &db_path.0, workspace_id, file_path)
}

#[tauri::command]
pub async fn stage_workspace_git_files(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    super::git::stage_workspace_git_files(&db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn unstage_workspace_git_files(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    super::git::unstage_workspace_git_files(&db_path.0, workspace_id, file_paths).await
}

#[tauri::command]
pub async fn commit_workspace_git(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    message: String,
) -> Result<crate::platform::git::status::GitCommitResult, LifecycleError> {
    super::git::commit_workspace_git(&db_path.0, workspace_id, message).await
}

#[tauri::command]
pub async fn push_workspace_git(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<crate::platform::git::status::GitPushResult, LifecycleError> {
    super::git::push_workspace_git(&db_path.0, workspace_id).await
}
