use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::{SupervisorMap, TerminalSupervisorMap};
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
    handler: tauri::ipc::Channel<crate::platform::runtime::terminal::TerminalStreamChunk>,
) -> Result<super::terminal::TerminalAttachResult, LifecycleError> {
    super::terminal::attach_terminal(
        app,
        db_path,
        terminal_supervisors,
        terminal_id,
        cols,
        rows,
        handler,
    )
    .await
}

#[tauri::command]
pub async fn write_terminal(
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    data: String,
) -> Result<(), LifecycleError> {
    super::terminal::write_terminal(db_path, terminal_supervisors, terminal_id, data).await
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
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::terminal::kill_terminal(terminal_supervisors, terminal_id).await
}
