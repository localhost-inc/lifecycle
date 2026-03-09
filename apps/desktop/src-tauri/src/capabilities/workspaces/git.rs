use crate::platform::db::open_db;
use crate::platform::git::pull_request::{
    self, GitBranchPullRequestResult, GitPullRequestListResult, GitPullRequestSummary,
};
use crate::platform::git::status::{
    self, GitCommitDiffResult, GitCommitResult, GitDiffResult, GitLogEntry, GitPushResult,
    GitStatusResult,
};
use crate::shared::errors::LifecycleError;
#[cfg(target_os = "macos")]
use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::params;
#[cfg(target_os = "macos")]
use serde::Serialize;
#[cfg(target_os = "macos")]
use std::ffi::{CStr, CString};
use std::path::{Component, Path, PathBuf};
#[cfg(target_os = "macos")]
use tauri::image::Image;
use tauri::{AppHandle, Manager};
#[cfg(target_os = "macos")]
use tauri::{Emitter, LogicalPosition, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkspaceAppOpener {
    Default,
    Program(&'static str),
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceOpenInApp {
    pub id: String,
    pub label: String,
    pub icon_data_url: Option<String>,
}

#[cfg(target_os = "macos")]
const WORKSPACE_OPEN_IN_MENU_EVENT_NAME: &str = "workspace:open-in-menu";

#[cfg(target_os = "macos")]
const WORKSPACE_OPEN_IN_MENU_ID_PREFIX: &str = "workspace.open-in";

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
    fn lifecycle_native_set_application_appearance(appearance_name: *const std::ffi::c_char);
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Serialize)]
pub struct WorkspaceOpenInMenuEvent {
    pub workspace_id: String,
    pub app_id: String,
    pub error: Option<String>,
}

fn workspace_git_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: reason.into(),
    }
}

fn resolve_workspace_git_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<(String, Option<String>), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT mode, worktree_path FROM workspace WHERE id = ?1 LIMIT 1",
        params![workspace_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(workspace_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
}

fn require_local_worktree(db_path: &str, workspace_id: &str) -> Result<String, LifecycleError> {
    let (mode, worktree_path) = resolve_workspace_git_context(db_path, workspace_id)?;

    if mode != "local" {
        return Err(LifecycleError::GitOperationFailed {
            operation: "resolve workspace git context".to_string(),
            reason: format!("workspace {workspace_id} is in {mode} mode"),
        });
    }

    worktree_path.ok_or_else(|| LifecycleError::GitOperationFailed {
        operation: "resolve workspace git context".to_string(),
        reason: format!("workspace {workspace_id} has no local worktree path"),
    })
}

fn resolve_workspace_root_path(
    db_path: &str,
    workspace_id: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, workspace_id)?;
    std::fs::canonicalize(&worktree_path).map_err(|error| {
        workspace_git_failure(
            operation,
            format!("failed to resolve workspace root: {error}"),
        )
    })
}

