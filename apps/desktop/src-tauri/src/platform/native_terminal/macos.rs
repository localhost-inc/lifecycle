use super::{
    NativeTerminalColorScheme, NativeTerminalSurfaceFrameSyncRequest,
    NativeTerminalSurfaceSyncRequest,
};
use crate::capabilities::workspaces::terminal::{
    complete_native_terminal_exit, prepare_native_terminal_attachment_paste,
};
use crate::platform::diagnostics;
use crate::shared::errors::LifecycleError;
use serde::Serialize;
use std::ffi::{c_char, c_int, c_void, CStr, CString};
use std::path::Path;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, WebviewWindow};

#[derive(Clone)]
struct NativeTerminalRuntimeContext {
    app: AppHandle,
    db_path: String,
}

static RUNTIME_CONTEXT: OnceLock<NativeTerminalRuntimeContext> = OnceLock::new();

#[repr(C)]
struct LifecycleNativeTerminalConfig {
    terminal_id: *const c_char,
    working_directory: *const c_char,
    command: *const c_char,
    background_color: *const c_char,
    theme_config_path: *const c_char,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    font_size: f64,
    scale_factor: f64,
    opacity: f64,
    focused: bool,
    pointer_passthrough: bool,
    hidden: bool,
    dark: bool,
}

#[repr(C)]
struct LifecycleNativeTerminalFrameConfig {
    terminal_id: *const c_char,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize)]
struct NativeWorkspaceShortcutEvent {
    action: String,
    index: Option<i32>,
    source_surface_id: Option<String>,
    source_surface_kind: Option<String>,
}

const NATIVE_TERMINAL_SHORTCUT_PREVIOUS_TAB: c_int = 1;
const NATIVE_TERMINAL_SHORTCUT_NEXT_TAB: c_int = 2;
const NATIVE_TERMINAL_SHORTCUT_CLOSE_ACTIVE_TAB: c_int = 3;
const NATIVE_TERMINAL_SHORTCUT_NEW_TAB: c_int = 5;

unsafe extern "C" {
    fn lifecycle_native_terminal_initialize(
        exit_callback: extern "C" fn(*const c_char, c_int),
        shortcut_callback: extern "C" fn(*const c_char, c_int, c_int),
    ) -> bool;
    fn lifecycle_native_terminal_last_error() -> *const c_char;
    fn lifecycle_native_terminal_sync(
        webview_view: *mut c_void,
        config: *const LifecycleNativeTerminalConfig,
    ) -> bool;
    fn lifecycle_native_terminal_sync_frame(
        webview_view: *mut c_void,
        config: *const LifecycleNativeTerminalFrameConfig,
    ) -> bool;
    fn lifecycle_native_terminal_install_diagnostics(log_path: *const c_char);
    fn lifecycle_native_terminal_hide(terminal_id: *const c_char) -> bool;
    fn lifecycle_native_terminal_close(terminal_id: *const c_char) -> bool;
    fn lifecycle_native_terminal_send_text(
        terminal_id: *const c_char,
        text: *const c_char,
        text_len: usize,
    ) -> bool;
}

fn with_error(invoke: impl FnOnce() -> bool, fallback: &'static str) -> Result<(), LifecycleError> {
    if invoke() {
        return Ok(());
    }

    let error = unsafe { lifecycle_native_terminal_last_error() };
    let message = if error.is_null() {
        fallback.to_string()
    } else {
        unsafe { CStr::from_ptr(error) }
            .to_string_lossy()
            .to_string()
    };

    Err(LifecycleError::AttachFailed(message))
}

fn cstring(value: &str, field: &'static str) -> Result<CString, LifecycleError> {
    CString::new(value).map_err(|_| {
        LifecycleError::AttachFailed(format!("{field} contains an unsupported NUL byte"))
    })
}

fn detect_resources_dir() -> Option<CString> {
    if let Ok(path) = std::env::var("GHOSTTY_RESOURCES_DIR") {
        return CString::new(path).ok();
    }

    const INSTALLED_GHOSTTY_RESOURCES: &str =
        "/Applications/Ghostty.app/Contents/Resources/ghostty";
    if Path::new(INSTALLED_GHOSTTY_RESOURCES).exists() {
        return CString::new(INSTALLED_GHOSTTY_RESOURCES).ok();
    }

    None
}

