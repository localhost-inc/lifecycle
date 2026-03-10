use super::paths::{resolve_workspace_file_path, resolve_workspace_root_path};
use crate::shared::errors::LifecycleError;
#[cfg(target_os = "macos")]
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
#[cfg(target_os = "macos")]
use std::ffi::{CStr, CString};
#[cfg(target_os = "macos")]
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkspaceAppOpener {
    Default,
    Program(&'static str),
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceOpenInApp {
    pub id: String,
    pub label: String,
    pub icon_data_url: Option<String>,
}

#[cfg(target_os = "macos")]
const WORKSPACE_OPEN_IN_ICON_PIXEL_SIZE: u32 = 64;

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn lifecycle_native_resolve_application_path(
        application_name: *const std::ffi::c_char,
    ) -> *mut std::ffi::c_char;
    fn lifecycle_native_copy_application_icon_png_path(
        application_name: *const std::ffi::c_char,
        pixel_size: u32,
    ) -> *mut std::ffi::c_char;
}

fn workspace_open_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: reason.into(),
    }
}

pub fn open_workspace_file(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
    file_path: String,
) -> Result<(), LifecycleError> {
    let resolved_path = resolve_workspace_file_path(db_path, &workspace_id, &file_path)?;
    app.opener()
        .open_path(resolved_path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| workspace_open_failure("open workspace file", error.to_string()))
}

