use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn read_workspace_file(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
) -> Result<super::super::file::WorkspaceFileReadResult, LifecycleError> {
    super::super::file::read_workspace_file(&db_path.0, workspace_id, file_path)
}

#[tauri::command]
pub fn write_workspace_file(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
    content: String,
) -> Result<super::super::file::WorkspaceFileReadResult, LifecycleError> {
    super::super::file::write_workspace_file(&db_path.0, workspace_id, file_path, content)
}

#[tauri::command]
pub fn list_workspace_files(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<super::super::file::WorkspaceFileTreeEntry>, LifecycleError> {
    super::super::file::list_workspace_files(&db_path.0, workspace_id)
}

#[tauri::command]
pub fn open_workspace_file(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_path: String,
) -> Result<(), LifecycleError> {
    super::super::open::open_workspace_file(&app, &db_path.0, workspace_id, file_path)
}

#[tauri::command]
pub fn open_workspace_in_app(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    app_id: String,
) -> Result<(), LifecycleError> {
    super::super::open::open_workspace_in_app(&app, &db_path.0, workspace_id, app_id)
}

#[tauri::command]
pub fn list_workspace_open_in_apps(
) -> Result<Vec<super::super::open::WorkspaceOpenInApp>, LifecycleError> {
    super::super::open::list_workspace_open_in_apps()
}
