use crate::platform::native_terminal::NativeTerminalColorScheme;
use crate::shared::errors::LifecycleError;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use tauri::{AppHandle, WebviewWindow};

use super::NativeTerminalTheme;

fn validate_native_terminal_theme_value(
    field: &str,
    value: &str,
) -> Result<String, LifecycleError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(LifecycleError::AttachFailed(format!(
            "native terminal theme field `{field}` is empty"
        )));
    }

    Ok(trimmed.to_string())
}

pub(crate) fn build_native_terminal_theme_config(
    theme: &NativeTerminalTheme,
) -> Result<String, LifecycleError> {
    if theme.palette.len() != 16 {
        return Err(LifecycleError::AttachFailed(format!(
            "native terminal theme palette must contain 16 colors, received {}",
            theme.palette.len()
        )));
    }

    let background = validate_native_terminal_theme_value("background", &theme.background)?;
    let foreground = validate_native_terminal_theme_value("foreground", &theme.foreground)?;
    let cursor_color = validate_native_terminal_theme_value("cursorColor", &theme.cursor_color)?;
    let selection_background =
        validate_native_terminal_theme_value("selectionBackground", &theme.selection_background)?;
    let selection_foreground =
        validate_native_terminal_theme_value("selectionForeground", &theme.selection_foreground)?;

    let mut config_lines = Vec::with_capacity(theme.palette.len() + 8);
    for (index, color) in theme.palette.iter().enumerate() {
        let color = validate_native_terminal_theme_value("palette", color)?;
        config_lines.push(format!("palette = {index}={color}"));
    }
    config_lines.push(format!("background = {background}"));
    config_lines.push(format!("foreground = {foreground}"));
    config_lines.push(format!("cursor-color = {cursor_color}"));
    config_lines.push(format!("selection-background = {selection_background}"));
    config_lines.push(format!("selection-foreground = {selection_foreground}"));
    config_lines.push("background-opacity = 1".to_string());
    config_lines.push("window-padding-x = 0".to_string());
    config_lines.push("window-padding-y = 0".to_string());

    Ok(config_lines.join("\n"))
}

fn native_terminal_theme_dir() -> Result<PathBuf, LifecycleError> {
    let path = std::env::temp_dir().join("lifecycle-native-terminal-themes");
    fs::create_dir_all(&path).map_err(|error| {
        LifecycleError::AttachFailed(format!(
            "failed to create native terminal theme directory: {error}"
        ))
    })?;
    Ok(path)
}

pub(crate) fn write_native_terminal_theme_override(
    theme: &NativeTerminalTheme,
) -> Result<PathBuf, LifecycleError> {
    let config = build_native_terminal_theme_config(theme)?;
    let mut hasher = DefaultHasher::new();
    config.hash(&mut hasher);
    let path = native_terminal_theme_dir()?.join(format!("{:016x}.conf", hasher.finish()));
    if !path.exists() {
        fs::write(&path, config).map_err(|error| {
            LifecycleError::AttachFailed(format!(
                "failed to write native terminal theme override: {error}"
            ))
        })?;
    }

    Ok(path)
}

pub(crate) fn parse_native_terminal_color_scheme(
    appearance: &str,
) -> Result<NativeTerminalColorScheme, LifecycleError> {
    match appearance {
        "light" => Ok(NativeTerminalColorScheme::Light),
        "dark" => Ok(NativeTerminalColorScheme::Dark),
        other => Err(LifecycleError::AttachFailed(format!(
            "unsupported native terminal appearance: {other}"
        ))),
    }
}

pub(crate) fn run_native_terminal_on_main_thread<T: Send + 'static>(
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

#[cfg(target_os = "macos")]
pub(crate) fn sync_native_terminal_in_webview<T: Send + 'static>(
    window: &WebviewWindow,
    task: impl FnOnce(*mut std::ffi::c_void) -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    window
        .with_webview(move |webview| {
            let _ = sender.send(task(webview.inner()));
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed("native terminal webview task did not complete".to_string())
    })?
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn sync_native_terminal_in_webview<T: Send + 'static>(
    _window: &WebviewWindow,
    _task: impl FnOnce(*mut std::ffi::c_void) -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    Err(LifecycleError::AttachFailed(
        "native terminal webview integration is unavailable on this platform".to_string(),
    ))
}