pub fn open_workspace_in_app(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
    app_id: String,
) -> Result<(), LifecycleError> {
    let resolved_path =
        resolve_workspace_root_path(db_path, &workspace_id, "open workspace in app")?;
    let resolved_path = resolved_path.to_string_lossy().into_owned();
    let opener = resolve_workspace_app_opener(&app_id)?;

    match opener {
        WorkspaceAppOpener::Default => app.opener().open_path(resolved_path, None::<String>),
        WorkspaceAppOpener::Program(program) => app
            .opener()
            .open_path(resolved_path, Some(program.to_string())),
    }
    .map_err(|error| {
        workspace_open_failure(
            "open workspace in app",
            format!("failed to launch {app_id}: {error}"),
        )
    })?;

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn list_workspace_open_in_apps() -> Result<Vec<WorkspaceOpenInApp>, LifecycleError> {
    list_installed_workspace_open_in_apps()?
        .into_iter()
        .map(|(app_id, label)| {
            Ok(WorkspaceOpenInApp {
                id: app_id.to_string(),
                label: label.to_string(),
                icon_data_url: workspace_open_in_icon_data_url(app_id)?,
            })
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
pub fn list_workspace_open_in_apps() -> Result<Vec<WorkspaceOpenInApp>, LifecycleError> {
    Ok(Vec::new())
}

fn resolve_workspace_app_opener(app_id: &str) -> Result<WorkspaceAppOpener, LifecycleError> {
    #[cfg(target_os = "macos")]
    let opener = match app_id {
        "cursor" => WorkspaceAppOpener::Program("Cursor"),
        "ghostty" => WorkspaceAppOpener::Program("Ghostty"),
        "iterm" => WorkspaceAppOpener::Program("iTerm"),
        "vscode" => WorkspaceAppOpener::Program("Visual Studio Code"),
        "warp" => WorkspaceAppOpener::Program("Warp"),
        "windsurf" => WorkspaceAppOpener::Program("Windsurf"),
        "xcode" => WorkspaceAppOpener::Program("Xcode"),
        "zed" => WorkspaceAppOpener::Program("Zed"),
        "finder" => WorkspaceAppOpener::Default,
        "terminal" => WorkspaceAppOpener::Program("Terminal"),
        _ => {
            return Err(workspace_open_failure(
                "open workspace in app",
                format!("unsupported app id: {app_id}"),
            ));
        }
    };

    #[cfg(not(target_os = "macos"))]
    let opener = match app_id {
        "cursor" => WorkspaceAppOpener::Program("cursor"),
        "windsurf" => WorkspaceAppOpener::Program("windsurf"),
        "vscode" => WorkspaceAppOpener::Program("code"),
        "zed" => WorkspaceAppOpener::Program("zed"),
        _ => {
            return Err(workspace_open_failure(
                "open workspace in app",
                format!("unsupported app id on this platform: {app_id}"),
            ));
        }
    };

    Ok(opener)
}

#[cfg(target_os = "macos")]
fn workspace_open_in_menu_targets() -> &'static [(&'static str, &'static str)] {
    &[
        ("vscode", "VS Code"),
        ("cursor", "Cursor"),
        ("windsurf", "Windsurf"),
        ("finder", "Finder"),
        ("terminal", "Terminal"),
        ("iterm", "iTerm2"),
        ("ghostty", "Ghostty"),
        ("warp", "Warp"),
        ("xcode", "Xcode"),
    ]
}

#[cfg(target_os = "macos")]
fn workspace_open_in_menu_icon_application_name(app_id: &str) -> Option<&'static str> {
    match app_id {
        "vscode" => Some("Visual Studio Code"),
        "cursor" => Some("Cursor"),
        "windsurf" => Some("Windsurf"),
        "finder" => Some("Finder"),
        "terminal" => Some("Terminal"),
        "iterm" => Some("iTerm"),
        "ghostty" => Some("Ghostty"),
        "warp" => Some("Warp"),
        "xcode" => Some("Xcode"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn workspace_open_in_menu_application_path(
    application_name: &str,
) -> Result<Option<PathBuf>, LifecycleError> {
    let application_name = CString::new(application_name)
        .map_err(|error| workspace_open_failure("show workspace open in menu", error.to_string()))?;

    let application_path =
        unsafe { lifecycle_native_resolve_application_path(application_name.as_ptr()) };
    if application_path.is_null() {
        return Ok(None);
    }

    let application_path_string = unsafe { CStr::from_ptr(application_path) }
        .to_string_lossy()
        .into_owned();
    unsafe { libc::free(application_path.cast()) };
    Ok(Some(PathBuf::from(application_path_string)))
}

#[cfg(target_os = "macos")]
fn workspace_open_in_menu_icon_path(
    application_name: &str,
    pixel_size: u32,
) -> Result<Option<PathBuf>, LifecycleError> {
    let application_name = CString::new(application_name)
        .map_err(|error| workspace_open_failure("show workspace open in menu", error.to_string()))?;

    let icon_path = unsafe {
        lifecycle_native_copy_application_icon_png_path(application_name.as_ptr(), pixel_size)
    };
    if icon_path.is_null() {
        return Ok(None);
    }

    let icon_path_string = unsafe { CStr::from_ptr(icon_path) }
        .to_string_lossy()
        .into_owned();
    unsafe { libc::free(icon_path.cast()) };
    Ok(Some(PathBuf::from(icon_path_string)))
}

#[cfg(target_os = "macos")]
fn list_installed_workspace_open_in_apps(
) -> Result<Vec<(&'static str, &'static str)>, LifecycleError> {
    let mut installed_targets = Vec::new();
    for (app_id, label) in workspace_open_in_menu_targets() {
        let Some(application_name) = workspace_open_in_menu_icon_application_name(app_id) else {
            continue;
        };

        if workspace_open_in_menu_application_path(application_name)?.is_some() {
            installed_targets.push((*app_id, *label));
        }
    }

    Ok(installed_targets)
}

#[cfg(target_os = "macos")]
fn workspace_open_in_icon_data_url(app_id: &str) -> Result<Option<String>, LifecycleError> {
    let Some(application_name) = workspace_open_in_menu_icon_application_name(app_id) else {
        return Ok(None);
    };
    let Some(icon_path) =
        workspace_open_in_menu_icon_path(application_name, WORKSPACE_OPEN_IN_ICON_PIXEL_SIZE)?
    else {
        return Ok(None);
    };

    let icon_bytes = std::fs::read(&icon_path)
        .map_err(|error| workspace_open_failure("list workspace open in apps", error.to_string()))?;
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(icon_bytes)
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_workspace_app_opener_rejects_unknown_apps() {
        let error = resolve_workspace_app_opener("unknown").expect_err("reject unsupported app");
        assert!(error.to_string().contains("unsupported app id"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn resolve_workspace_app_opener_uses_macos_application_names() {
        assert_eq!(
            resolve_workspace_app_opener("cursor").expect("cursor opener"),
            WorkspaceAppOpener::Program("Cursor")
        );
        assert_eq!(
            resolve_workspace_app_opener("vscode").expect("vscode opener"),
            WorkspaceAppOpener::Program("Visual Studio Code")
        );
        assert_eq!(
            resolve_workspace_app_opener("finder").expect("finder opener"),
            WorkspaceAppOpener::Default
        );
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn resolve_workspace_app_opener_uses_non_macos_program_names() {
        assert_eq!(
            resolve_workspace_app_opener("cursor").expect("cursor opener"),
            WorkspaceAppOpener::Program("cursor")
        );
        assert_eq!(
            resolve_workspace_app_opener("vscode").expect("vscode opener"),
            WorkspaceAppOpener::Program("code")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn workspace_open_in_menu_icon_uses_expected_application_names() {
        assert_eq!(
            workspace_open_in_menu_icon_application_name("vscode"),
            Some("Visual Studio Code")
        );
        assert_eq!(
            workspace_open_in_menu_icon_application_name("finder"),
            Some("Finder")
        );
        assert_eq!(workspace_open_in_menu_icon_application_name("unknown"), None);
    }
}