fn configure_process_environment() {
    if let Some(resources_dir) = detect_resources_dir() {
        let value = resources_dir.to_string_lossy().to_string();
        std::env::set_var("GHOSTTY_RESOURCES_DIR", value);
    }

    // Native terminals should not inherit outer NO_COLOR settings from the
    // dev shell because Ghostty uses the app process environment as the
    // spawn baseline for child commands.
    if std::env::var_os("NO_COLOR").is_some() {
        std::env::remove_var("NO_COLOR");
    }

    if std::env::var("TERM_PROGRAM").is_err() {
        std::env::set_var("TERM_PROGRAM", "ghostty");
    }
}

extern "C" fn native_terminal_exit_callback(terminal_id: *const c_char, exit_code: c_int) {
    if terminal_id.is_null() {
        return;
    }

    let Some(context) = RUNTIME_CONTEXT.get() else {
        return;
    };

    let terminal_id = unsafe { CStr::from_ptr(terminal_id) }
        .to_string_lossy()
        .to_string();
    if let Err(error) = complete_native_terminal_exit(
        &context.app,
        &context.db_path,
        &terminal_id,
        i64::from(exit_code),
    ) {
        tracing::error!(
            "failed to finalize native terminal exit {}: {error}",
            terminal_id
        );
    }
}

extern "C" fn native_workspace_shortcut_callback(
    terminal_id: *const c_char,
    shortcut_kind: c_int,
    _shortcut_index: c_int,
) {
    if terminal_id.is_null() {
        return;
    }

    let Some(context) = RUNTIME_CONTEXT.get() else {
        return;
    };

    let Some((action, index)) = (match shortcut_kind {
        NATIVE_TERMINAL_SHORTCUT_PREVIOUS_TAB => Some(("previous-tab", None)),
        NATIVE_TERMINAL_SHORTCUT_NEXT_TAB => Some(("next-tab", None)),
        NATIVE_TERMINAL_SHORTCUT_CLOSE_ACTIVE_TAB => Some(("close-active-tab", None)),
        NATIVE_TERMINAL_SHORTCUT_NEW_TAB => Some(("new-tab", None)),
        _ => None,
    }) else {
        return;
    };

    let terminal_id = unsafe { CStr::from_ptr(terminal_id) }
        .to_string_lossy()
        .to_string();
    let _ = context.app.emit(
        "native-workspace:shortcut",
        NativeWorkspaceShortcutEvent {
            action: action.to_string(),
            index,
            source_surface_id: Some(terminal_id),
            source_surface_kind: Some("native-terminal".to_string()),
        },
    );
}

#[no_mangle]
pub extern "C" fn lifecycle_native_terminal_prepare_paste_image(
    terminal_id: *const c_char,
    file_name: *const c_char,
    media_type: *const c_char,
    bytes: *const u8,
    bytes_len: usize,
) -> *mut c_char {
    if terminal_id.is_null() || file_name.is_null() || bytes.is_null() || bytes_len == 0 {
        diagnostics::append_diagnostic(
            "native-terminal",
            "clipboard image paste received incomplete arguments",
        );
        return std::ptr::null_mut();
    }

    let Some(context) = RUNTIME_CONTEXT.get() else {
        diagnostics::append_diagnostic(
            "native-terminal",
            "clipboard image paste received no runtime context",
        );
        return std::ptr::null_mut();
    };

    let terminal_id = unsafe { CStr::from_ptr(terminal_id) }
        .to_string_lossy()
        .to_string();
    let file_name = unsafe { CStr::from_ptr(file_name) }
        .to_string_lossy()
        .to_string();
    let media_type = if media_type.is_null() {
        None
    } else {
        Some(
            unsafe { CStr::from_ptr(media_type) }
                .to_string_lossy()
                .to_string(),
        )
    };
    let bytes = unsafe { std::slice::from_raw_parts(bytes, bytes_len) };

    match prepare_native_terminal_attachment_paste(
        &context.db_path,
        &terminal_id,
        &file_name,
        media_type.as_deref(),
        bytes,
    ) {
        Ok(payload) => match CString::new(payload) {
            Ok(payload) => payload.into_raw(),
            Err(error) => {
                diagnostics::append_error(
                    "native-terminal",
                    format!("failed to encode clipboard image paste payload: {error}"),
                );
                std::ptr::null_mut()
            }
        },
        Err(error) => {
            diagnostics::append_error(
                "native-terminal",
                format!("failed to paste clipboard image for {terminal_id}: {error}"),
            );
            std::ptr::null_mut()
        }
    }
}

