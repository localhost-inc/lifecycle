use super::NativeTerminalSurfaceSyncRequest;
use crate::shared::errors::LifecycleError;
use tauri::{AppHandle, WebviewWindow};

pub(super) fn initialize(
    _app: AppHandle,
    _db_path: String,
    _diagnostics_log_path: Option<&std::path::Path>,
) -> Result<(), LifecycleError> {
    Ok(())
}

pub(super) fn sync_surface(
    _window: &WebviewWindow,
    _request: NativeTerminalSurfaceSyncRequest<'_>,
) -> Result<(), LifecycleError> {
    Err(LifecycleError::AttachFailed(
        "native terminal runtime is unavailable".to_string(),
    ))
}

pub(super) fn hide_surface(_terminal_id: &str) -> Result<(), LifecycleError> {
    Ok(())
}

pub(super) fn destroy_surface(_terminal_id: &str) -> Result<(), LifecycleError> {
    Ok(())
}

#[no_mangle]
pub extern "C" fn lifecycle_native_terminal_prepare_paste_image(
    _terminal_id: *const std::ffi::c_char,
    _file_name: *const std::ffi::c_char,
    _media_type: *const std::ffi::c_char,
    _bytes: *const u8,
    _bytes_len: usize,
) -> *mut std::ffi::c_char {
    std::ptr::null_mut()
}

#[no_mangle]
pub extern "C" fn lifecycle_native_terminal_free_string(_value: *mut std::ffi::c_char) {}
