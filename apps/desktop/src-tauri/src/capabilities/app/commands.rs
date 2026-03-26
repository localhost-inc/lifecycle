use crate::platform::app_config::AppConfigPath;
use crate::platform::lifecycle_cli::LifecycleCliState;
use crate::platform::lifecycle_root::resolve_lifecycle_root;
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::fs::OpenOptions;
use std::process::Stdio;
use tauri::{State, Webview};

#[derive(Clone, Copy, Serialize)]
pub struct WindowMousePosition {
    x: f64,
    y: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnCliProcessRequest {
    args: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    log_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnCliProcessResult {
    pid: u32,
}

#[tauri::command]
pub fn get_app_config(
    config_path: State<'_, AppConfigPath>,
) -> Result<serde_json::Value, LifecycleError> {
    crate::platform::app_config::read_config(&config_path.0)
}

#[tauri::command]
pub fn write_app_config(
    config_path: State<'_, AppConfigPath>,
    config: serde_json::Value,
) -> Result<(), LifecycleError> {
    crate::platform::app_config::write_config(&config_path.0, &config)
}

#[tauri::command]
pub async fn get_auth_session() -> Result<crate::platform::auth::AuthSession, LifecycleError> {
    crate::platform::auth::read_auth_session().await
}

#[tauri::command]
pub fn spawn_cli_process(
    lifecycle_cli: State<'_, LifecycleCliState>,
    request: SpawnCliProcessRequest,
) -> Result<SpawnCliProcessResult, LifecycleError> {
    let binary_path = lifecycle_cli
        .binary_path()
        .ok_or_else(|| LifecycleError::AttachFailed("Lifecycle CLI is unavailable.".to_string()))?;

    let mut command = std::process::Command::new(binary_path);
    command.args(&request.args).stdin(Stdio::null());

    if let Some(ref log_path_str) = request.log_path {
        let log_path = std::path::Path::new(log_path_str);
        if let Some(parent) = log_path.parent() {
            fs::create_dir_all(parent).map_err(|error| LifecycleError::Io(error.to_string()))?;
        }
        let log_file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .map_err(|error| LifecycleError::Io(error.to_string()))?;
        let log_file_stderr = log_file
            .try_clone()
            .map_err(|error| LifecycleError::Io(error.to_string()))?;
        command
            .stdout(Stdio::from(log_file))
            .stderr(Stdio::from(log_file_stderr));
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }

    if !request.env.is_empty() {
        command.envs(&request.env);
    }

    if let Some(cwd) = request.cwd {
        command.current_dir(cwd);
    }

    let child = command
        .spawn()
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    Ok(SpawnCliProcessResult { pid: child.id() })
}

#[tauri::command]
pub fn read_json_file(path: String) -> Result<Option<serde_json::Value>, LifecycleError> {
    let file_path = std::path::Path::new(&path);
    if !file_path.exists() {
        return Ok(None);
    }

    let raw =
        fs::read_to_string(file_path).map_err(|error| LifecycleError::Io(error.to_string()))?;
    let parsed = serde_json::from_str(&raw).map_err(|error| LifecycleError::InvalidInput {
        field: "path".to_string(),
        reason: format!("invalid JSON: {error}"),
    })?;
    Ok(Some(parsed))
}

#[tauri::command]
pub fn resolve_lifecycle_root_path() -> Result<String, LifecycleError> {
    Ok(resolve_lifecycle_root()?.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn set_window_accepts_mouse_moved_events(
    webview: Webview,
    enabled: bool,
) -> Result<(), LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSView, NSWindow};

        webview
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                if let Some(host_window) = view.window() {
                    let host_window: &NSWindow = &host_window;
                    host_window.setAcceptsMouseMovedEvents(enabled);
                }
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (&webview, enabled);

    Ok(())
}

#[tauri::command]
pub async fn set_window_pointing_cursor(
    webview: Webview,
    pointing: bool,
) -> Result<(), LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::{NSCursor, NSView};

        webview
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                if view.window().is_some() {
                    let cursor = if pointing {
                        NSCursor::pointingHandCursor()
                    } else {
                        NSCursor::arrowCursor()
                    };
                    cursor.set();
                }
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;
    }

    #[cfg(not(target_os = "macos"))]
    let _ = (&webview, pointing);

    Ok(())
}

#[tauri::command]
pub async fn get_window_mouse_position(
    webview: Webview,
) -> Result<Option<WindowMousePosition>, LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSView;
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);

        webview
            .with_webview(move |webview| unsafe {
                let view: &NSView = &*webview.inner().cast();
                let position = view.window().map(|host_window| {
                    let point = view.convertPoint_fromView(
                        host_window.mouseLocationOutsideOfEventStream(),
                        None,
                    );
                    let bounds = view.bounds();
                    let y = if view.isFlipped() {
                        point.y
                    } else {
                        bounds.size.height - point.y
                    };

                    WindowMousePosition { x: point.x, y }
                });

                let _ = sender.send(position);
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

        return receiver.recv().map_err(|_| {
            LifecycleError::AttachFailed("overlay mouse position did not resolve".to_string())
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = &webview;
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn sync_project_menu(app: tauri::AppHandle, names: Vec<String>) -> Result<(), String> {
    use crate::APP_MENU_ITEM_SELECT_PROJECT_PREFIX;
    use tauri::menu::{MenuItemBuilder, SubmenuBuilder};

    let menu = app.menu().ok_or("no app menu")?;

    // Find and remove the existing Project submenu.
    let items = menu.items().map_err(|e| e.to_string())?;
    for item in &items {
        if let tauri::menu::MenuItemKind::Submenu(sub) = item {
            if sub.text().map_or(false, |t| t == "Project") {
                let _ = menu.remove(sub);
                break;
            }
        }
    }

    // Build a new Project submenu with the provided names.
    let max_items = names.len().min(9);
    let mut builder = SubmenuBuilder::new(&app, "Project");
    for (i, name) in names.iter().take(max_items).enumerate() {
        let digit = i + 1;
        let item_id = format!("{APP_MENU_ITEM_SELECT_PROJECT_PREFIX}{digit}");
        let item = MenuItemBuilder::with_id(item_id, name.as_str())
            .accelerator(format!("CmdOrCtrl+{digit}"))
            .build(&app)
            .map_err(|e| e.to_string())?;
        builder = builder.item(&item);
    }
    let project_menu = builder.build().map_err(|e| e.to_string())?;
    menu.append(&project_menu).map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn sync_project_menu(_names: Vec<String>) -> Result<(), String> {
    Ok(())
}
