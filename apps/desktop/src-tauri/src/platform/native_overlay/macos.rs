use crate::shared::errors::LifecycleError;
use std::ffi::{c_char, c_void, CStr, CString};
use tauri::{AppHandle, Manager, WebviewWindow};

unsafe extern "C" {
    fn lifecycle_native_overlay_init(webview_view: *mut c_void, url: *const c_char) -> bool;
    fn lifecycle_native_overlay_destroy() -> bool;
    fn lifecycle_native_overlay_last_error() -> *const c_char;
}

fn with_error(invoke: impl FnOnce() -> bool, fallback: &'static str) -> Result<(), LifecycleError> {
    if invoke() {
        return Ok(());
    }

    let error = unsafe { lifecycle_native_overlay_last_error() };
    let message = if error.is_null() {
        fallback.to_string()
    } else {
        unsafe { CStr::from_ptr(error) }
            .to_string_lossy()
            .to_string()
    };

    Err(LifecycleError::AttachFailed(message))
}

fn resolve_overlay_url(window: &WebviewWindow) -> Result<CString, LifecycleError> {
    let base_url = window.url().map_err(|error| {
        LifecycleError::AttachFailed(format!("failed to read webview URL: {error}"))
    })?;

    let mut overlay_url = base_url.to_string();

    // Strip any existing path/query and append the overlay surface query.
    if let Some(pos) = overlay_url.find('?') {
        overlay_url.truncate(pos);
    }
    if !overlay_url.ends_with('/') {
        overlay_url.push('/');
    }
    overlay_url.push_str("?surface=overlay");

    CString::new(overlay_url)
        .map_err(|_| LifecycleError::AttachFailed("overlay URL contains NUL byte".to_string()))
}

pub(super) fn initialize(app: &AppHandle) -> Result<(), LifecycleError> {
    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| LifecycleError::AttachFailed("main webview window not found".to_string()))?;

    let url = resolve_overlay_url(&main_window)?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);

    main_window
        .with_webview(move |webview| {
            let result = with_error(
                || unsafe { lifecycle_native_overlay_init(webview.inner(), url.as_ptr()) },
                "failed to initialize native overlay surface",
            );
            let _ = sender.send(result);
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed("native overlay webview task did not complete".to_string())
    })?
}

pub(super) fn destroy(app: &AppHandle) -> Result<(), LifecycleError> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);

    app.run_on_main_thread(move || {
        let result = with_error(
            || unsafe { lifecycle_native_overlay_destroy() },
            "failed to destroy native overlay surface",
        );
        let _ = sender.send(result);
    })
    .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed("native overlay destroy task did not complete".to_string())
    })?
}
