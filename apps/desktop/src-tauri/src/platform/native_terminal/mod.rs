use crate::shared::errors::LifecycleError;

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

#[cfg(all(target_os = "macos", has_ghosttykit))]
mod imp {
    use super::{NativeTerminalColorScheme, NativeTerminalFrame};
    use crate::capabilities::workspaces::terminal::complete_native_terminal_exit;
    use crate::platform::diagnostics;
    use crate::shared::errors::LifecycleError;
    use std::ffi::{c_char, c_int, c_void, CStr, CString};
    use std::path::Path;
    use std::sync::OnceLock;
    use tauri::AppHandle;

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
        focused: bool,
        hidden: bool,
        dark: bool,
    }

    unsafe extern "C" {
        fn lifecycle_native_terminal_initialize(
            exit_callback: extern "C" fn(*const c_char, c_int),
        ) -> bool;
        fn lifecycle_native_terminal_last_error() -> *const c_char;
        fn lifecycle_native_terminal_sync(
            webview_view: *mut c_void,
            config: *const LifecycleNativeTerminalConfig,
        ) -> bool;
        fn lifecycle_native_terminal_install_diagnostics(log_path: *const c_char);
        fn lifecycle_native_terminal_hide(terminal_id: *const c_char) -> bool;
        fn lifecycle_native_terminal_close(terminal_id: *const c_char) -> bool;
    }

    fn with_error(invoke: impl FnOnce() -> bool, fallback: &'static str) -> Result<(), LifecycleError> {
        if invoke() {
            return Ok(());
        }

        let error = unsafe { lifecycle_native_terminal_last_error() };
        let message = if error.is_null() {
            fallback.to_string()
        } else {
            unsafe { CStr::from_ptr(error) }.to_string_lossy().to_string()
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

    pub fn initialize(
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
            || unsafe { lifecycle_native_terminal_initialize(native_terminal_exit_callback) },
            "failed to initialize native terminal runtime",
        )
    }

    pub fn sync_surface(
        webview_view: *mut c_void,
        terminal_id: &str,
        working_directory: &str,
        command: &str,
        frame: NativeTerminalFrame,
        visible: bool,
        focused: bool,
        background_color: &str,
        theme_config_path: &str,
        font_size: f64,
        scale_factor: f64,
        color_scheme: NativeTerminalColorScheme,
    ) -> Result<(), LifecycleError> {
        let terminal_id = cstring(terminal_id, "terminal id")?;
        let working_directory = cstring(working_directory, "working directory")?;
        let command = if command.trim().is_empty() {
            None
        } else {
            Some(cstring(command, "command")?)
        };
        let background_color = cstring(background_color, "background color")?;
        let theme_config_path = cstring(theme_config_path, "theme config path")?;
        let config = LifecycleNativeTerminalConfig {
            terminal_id: terminal_id.as_ptr(),
            working_directory: working_directory.as_ptr(),
            command: command.as_ref().map_or(std::ptr::null(), |value| value.as_ptr()),
            background_color: background_color.as_ptr(),
            theme_config_path: theme_config_path.as_ptr(),
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
            font_size,
            scale_factor,
            focused: focused && visible,
            hidden: !visible,
            dark: matches!(color_scheme, NativeTerminalColorScheme::Dark),
        };

        with_error(
            || unsafe { lifecycle_native_terminal_sync(webview_view, &config) },
            "failed to sync native terminal surface",
        )
    }

    pub fn hide_surface(terminal_id: &str) -> Result<(), LifecycleError> {
        let terminal_id = cstring(terminal_id, "terminal id")?;
        with_error(|| unsafe { lifecycle_native_terminal_hide(terminal_id.as_ptr()) }, "failed to hide native terminal surface")
    }

    pub fn destroy_surface(terminal_id: &str) -> Result<(), LifecycleError> {
        let terminal_id = cstring(terminal_id, "terminal id")?;
        with_error(|| unsafe { lifecycle_native_terminal_close(terminal_id.as_ptr()) }, "failed to destroy native terminal surface")
    }
}

#[cfg(not(all(target_os = "macos", has_ghosttykit)))]
mod imp {
    use super::{NativeTerminalColorScheme, NativeTerminalFrame};
    use crate::shared::errors::LifecycleError;
    use std::ffi::c_void;
    use tauri::AppHandle;

    pub fn initialize(
        _app: AppHandle,
        _db_path: String,
        _diagnostics_log_path: Option<&std::path::Path>,
    ) -> Result<(), LifecycleError> {
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    pub fn sync_surface(
        _parent_view: *mut c_void,
        _terminal_id: &str,
        _working_directory: &str,
        _command: &str,
        _frame: NativeTerminalFrame,
        _visible: bool,
        _focused: bool,
        _background_color: &str,
        _theme_config_path: &str,
        _font_size: f64,
        _scale_factor: f64,
        _color_scheme: NativeTerminalColorScheme,
    ) -> Result<(), LifecycleError> {
        Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ))
    }

    pub fn hide_surface(_terminal_id: &str) -> Result<(), LifecycleError> {
        Ok(())
    }

    pub fn destroy_surface(_terminal_id: &str) -> Result<(), LifecycleError> {
        Ok(())
    }
}

pub fn is_available() -> bool {
    cfg!(all(target_os = "macos", has_ghosttykit))
}

pub fn initialize(app: tauri::AppHandle, db_path: String) -> Result<(), LifecycleError> {
    imp::initialize(app, db_path, crate::platform::diagnostics::diagnostic_log_path())
}

#[allow(clippy::too_many_arguments)]
pub fn sync_surface(
    parent_view: *mut std::ffi::c_void,
    terminal_id: &str,
    working_directory: &str,
    command: &str,
    frame: NativeTerminalFrame,
    visible: bool,
    focused: bool,
    background_color: &str,
    theme_config_path: &str,
    font_size: f64,
    scale_factor: f64,
    color_scheme: NativeTerminalColorScheme,
) -> Result<(), LifecycleError> {
    imp::sync_surface(
        parent_view,
        terminal_id,
        working_directory,
        command,
        frame,
        visible,
        focused,
        background_color,
        theme_config_path,
        font_size,
        scale_factor,
        color_scheme,
    )
}

pub fn hide_surface(terminal_id: &str) -> Result<(), LifecycleError> {
    imp::hide_surface(terminal_id)
}

pub fn destroy_surface(terminal_id: &str) -> Result<(), LifecycleError> {
    imp::destroy_surface(terminal_id)
}