#[no_mangle]
pub extern "C" fn lifecycle_native_terminal_free_string(value: *mut c_char) {
    if value.is_null() {
        return;
    }

    unsafe {
        let _ = CString::from_raw(value);
    }
}

pub(super) fn initialize(
    app: AppHandle,
    db_path: String,
    diagnostics_log_path: Option<&Path>,
) -> Result<(), LifecycleError> {
    let _ = RUNTIME_CONTEXT.set(NativeTerminalRuntimeContext { app, db_path });
    configure_process_environment();

    if let Some(path) = diagnostics_log_path.and_then(|value| value.to_str()) {
        if let Ok(log_path) = CString::new(path) {
            unsafe { lifecycle_native_terminal_install_diagnostics(log_path.as_ptr()) };
        } else {
            diagnostics::append_diagnostic(
                "native-terminal",
                "skipped native diagnostics install because the log path contained a NUL byte",
            );
        }
    }

    with_error(
        || unsafe {
            lifecycle_native_terminal_initialize(
                native_terminal_exit_callback,
                native_workspace_shortcut_callback,
            )
        },
        "failed to initialize native terminal runtime",
    )
}

pub(super) fn sync_surface(
    window: &WebviewWindow,
    request: NativeTerminalSurfaceSyncRequest<'_>,
) -> Result<(), LifecycleError> {
    let terminal_id = cstring(request.terminal_id, "terminal id")?;
    let working_directory = cstring(request.working_directory, "working directory")?;
    let command = if request.command.trim().is_empty() {
        None
    } else {
        Some(cstring(request.command, "command")?)
    };
    let background_color = cstring(request.background_color, "background color")?;
    let theme_config_path = cstring(request.theme_config_path, "theme config path")?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);

    window
        .with_webview(move |webview| {
            let config = LifecycleNativeTerminalConfig {
                terminal_id: terminal_id.as_ptr(),
                working_directory: working_directory.as_ptr(),
                command: command
                    .as_ref()
                    .map_or(std::ptr::null(), |value| value.as_ptr()),
                background_color: background_color.as_ptr(),
                theme_config_path: theme_config_path.as_ptr(),
                x: request.frame.x,
                y: request.frame.y,
                width: request.frame.width,
                height: request.frame.height,
                font_size: request.font_size,
                scale_factor: request.scale_factor,
                opacity: request.opacity,
                focused: request.focused && request.visible,
                pointer_passthrough: request.pointer_passthrough,
                hidden: !request.visible,
                dark: matches!(request.color_scheme, NativeTerminalColorScheme::Dark),
            };
            let result = with_error(
                || unsafe { lifecycle_native_terminal_sync(webview.inner(), &config) },
                "failed to sync native terminal surface",
            );
            let _ = sender.send(result);
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed("native terminal webview task did not complete".to_string())
    })?
}

pub(super) fn sync_surface_frame(
    window: &WebviewWindow,
    request: NativeTerminalSurfaceFrameSyncRequest<'_>,
) -> Result<(), LifecycleError> {
    let terminal_id = cstring(request.terminal_id, "terminal id")?;
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);

    window
        .with_webview(move |webview| {
            let config = LifecycleNativeTerminalFrameConfig {
                terminal_id: terminal_id.as_ptr(),
                x: request.frame.x,
                y: request.frame.y,
                width: request.frame.width,
                height: request.frame.height,
            };
            let result = with_error(
                || unsafe { lifecycle_native_terminal_sync_frame(webview.inner(), &config) },
                "failed to sync native terminal frame",
            );
            let _ = sender.send(result);
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed("native terminal webview task did not complete".to_string())
    })?
}

pub(super) fn hide_surface(terminal_id: &str) -> Result<(), LifecycleError> {
    let terminal_id = cstring(terminal_id, "terminal id")?;
    with_error(
        || unsafe { lifecycle_native_terminal_hide(terminal_id.as_ptr()) },
        "failed to hide native terminal surface",
    )
}

pub(super) fn destroy_surface(terminal_id: &str) -> Result<(), LifecycleError> {
    let terminal_id = cstring(terminal_id, "terminal id")?;
    with_error(
        || unsafe { lifecycle_native_terminal_close(terminal_id.as_ptr()) },
        "failed to destroy native terminal surface",
    )
}
