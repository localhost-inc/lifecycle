use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::WorkspaceControllerRegistryHandle;
use tauri::{AppHandle, State, Webview};

fn require_workspace_terminal(
    db_path: &str,
    workspace_id: &str,
    terminal_id: &str,
) -> Result<super::super::query::TerminalRecord, LifecycleError> {
    let terminal = super::super::terminal::load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    if terminal.workspace_id != workspace_id {
        return Err(LifecycleError::WorkspaceNotFound(terminal_id.to_string()));
    }

    Ok(terminal)
}

#[tauri::command]
pub async fn list_workspace_terminals(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::super::query::TerminalRecord>, LifecycleError> {
    super::super::query::list_workspace_terminals(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn rename_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    terminal_id: String,
    label: String,
) -> Result<super::super::query::TerminalRecord, LifecycleError> {
    require_workspace_terminal(&db_path.0, &workspace_id, &terminal_id)?;
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::rename::rename_terminal(&app, &db_path.0, &workspace_id, &terminal_id, &label)
        .await
}

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
) -> Result<super::super::query::TerminalRecord, LifecycleError> {
    super::super::terminal::create_terminal(app, db_path, workspace_id, launch_type).await
}

#[tauri::command]
pub async fn send_terminal_text(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
    text: String,
) -> Result<(), LifecycleError> {
    require_workspace_terminal(&db_path.0, &workspace_id, &terminal_id)?;
    super::super::terminal::send_terminal_text(app, terminal_id, text).await
}

#[tauri::command]
pub async fn save_terminal_attachment(
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    file_name: String,
    media_type: Option<String>,
    base64_data: String,
) -> Result<super::super::terminal::SavedTerminalAttachment, LifecycleError> {
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    super::super::terminal::save_terminal_attachment(
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
    webview: Webview,
    db_path: State<'_, DbPath>,
    input: super::super::terminal::NativeTerminalSurfaceSyncInput,
) -> Result<(), LifecycleError> {
    super::super::terminal::sync_native_terminal_surface(webview, db_path, input).await
}

#[tauri::command]
pub async fn sync_native_terminal_surface_frame(
    webview: Webview,
    input: super::super::terminal::NativeTerminalSurfaceFrameSyncInput,
) -> Result<(), LifecycleError> {
    super::super::terminal::sync_native_terminal_surface_frame(webview, input).await
}

#[tauri::command]
pub async fn hide_native_terminal_surface(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::hide_native_terminal_surface(app, db_path, terminal_id).await
}

#[tauri::command]
pub async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::detach_terminal(app, db_path, workspace_id, terminal_id).await
}

#[tauri::command]
pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::kill_terminal(app, db_path, workspace_id, terminal_id).await
}

#[tauri::command]
pub async fn interrupt_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::interrupt_terminal(app, db_path, workspace_id, terminal_id).await
}
