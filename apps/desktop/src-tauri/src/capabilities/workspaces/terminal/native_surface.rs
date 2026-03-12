use crate::platform::native_terminal::NativeTerminalColorScheme;
use crate::shared::errors::LifecycleError;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

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

fn validate_native_terminal_font_family(value: &str) -> Result<String, LifecycleError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(LifecycleError::AttachFailed(
            "native terminal font family is empty".to_string(),
        ));
    }

    if trimmed.contains(['\n', '\r']) {
        return Err(LifecycleError::AttachFailed(
            "native terminal font family contains an unsupported newline".to_string(),
        ));
    }

    Ok(trimmed.to_string())
}

fn quote_native_terminal_font_family(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('"', "\\\"");
    format!("\"{escaped}\"")
}

pub(crate) fn build_native_terminal_theme_config(
    theme: &NativeTerminalTheme,
    font_family: &str,
) -> Result<String, LifecycleError> {
    if theme.palette.len() != 16 {
        return Err(LifecycleError::AttachFailed(format!(
            "native terminal theme palette must contain 16 colors, received {}",
            theme.palette.len()
        )));
    }

    let font_family = validate_native_terminal_font_family(font_family)?;
    let background = validate_native_terminal_theme_value("background", &theme.background)?;
    let foreground = validate_native_terminal_theme_value("foreground", &theme.foreground)?;
    let cursor_color = validate_native_terminal_theme_value("cursorColor", &theme.cursor_color)?;
    let selection_background =
        validate_native_terminal_theme_value("selectionBackground", &theme.selection_background)?;
    let selection_foreground =
        validate_native_terminal_theme_value("selectionForeground", &theme.selection_foreground)?;

    let mut config_lines = Vec::with_capacity(theme.palette.len() + 10);
    for (index, color) in theme.palette.iter().enumerate() {
        let color = validate_native_terminal_theme_value("palette", color)?;
        config_lines.push(format!("palette = {index}={color}"));
    }
    config_lines.push("font-family = \"\"".to_string());
    config_lines.push(format!(
        "font-family = {}",
        quote_native_terminal_font_family(&font_family)
    ));
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
    font_family: &str,
) -> Result<PathBuf, LifecycleError> {
    let config = build_native_terminal_theme_config(theme, font_family)?;
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
