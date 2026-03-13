use crate::platform::native_terminal::NativeTerminalColorScheme;
use crate::shared::errors::LifecycleError;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use super::types::NativeTerminalTheme;

pub(crate) fn default_native_terminal_theme() -> NativeTerminalTheme {
    NativeTerminalTheme {
        background: "#09090b".to_string(),
        cursor_color: "#93c5fd".to_string(),
        foreground: "#fafaf9".to_string(),
        palette: vec![
            "#27272a".to_string(),
            "#f43f5e".to_string(),
            "#4ade80".to_string(),
            "#facc15".to_string(),
            "#60a5fa".to_string(),
            "#c084fc".to_string(),
            "#22d3ee".to_string(),
            "#f4f4f5".to_string(),
            "#52525b".to_string(),
            "#fb7185".to_string(),
            "#86efac".to_string(),
            "#fde047".to_string(),
            "#93c5fd".to_string(),
            "#d8b4fe".to_string(),
            "#67e8f9".to_string(),
            "#fafafa".to_string(),
        ],
        selection_background: "#27272a".to_string(),
        selection_foreground: "#fafaf9".to_string(),
    }
}

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

#[cfg(test)]
mod tests {
    use super::super::types::NativeTerminalTheme;
    use super::build_native_terminal_theme_config;
    use crate::shared::errors::LifecycleError;

    #[test]
    fn build_native_terminal_theme_config_serializes_ghostty_theme_fields() {
        let config = build_native_terminal_theme_config(
            &NativeTerminalTheme {
                background: "#1a1a1a".to_string(),
                cursor_color: "#539bf5".to_string(),
                foreground: "#adbac7".to_string(),
                palette: vec![
                    "#545d68".to_string(),
                    "#f47067".to_string(),
                    "#57ab5a".to_string(),
                    "#c69026".to_string(),
                    "#539bf5".to_string(),
                    "#b083f0".to_string(),
                    "#39c5cf".to_string(),
                    "#909dab".to_string(),
                    "#636e7b".to_string(),
                    "#ff938a".to_string(),
                    "#6bc46d".to_string(),
                    "#daaa3f".to_string(),
                    "#6cb6ff".to_string(),
                    "#dcbdfb".to_string(),
                    "#56d4dd".to_string(),
                    "#cdd9e5".to_string(),
                ],
                selection_background: "#444c56".to_string(),
                selection_foreground: "#adbac7".to_string(),
            },
            "Geist Mono",
        )
        .expect("native theme config");

        assert!(config.contains("palette = 0=#545d68"));
        assert!(config.contains("palette = 15=#cdd9e5"));
        assert!(config.contains("font-family = \"\""));
        assert!(config.contains("font-family = \"Geist Mono\""));
        assert!(config.contains("background = #1a1a1a"));
        assert!(config.contains("foreground = #adbac7"));
        assert!(config.contains("cursor-color = #539bf5"));
        assert!(config.contains("selection-background = #444c56"));
        assert!(config.contains("selection-foreground = #adbac7"));
        assert!(config.contains("window-padding-x = 0"));
        assert!(config.contains("window-padding-y = 0"));
    }

    #[test]
    fn build_native_terminal_theme_config_rejects_incomplete_palettes() {
        let error = build_native_terminal_theme_config(
            &NativeTerminalTheme {
                background: "#09090b".to_string(),
                cursor_color: "#93c5fd".to_string(),
                foreground: "#fafaf9".to_string(),
                palette: vec!["#27272a".to_string(); 15],
                selection_background: "#27272a".to_string(),
                selection_foreground: "#fafaf9".to_string(),
            },
            "Geist Mono",
        )
        .expect_err("palette length must fail");

        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("palette must contain 16 colors"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn build_native_terminal_theme_config_rejects_blank_font_family() {
        let error = build_native_terminal_theme_config(
            &NativeTerminalTheme {
                background: "#09090b".to_string(),
                cursor_color: "#93c5fd".to_string(),
                foreground: "#fafaf9".to_string(),
                palette: vec!["#27272a".to_string(); 16],
                selection_background: "#27272a".to_string(),
                selection_foreground: "#fafaf9".to_string(),
            },
            "   ",
        )
        .expect_err("blank font family must fail");

        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("font family"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