fn normalize_repo_relative_path(repo_relative_path: &str) -> Result<PathBuf, LifecycleError> {
    let trimmed = repo_relative_path.trim();
    if trimmed.is_empty() {
        return Err(workspace_git_failure(
            "open workspace file",
            "repo-relative path cannot be empty",
        ));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(workspace_git_failure(
            "open workspace file",
            format!("path must be repo-relative: {trimmed}"),
        ));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(workspace_git_failure(
                        "open workspace file",
                        format!("path escapes workspace root: {trimmed}"),
                    ));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(workspace_git_failure(
                    "open workspace file",
                    format!("path must be repo-relative: {trimmed}"),
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(workspace_git_failure(
            "open workspace file",
            "repo-relative path cannot resolve to the workspace root",
        ));
    }

    Ok(normalized)
}

fn resolve_workspace_file_path(
    db_path: &str,
    workspace_id: &str,
    repo_relative_path: &str,
) -> Result<PathBuf, LifecycleError> {
    let canonical_worktree =
        resolve_workspace_root_path(db_path, workspace_id, "open workspace file")?;
    let relative_path = normalize_repo_relative_path(repo_relative_path)?;
    let candidate_path = canonical_worktree.join(relative_path);
    let canonical_candidate = std::fs::canonicalize(&candidate_path).map_err(|error| {
        workspace_git_failure(
            "open workspace file",
            format!("failed to resolve workspace file: {error}"),
        )
    })?;

    if !canonical_candidate.starts_with(&canonical_worktree) {
        return Err(workspace_git_failure(
            "open workspace file",
            format!("path resolves outside workspace root: {repo_relative_path}"),
        ));
    }

    Ok(canonical_candidate)
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
            return Err(workspace_git_failure(
                "open workspace in app",
                format!("unsupported app: {app_id}"),
            ))
        }
    };

    #[cfg(not(target_os = "macos"))]
    let opener = match app_id {
        "cursor" => WorkspaceAppOpener::Program("cursor"),
        "windsurf" => WorkspaceAppOpener::Program("windsurf"),
        "vscode" => WorkspaceAppOpener::Program("code"),
        "zed" => WorkspaceAppOpener::Program("zed"),
        _ => {
            return Err(workspace_git_failure(
                "open workspace in app",
                format!("unsupported app on this platform: {app_id}"),
            ))
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
fn make_workspace_open_in_menu_item_id(
    window_label: &str,
    workspace_id: &str,
    app_id: &str,
) -> String {
    format!("{WORKSPACE_OPEN_IN_MENU_ID_PREFIX}|{window_label}|{workspace_id}|{app_id}")
}

#[cfg(target_os = "macos")]
fn parse_workspace_open_in_menu_item_id(menu_id: &str) -> Option<(&str, &str, &str)> {
    let mut segments = menu_id.splitn(4, '|');
    let prefix = segments.next()?;
    let window_label = segments.next()?;
    let workspace_id = segments.next()?;
    let app_id = segments.next()?;
    if prefix != WORKSPACE_OPEN_IN_MENU_ID_PREFIX {
        return None;
    }
    Some((window_label, workspace_id, app_id))
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
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))?;

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
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))?;

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
fn workspace_open_in_menu_icon(app_id: &str) -> Result<Option<Image<'static>>, LifecycleError> {
    let Some(application_name) = workspace_open_in_menu_icon_application_name(app_id) else {
        return Ok(None);
    };
    let Some(icon_path) =
        workspace_open_in_menu_icon_path(application_name, WORKSPACE_OPEN_IN_ICON_PIXEL_SIZE)?
    else {
        return Ok(None);
    };

    Image::from_path(icon_path)
        .map(Some)
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))
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
        .map_err(|error| workspace_git_failure("list workspace open in apps", error.to_string()))?;
    Ok(Some(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(icon_bytes)
    )))
}

fn update_workspace_git_sha(
    db_path: &str,
    workspace_id: &str,
    sha: &str,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace SET git_sha = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![sha, workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

pub async fn get_workspace_git_status(
    db_path: &str,
    workspace_id: String,
) -> Result<GitStatusResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_status(&worktree_path).await
}

pub async fn get_workspace_git_diff(
    db_path: &str,
    workspace_id: String,
    file_path: String,
    scope: String,
) -> Result<GitDiffResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_diff(&worktree_path, &file_path, &scope).await
}

pub async fn get_workspace_git_scope_patch(
    db_path: &str,
    workspace_id: String,
    scope: String,
) -> Result<String, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_scope_patch(&worktree_path, &scope).await
}

pub async fn get_workspace_git_changes_patch(
    db_path: &str,
    workspace_id: String,
) -> Result<String, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_changes_patch(&worktree_path).await
}

pub async fn list_workspace_git_log(
    db_path: &str,
    workspace_id: String,
    limit: u32,
) -> Result<Vec<GitLogEntry>, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_log(&worktree_path, limit).await
}

pub async fn list_workspace_git_pull_requests(
    db_path: &str,
    workspace_id: String,
) -> Result<GitPullRequestListResult, LifecycleError> {
    let (mode, worktree_path) = resolve_workspace_git_context(db_path, &workspace_id)?;
    if mode != "local" {
        return Ok(GitPullRequestListResult {
            support: pull_request::mode_not_supported(
                "Cloud workspace pull requests will use the cloud provider once it exists.",
            ),
            pull_requests: Vec::new(),
        });
    }

    let worktree_path = worktree_path.ok_or_else(|| LifecycleError::GitOperationFailed {
        operation: "list GitHub pull requests".to_string(),
        reason: format!("workspace {workspace_id} has no local worktree path"),
    })?;

    pull_request::list_open_pull_requests(&worktree_path).await
}

pub async fn get_workspace_current_git_pull_request(
    db_path: &str,
    workspace_id: String,
) -> Result<GitBranchPullRequestResult, LifecycleError> {
    let (mode, worktree_path) = resolve_workspace_git_context(db_path, &workspace_id)?;
    if mode != "local" {
        return Ok(GitBranchPullRequestResult {
            support: pull_request::mode_not_supported(
                "Cloud workspace pull requests will use the cloud provider once it exists.",
            ),
            branch: None,
            upstream: None,
            suggested_base_ref: None,
            pull_request: None,
        });
    }

    let worktree_path = worktree_path.ok_or_else(|| LifecycleError::GitOperationFailed {
        operation: "read current branch GitHub pull request".to_string(),
        reason: format!("workspace {workspace_id} has no local worktree path"),
    })?;

    pull_request::get_current_branch_pull_request(&worktree_path).await
}

