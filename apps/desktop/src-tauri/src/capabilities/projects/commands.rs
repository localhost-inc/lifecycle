use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::RootGitWatcherMap;
use std::path::PathBuf;
use tauri::State;

/// Side-effect-only cleanup for a project (stops git watchers).
/// The actual DB deletion is done from TypeScript via SqlDriver.
#[tauri::command]
pub async fn cleanup_project(
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    id: String,
) -> Result<(), LifecycleError> {
    crate::capabilities::workspaces::git_watcher::stop_root_git_watchers_for_project(
        &db_path.0,
        &root_git_watchers,
        &id,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn read_manifest_text(dir_path: String) -> Result<Option<String>, LifecycleError> {
    let manifest_path = PathBuf::from(dir_path).join("lifecycle.json");

    match std::fs::read_to_string(&manifest_path) {
        Ok(content) => Ok(Some(content)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(LifecycleError::Io(format!(
            "failed to read {}: {}",
            manifest_path.display(),
            error
        ))),
    }
}
