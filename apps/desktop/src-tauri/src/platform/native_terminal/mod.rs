use crate::shared::errors::LifecycleError;
use tauri::{AppHandle, WebviewWindow};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NativeTerminalFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeTerminalColorScheme {
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy)]
pub struct NativeTerminalSurfaceFrameSyncRequest<'a> {
    pub frame: NativeTerminalFrame,
    pub terminal_id: &'a str,
}

#[derive(Debug, Clone, Copy)]
pub struct NativeTerminalSurfaceSyncRequest<'a> {
    pub background_color: &'a str,
    pub color_scheme: NativeTerminalColorScheme,
    pub command: &'a str,
    pub focused: bool,
    pub font_size: f64,
    pub frame: NativeTerminalFrame,
    pub pointer_passthrough: bool,
    pub scale_factor: f64,
    pub terminal_id: &'a str,
    pub theme_config_path: &'a str,
    pub visible: bool,
    pub working_directory: &'a str,
}

#[cfg(all(target_os = "macos", has_ghosttykit))]
mod macos;
#[cfg(not(all(target_os = "macos", has_ghosttykit)))]
mod unsupported;

#[cfg(all(target_os = "macos", has_ghosttykit))]
use self::macos as platform;
#[cfg(not(all(target_os = "macos", has_ghosttykit)))]
use self::unsupported as platform;

fn run_on_main_thread<T: Send + 'static>(
    app: &AppHandle,
    task: impl FnOnce() -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(task());
    })
    .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed(
            "native terminal main-thread task did not complete".to_string(),
        )
    })?
}

pub fn is_available() -> bool {
    cfg!(all(target_os = "macos", has_ghosttykit))
}

pub fn initialize(app: AppHandle, db_path: String) -> Result<(), LifecycleError> {
    platform::initialize(
        app,
        db_path,
        crate::platform::diagnostics::diagnostic_log_path(),
    )
}

pub fn sync_surface(
    window: &WebviewWindow,
    request: NativeTerminalSurfaceSyncRequest<'_>,
) -> Result<(), LifecycleError> {
    platform::sync_surface(window, request)
}

pub fn sync_surface_frame(
    window: &WebviewWindow,
    request: NativeTerminalSurfaceFrameSyncRequest<'_>,
) -> Result<(), LifecycleError> {
    platform::sync_surface_frame(window, request)
}

pub fn hide_surface(app: &AppHandle, terminal_id: &str) -> Result<(), LifecycleError> {
    let terminal_id = terminal_id.to_string();
    run_on_main_thread(app, move || platform::hide_surface(&terminal_id))
}

pub fn destroy_surface(app: &AppHandle, terminal_id: &str) -> Result<(), LifecycleError> {
    let terminal_id = terminal_id.to_string();
    run_on_main_thread(app, move || platform::destroy_surface(&terminal_id))
}
