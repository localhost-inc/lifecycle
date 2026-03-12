use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedTerminalAttachment {
    pub absolute_path: String,
    pub file_name: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeTerminalTheme {
    pub background: String,
    pub cursor_color: String,
    pub foreground: String,
    pub palette: Vec<String>,
    pub selection_background: String,
    pub selection_foreground: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeTerminalSurfaceSyncInput {
    pub appearance: String,
    pub focused: bool,
    pub font_family: String,
    pub font_size: f64,
    pub height: f64,
    pub pointer_passthrough: bool,
    pub scale_factor: f64,
    pub terminal_id: String,
    pub theme: NativeTerminalTheme,
    pub visible: bool,
    pub width: f64,
    pub x: f64,
    pub y: f64,
}
