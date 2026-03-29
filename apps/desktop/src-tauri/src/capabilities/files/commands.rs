use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use tauri::AppHandle;

#[tauri::command]
pub fn read_file(
    root_path: String,
    file_path: String,
) -> Result<super::file::FileReadResult, LifecycleError> {
    super::file::read_file(&root_path, &file_path)
}

#[tauri::command]
pub fn file_exists(
    root_path: String,
    file_path: String,
) -> Result<bool, LifecycleError> {
    super::file::file_exists(&root_path, &file_path)
}

#[tauri::command]
pub fn write_file(
    app: AppHandle,
    root_path: String,
    file_path: String,
    content: String,
) -> Result<super::file::FileReadResult, LifecycleError> {
    let result = super::file::write_file(&root_path, &file_path, &content)?;

    publish_lifecycle_event(
        &app,
        LifecycleEvent::FileChanged {
            root_path,
            file_path: result.file_path.clone(),
        },
    );

    Ok(result)
}

#[tauri::command]
pub fn list_files(
    root_path: String,
) -> Result<Vec<super::file::FileTreeEntry>, LifecycleError> {
    super::file::list_files(&root_path)
}

#[tauri::command]
pub fn open_file(
    app: AppHandle,
    root_path: String,
    file_path: String,
) -> Result<(), LifecycleError> {
    super::open::open_file(&app, &root_path, &file_path)
}

#[tauri::command]
pub fn open_in_app(
    app: AppHandle,
    root_path: String,
    app_id: String,
) -> Result<(), LifecycleError> {
    super::open::open_in_app(&app, &root_path, &app_id)
}

#[tauri::command]
pub fn list_open_in_apps() -> Result<Vec<super::open::OpenInApp>, LifecycleError> {
    super::open::list_open_in_apps()
}
