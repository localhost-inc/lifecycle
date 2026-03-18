use crate::shared::errors::LifecycleError;
use tauri::AppHandle;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(not(target_os = "macos"))]
mod unsupported;

#[cfg(target_os = "macos")]
use self::macos as platform;
#[cfg(not(target_os = "macos"))]
use self::unsupported as platform;

pub fn is_available() -> bool {
    cfg!(target_os = "macos")
}

pub fn initialize(app: &AppHandle) -> Result<(), LifecycleError> {
    platform::initialize(app)
}

pub fn destroy(app: &AppHandle) -> Result<(), LifecycleError> {
    platform::destroy(app)
}