pub async fn get_workspace_git_base_ref(
    db_path: &str,
    workspace_id: String,
) -> Result<Option<String>, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_base_ref(&worktree_path).await
}

pub async fn get_workspace_git_commit_patch(
    db_path: &str,
    workspace_id: String,
    sha: String,
) -> Result<GitCommitDiffResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::get_git_commit_patch(&worktree_path, &sha).await
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
        .map_err(|error| workspace_git_failure("open workspace file", error.to_string()))
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
        workspace_git_failure(
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

#[cfg(target_os = "macos")]
pub fn show_workspace_open_in_menu(
    window: &WebviewWindow,
    workspace_id: String,
    _current_app_id: String,
    appearance: String,
    x: f64,
    y: f64,
) -> Result<(), LifecycleError> {
    use tauri::menu::{IconMenuItemBuilder, MenuBuilder, MenuItemBuilder};

    let appearance = CString::new(appearance)
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))?;
    unsafe { lifecycle_native_set_application_appearance(appearance.as_ptr()) };

    let header = MenuItemBuilder::new("Open in")
        .enabled(false)
        .build(window)
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))?;

    let mut menu = MenuBuilder::new(window).item(&header).separator();
    for (index, (app_id, label)) in list_installed_workspace_open_in_apps()?
        .into_iter()
        .enumerate()
    {
        if index == 3 {
            menu = menu.separator();
        }

        let mut item = IconMenuItemBuilder::with_id(
            make_workspace_open_in_menu_item_id(window.label(), &workspace_id, app_id),
            label,
        );
        if let Some(icon) = workspace_open_in_menu_icon(app_id)? {
            item = item.icon(icon);
        }

        let item = item.build(window).map_err(|error| {
            workspace_git_failure("show workspace open in menu", error.to_string())
        })?;

        menu = menu.item(&item);
    }

    let menu = menu
        .build()
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))?;

    window
        .popup_menu_at(&menu, LogicalPosition::new(x, y))
        .map_err(|error| workspace_git_failure("show workspace open in menu", error.to_string()))
}

#[cfg(not(target_os = "macos"))]
pub fn show_workspace_open_in_menu(
    _window: &tauri::WebviewWindow,
    _workspace_id: String,
    _current_app_id: String,
    _appearance: String,
    _x: f64,
    _y: f64,
) -> Result<(), LifecycleError> {
    Err(workspace_git_failure(
        "show workspace open in menu",
        "native open-in menu is only available on macOS",
    ))
}

#[cfg(target_os = "macos")]
pub fn handle_workspace_open_in_menu_event(app: &AppHandle, menu_id: &str) -> bool {
    let Some((window_label, workspace_id, app_id)) = parse_workspace_open_in_menu_item_id(menu_id)
    else {
        return false;
    };

    let db_path = app.state::<crate::platform::db::DbPath>();
    let result = open_workspace_in_app(
        app,
        &db_path.0,
        workspace_id.to_string(),
        app_id.to_string(),
    );

    let _ = app.emit_to(
        window_label,
        WORKSPACE_OPEN_IN_MENU_EVENT_NAME,
        WorkspaceOpenInMenuEvent {
            workspace_id: workspace_id.to_string(),
            app_id: app_id.to_string(),
            error: result.err().map(|error| error.to_string()),
        },
    );

    true
}

#[cfg(not(target_os = "macos"))]
pub fn handle_workspace_open_in_menu_event(_app: &AppHandle, _menu_id: &str) -> bool {
    false
}

pub async fn stage_workspace_git_files(
    db_path: &str,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::stage_git_files(&worktree_path, &file_paths).await
}

pub async fn unstage_workspace_git_files(
    db_path: &str,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::unstage_git_files(&worktree_path, &file_paths).await
}

pub async fn commit_workspace_git(
    db_path: &str,
    workspace_id: String,
    message: String,
) -> Result<GitCommitResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    let result = status::commit_git(&worktree_path, &message).await?;
    update_workspace_git_sha(db_path, &workspace_id, &result.sha)?;
    Ok(result)
}

pub async fn push_workspace_git(
    db_path: &str,
    workspace_id: String,
) -> Result<GitPushResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    status::push_git(&worktree_path).await
}

pub async fn create_workspace_git_pull_request(
    db_path: &str,
    workspace_id: String,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    pull_request::create_pull_request(&worktree_path).await
}

