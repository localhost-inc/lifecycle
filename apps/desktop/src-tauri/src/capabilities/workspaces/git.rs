use crate::platform::db::open_db;
use crate::platform::git::status::{
    self, GitCommitDiffResult, GitCommitResult, GitDiffResult, GitLogEntry, GitPushResult,
    GitStatusResult,
};
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkspaceAppOpener {
    Default,
    Program(&'static str),
}

fn workspace_git_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: reason.into(),
    }
}

fn require_local_worktree(db_path: &str, workspace_id: &str) -> Result<String, LifecycleError> {
    let conn = open_db(db_path)?;
    let (mode, worktree_path): (String, Option<String>) = conn
        .query_row(
            "SELECT mode, worktree_path FROM workspace WHERE id = ?1 LIMIT 1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;

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
}
