use crate::capabilities::targets::resolve_sandboxed_path;
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
enum AppOpener {
    Default,
    Program(&'static str),
}

#[derive(Debug, Clone, Serialize)]
pub struct OpenInApp {
    pub id: String,
    pub label: String,
    pub icon_data_url: Option<String>,
}

#[cfg(target_os = "macos")]
const OPEN_IN_ICON_PIXEL_SIZE: u32 = 64;

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

fn open_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::Io(format!("{}: {}", operation, reason.into()))
}

pub fn open_file(
    app: &AppHandle,
    root_path: &str,
    file_path: &str,
) -> Result<(), LifecycleError> {
    let resolved_path = resolve_sandboxed_path(root_path, file_path, "open file")?;
    app.opener()
        .open_path(resolved_path.to_string_lossy().into_owned(), None::<String>)
        .map_err(|error| open_failure("open file", error.to_string()))
}

pub fn open_in_app(
    app: &AppHandle,
    root_path: &str,
    app_id: &str,
) -> Result<(), LifecycleError> {
    let resolved_path = std::fs::canonicalize(root_path).map_err(|error| {
        open_failure("open in app", format!("failed to resolve root path: {error}"))
    })?;
    let resolved_path = resolved_path.to_string_lossy().into_owned();
    let opener = resolve_app_opener(app_id)?;

    match opener {
        AppOpener::Default => app.opener().open_path(resolved_path, None::<String>),
        AppOpener::Program(program) => app
            .opener()
            .open_path(resolved_path, Some(program.to_string())),
    }
    .map_err(|error| {
        open_failure(
            "open in app",
            format!("failed to launch {app_id}: {error}"),
        )
    })?;

    Ok(())
}

#[cfg(target_os = "macos")]
pub fn list_open_in_apps() -> Result<Vec<OpenInApp>, LifecycleError> {
    list_installed_apps()?
        .into_iter()
        .map(|(app_id, label)| {
            Ok(OpenInApp {
                id: app_id.to_string(),
                label: label.to_string(),
                icon_data_url: open_in_icon_data_url(app_id)?,
            })
        })
        .collect()
}

#[cfg(not(target_os = "macos"))]
pub fn list_open_in_apps() -> Result<Vec<OpenInApp>, LifecycleError> {
    Ok(Vec::new())
}

fn resolve_app_opener(app_id: &str) -> Result<AppOpener, LifecycleError> {
    #[cfg(target_os = "macos")]
    let opener = match app_id {
        "cursor" => AppOpener::Program("Cursor"),
        "ghostty" => AppOpener::Program("Ghostty"),
        "iterm" => AppOpener::Program("iTerm"),
        "vscode" => AppOpener::Program("Visual Studio Code"),
        "warp" => AppOpener::Program("Warp"),
        "windsurf" => AppOpener::Program("Windsurf"),
        "xcode" => AppOpener::Program("Xcode"),
        "zed" => AppOpener::Program("Zed"),
        "finder" => AppOpener::Default,
        _ => {
            return Err(open_failure(
                "open in app",
                format!("unsupported app id: {app_id}"),
            ));
        }
    };

    #[cfg(not(target_os = "macos"))]
    let opener = match app_id {
        "cursor" => AppOpener::Program("cursor"),
        "windsurf" => AppOpener::Program("windsurf"),
        "vscode" => AppOpener::Program("code"),
        "zed" => AppOpener::Program("zed"),
        _ => {
            return Err(open_failure(
                "open in app",
                format!("unsupported app id on this platform: {app_id}"),
            ));
        }
    };

    Ok(opener)
}

#[cfg(target_os = "macos")]
fn open_in_menu_targets() -> &'static [(&'static str, &'static str)] {
    &[
        ("vscode", "VS Code"),
        ("cursor", "Cursor"),
        ("windsurf", "Windsurf"),
        ("finder", "Finder"),
        ("iterm", "iTerm2"),
        ("ghostty", "Ghostty"),
        ("warp", "Warp"),
        ("xcode", "Xcode"),
    ]
}

#[cfg(target_os = "macos")]
fn open_in_icon_app_name(app_id: &str) -> Option<&'static str> {
    match app_id {
        "vscode" => Some("Visual Studio Code"),
        "cursor" => Some("Cursor"),
        "windsurf" => Some("Windsurf"),
        "finder" => Some("Finder"),
        "iterm" => Some("iTerm"),
        "ghostty" => Some("Ghostty"),
        "warp" => Some("Warp"),
        "xcode" => Some("Xcode"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn resolve_app_path(
    application_name: &str,
) -> Result<Option<PathBuf>, LifecycleError> {
    let application_name = CString::new(application_name).map_err(|error| {
        open_failure("resolve app path", error.to_string())
    })?;

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
fn resolve_app_icon_path(
    application_name: &str,
    pixel_size: u32,
) -> Result<Option<PathBuf>, LifecycleError> {
    let application_name = CString::new(application_name).map_err(|error| {
        open_failure("resolve app path", error.to_string())
    })?;

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
fn list_installed_apps(
) -> Result<Vec<(&'static str, &'static str)>, LifecycleError> {
    let mut installed_targets = Vec::new();
    for (app_id, label) in open_in_menu_targets() {
        let Some(application_name) = open_in_icon_app_name(app_id) else {
            continue;
        };

        if resolve_app_path(application_name)?.is_some() {
            installed_targets.push((*app_id, *label));
        }
    }

    Ok(installed_targets)
}

#[cfg(target_os = "macos")]
fn open_in_icon_data_url(app_id: &str) -> Result<Option<String>, LifecycleError> {
    let Some(application_name) = open_in_icon_app_name(app_id) else {
        return Ok(None);
    };
    let Some(icon_path) =
        resolve_app_icon_path(application_name, OPEN_IN_ICON_PIXEL_SIZE)?
    else {
        return Ok(None);
    };

    let icon_bytes = std::fs::read(&icon_path).map_err(|error| {
        open_failure("list open in apps", error.to_string())
    })?;
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(icon_bytes)
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_app_opener_rejects_unknown_apps() {
        let error = resolve_app_opener("unknown").expect_err("reject unsupported app");
        assert!(error.to_string().contains("unsupported app id"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn resolve_app_opener_uses_macos_application_names() {
        assert_eq!(
            resolve_app_opener("cursor").expect("cursor opener"),
            AppOpener::Program("Cursor")
        );
        assert_eq!(
            resolve_app_opener("vscode").expect("vscode opener"),
            AppOpener::Program("Visual Studio Code")
        );
        assert_eq!(
            resolve_app_opener("finder").expect("finder opener"),
            AppOpener::Default
        );
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn resolve_app_opener_uses_non_macos_program_names() {
        assert_eq!(
            resolve_app_opener("cursor").expect("cursor opener"),
            AppOpener::Program("cursor")
        );
        assert_eq!(
            resolve_app_opener("vscode").expect("vscode opener"),
            AppOpener::Program("code")
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn open_in_icon_uses_expected_application_names() {
        assert_eq!(
            open_in_icon_app_name("vscode"),
            Some("Visual Studio Code")
        );
        assert_eq!(
            open_in_icon_app_name("finder"),
            Some("Finder")
        );
        assert_eq!(
            open_in_icon_app_name("unknown"),
            None
        );
    }
}