pub async fn merge_workspace_git_pull_request(
    db_path: &str,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id)?;
    pull_request::merge_pull_request(&worktree_path, pull_request_number).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::{open_db, run_migrations};
    use std::fs;
    use std::path::Path;

    fn temp_fixture_root() -> PathBuf {
        std::env::temp_dir().join(format!("lifecycle-workspace-git-{}", uuid::Uuid::new_v4()))
    }

    fn temp_db_path() -> String {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-workspace-git-{}.db",
            uuid::Uuid::new_v4()
        ));
        path.to_string_lossy().into_owned()
    }

    fn seed_workspace(db_path: &str, workspace_id: &str, worktree_path: &Path) {
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path, mode, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                workspace_id,
                "project_1",
                "lifecycle/test",
                worktree_path.to_str().expect("worktree path is utf8"),
                "local",
                "ready"
            ],
        )
        .expect("insert workspace");
    }

    #[test]
    fn resolve_workspace_file_path_accepts_repo_relative_files_inside_worktree() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let file_path = worktree_path.join("src").join("main.rs");
        let db_path = temp_db_path();

        fs::create_dir_all(file_path.parent().expect("file parent")).expect("create file parent");
        fs::write(&file_path, "fn main() {}\n").expect("write repo file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let resolved = resolve_workspace_file_path(&db_path, "workspace_1", "./src/main.rs")
            .expect("resolve workspace file path");
        assert_eq!(
            resolved,
            std::fs::canonicalize(&file_path).expect("canonicalize repo file")
        );

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn resolve_workspace_file_path_rejects_paths_outside_worktree() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let outside_path = root.join("outside.txt");
        let db_path = temp_db_path();

        fs::create_dir_all(&worktree_path).expect("create worktree");
        fs::write(&outside_path, "outside\n").expect("write outside file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let error = resolve_workspace_file_path(&db_path, "workspace_1", "../outside.txt")
            .expect_err("reject path outside worktree");
        match error {
            LifecycleError::GitOperationFailed { operation, reason } => {
                assert_eq!(operation, "open workspace file");
                assert!(reason.contains("escapes workspace root"));
            }
            other => panic!("unexpected error: {other:?}"),
        }

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn resolve_workspace_app_opener_rejects_unknown_apps() {
        let error = resolve_workspace_app_opener("unknown").expect_err("reject unsupported app");
        match error {
            LifecycleError::GitOperationFailed { operation, reason } => {
                assert_eq!(operation, "open workspace in app");
                assert!(reason.contains("unsupported app"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
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
            resolve_workspace_app_opener("windsurf").expect("windsurf opener"),
            WorkspaceAppOpener::Program("Windsurf")
        );
        assert_eq!(
            resolve_workspace_app_opener("zed").expect("zed opener"),
            WorkspaceAppOpener::Program("Zed")
        );
        assert_eq!(
            resolve_workspace_app_opener("finder").expect("finder opener"),
            WorkspaceAppOpener::Default
        );
        assert_eq!(
            resolve_workspace_app_opener("terminal").expect("terminal opener"),
            WorkspaceAppOpener::Program("Terminal")
        );
        assert_eq!(
            resolve_workspace_app_opener("iterm").expect("iterm opener"),
            WorkspaceAppOpener::Program("iTerm")
        );
        assert_eq!(
            resolve_workspace_app_opener("ghostty").expect("ghostty opener"),
            WorkspaceAppOpener::Program("Ghostty")
        );
        assert_eq!(
            resolve_workspace_app_opener("warp").expect("warp opener"),
            WorkspaceAppOpener::Program("Warp")
        );
        assert_eq!(
            resolve_workspace_app_opener("xcode").expect("xcode opener"),
            WorkspaceAppOpener::Program("Xcode")
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
        assert_eq!(
            resolve_workspace_app_opener("windsurf").expect("windsurf opener"),
            WorkspaceAppOpener::Program("windsurf")
        );
        assert_eq!(
            resolve_workspace_app_opener("zed").expect("zed opener"),
            WorkspaceAppOpener::Program("zed")
        );
        let error =
            resolve_workspace_app_opener("terminal").expect_err("terminal is unsupported here");
        match error {
            LifecycleError::GitOperationFailed { operation, reason } => {
                assert_eq!(operation, "open workspace in app");
                assert!(reason.contains("unsupported app on this platform"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parse_workspace_open_in_menu_item_id_round_trips() {
        let id = make_workspace_open_in_menu_item_id("main", "workspace_1", "vscode");
        assert_eq!(
            parse_workspace_open_in_menu_item_id(&id),
            Some(("main", "workspace_1", "vscode"))
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn parse_workspace_open_in_menu_item_id_rejects_other_prefixes() {
        assert_eq!(
            parse_workspace_open_in_menu_item_id("app.open-settings"),
            None
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
        assert_eq!(
            workspace_open_in_menu_icon_application_name("iterm"),
            Some("iTerm")
        );
        assert_eq!(
            workspace_open_in_menu_icon_application_name("unknown"),
            None
        );
    }
}
