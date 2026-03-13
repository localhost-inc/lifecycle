use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::WorkspaceControllerRegistryHandle;
use tauri::{AppHandle, State, WebviewWindow};

#[tauri::command]
pub async fn list_workspace_terminals(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::super::query::TerminalRecord>, LifecycleError> {
    super::super::query::list_workspace_terminals(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_terminal(
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<Option<super::super::query::TerminalRecord>, LifecycleError> {
    super::super::query::get_terminal_by_id(&db_path.0, terminal_id).await
}

#[tauri::command]
pub async fn rename_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    terminal_id: String,
    label: String,
) -> Result<super::super::query::TerminalRecord, LifecycleError> {
    let terminal = super::super::query::get_terminal_by_id(&db_path.0, terminal_id.clone())
        .await?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&terminal.workspace_id)
        .await?;
    super::super::rename::rename_terminal(&app, &db_path.0, &terminal_id, &label).await
}

#[tauri::command]
pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
) -> Result<super::super::query::TerminalRecord, LifecycleError> {
    super::super::terminal::create_terminal(
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
    window: WebviewWindow,
    db_path: State<'_, DbPath>,
    input: super::super::terminal::NativeTerminalSurfaceSyncInput,
) -> Result<(), LifecycleError> {
    super::super::terminal::sync_native_terminal_surface(window, db_path, input).await
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
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::detach_terminal(app, db_path, terminal_id).await
}

#[tauri::command]
pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    super::super::terminal::kill_terminal(app, db_path, terminal_id).await
}
