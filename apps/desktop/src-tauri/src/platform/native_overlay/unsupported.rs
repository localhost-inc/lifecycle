use crate::shared::errors::LifecycleError;
use tauri::AppHandle;

pub(super) fn initialize(_app: &AppHandle) -> Result<(), LifecycleError> {
    Ok(())
}
