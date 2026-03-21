use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::path::{Component, Path, PathBuf};

fn workspace_path_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: reason.into(),
    }
}

pub(crate) fn target_supports_local_worktree_access(target: &str) -> bool {
    matches!(target, "local" | "docker")
}

fn resolve_workspace_target_and_worktree_path(
    db_path: &str,
    workspace_id: &str,
) -> Result<(String, Option<String>), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT target, worktree_path FROM workspace WHERE id = ?1 LIMIT 1",
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

pub(crate) fn resolve_workspace_git_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<(String, Option<String>), LifecycleError> {
    resolve_workspace_target_and_worktree_path(db_path, workspace_id)
}

pub(crate) fn require_local_worktree(
    db_path: &str,
    workspace_id: &str,
    operation: &str,
) -> Result<String, LifecycleError> {
    let (target, worktree_path) =
        resolve_workspace_target_and_worktree_path(db_path, workspace_id)?;

    if !target_supports_local_worktree_access(&target) {
        return Err(workspace_path_failure(
            operation,
            format!("workspace {workspace_id} uses unsupported target '{target}'"),
        ));
    }

    worktree_path.ok_or_else(|| {
        workspace_path_failure(
            operation,
            format!("workspace {workspace_id} has no local worktree path"),
        )
    })
}

pub(crate) fn resolve_workspace_root_path(
    db_path: &str,
    workspace_id: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, workspace_id, operation)?;
    std::fs::canonicalize(&worktree_path).map_err(|error| {
        workspace_path_failure(
            operation,
            format!("failed to resolve workspace root: {error}"),
        )
    })
}

pub(crate) fn normalize_repo_relative_path(
    repo_relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let trimmed = repo_relative_path.trim();
    if trimmed.is_empty() {
        return Err(workspace_path_failure(
            operation,
            "repo-relative path cannot be empty",
        ));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(workspace_path_failure(
            operation,
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
                    return Err(workspace_path_failure(
                        operation,
                        format!("path escapes workspace root: {trimmed}"),
                    ));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(workspace_path_failure(
                    operation,
                    format!("path must be repo-relative: {trimmed}"),
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(workspace_path_failure(
            operation,
            "repo-relative path cannot resolve to the workspace root",
        ));
    }

    Ok(normalized)
}

pub(crate) fn resolve_workspace_file_path_for_operation(
    db_path: &str,
    workspace_id: &str,
    repo_relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let canonical_worktree = resolve_workspace_root_path(db_path, workspace_id, operation)?;
    let relative_path = normalize_repo_relative_path(repo_relative_path, operation)?;
    let candidate_path = canonical_worktree.join(relative_path);
    let canonical_candidate = std::fs::canonicalize(&candidate_path).map_err(|error| {
        workspace_path_failure(
            operation,
            format!("failed to resolve workspace file: {error}"),
        )
    })?;

    if !canonical_candidate.starts_with(&canonical_worktree) {
        return Err(workspace_path_failure(
            operation,
            format!("path resolves outside workspace root: {repo_relative_path}"),
        ));
    }

    Ok(canonical_candidate)
}

pub(crate) fn resolve_workspace_write_path_for_operation(
    db_path: &str,
    workspace_id: &str,
    repo_relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let canonical_worktree = resolve_workspace_root_path(db_path, workspace_id, operation)?;
    let relative_path = normalize_repo_relative_path(repo_relative_path, operation)?;
    let candidate_path = canonical_worktree.join(&relative_path);

    let existing_scope = if candidate_path.exists() {
        candidate_path.clone()
    } else {
        candidate_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| canonical_worktree.clone())
    };

    let canonical_scope = std::fs::canonicalize(&existing_scope).map_err(|error| {
        workspace_path_failure(
            operation,
            format!("failed to resolve workspace file scope: {error}"),
        )
    })?;

    if !canonical_scope.starts_with(&canonical_worktree) {
        return Err(workspace_path_failure(
            operation,
            format!("path resolves outside workspace root: {repo_relative_path}"),
        ));
    }

    Ok(candidate_path)
}

pub(crate) fn resolve_workspace_file_path(
    db_path: &str,
    workspace_id: &str,
    repo_relative_path: &str,
) -> Result<PathBuf, LifecycleError> {
    resolve_workspace_file_path_for_operation(
        db_path,
        workspace_id,
        repo_relative_path,
        "open workspace file",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::{open_db, run_migrations};
    use std::fs;

    fn temp_fixture_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lifecycle-workspace-paths-{}",
            uuid::Uuid::new_v4()
        ))
    }

    fn temp_db_path() -> String {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-workspace-paths-{}.db",
            uuid::Uuid::new_v4()
        ));
        path.to_string_lossy().into_owned()
    }

    fn seed_workspace(db_path: &str, workspace_id: &str, worktree_path: &Path, target: &str) {
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, source_ref, worktree_path, target, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                workspace_id,
                "project_1",
                "Workspace 1",
                "lifecycle/test",
                worktree_path.to_str().expect("worktree path is utf8"),
                target,
                "active"
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
        seed_workspace(&db_path, "workspace_1", &worktree_path, "local");

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
        seed_workspace(&db_path, "workspace_1", &worktree_path, "local");

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
    fn resolve_workspace_write_path_allows_new_files_inside_worktree() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let existing_dir = worktree_path.join("docs");
        let db_path = temp_db_path();

        fs::create_dir_all(&existing_dir).expect("create existing dir");
        seed_workspace(&db_path, "workspace_1", &worktree_path, "local");

        let resolved = resolve_workspace_write_path_for_operation(
            &db_path,
            "workspace_1",
            "docs/new-file.md",
            "write workspace file",
        )
        .expect("resolve write target");

        assert_eq!(
            resolved,
            std::fs::canonicalize(&existing_dir)
                .expect("canonicalize existing dir")
                .join("new-file.md")
        );

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn resolve_workspace_write_path_rejects_symlink_escapes() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let docs_path = worktree_path.join("docs");
        let outside_path = root.join("outside");
        let db_path = temp_db_path();

        fs::create_dir_all(&worktree_path).expect("create worktree");
        fs::create_dir_all(&outside_path).expect("create outside dir");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_path, &docs_path).expect("create symlink");
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&outside_path, &docs_path).expect("create symlink");
        seed_workspace(&db_path, "workspace_1", &worktree_path, "local");

        let error = resolve_workspace_write_path_for_operation(
            &db_path,
            "workspace_1",
            "docs/new-file.md",
            "write workspace file",
        )
        .expect_err("reject symlink escape");

        match error {
            LifecycleError::GitOperationFailed { operation, reason } => {
                assert_eq!(operation, "write workspace file");
                assert!(reason.contains("outside workspace root"));
            }
            other => panic!("unexpected error: {other:?}"),
        }

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn require_local_worktree_accepts_docker_workspaces_with_local_checkouts() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let db_path = temp_db_path();

        fs::create_dir_all(&worktree_path).expect("create worktree");
        seed_workspace(&db_path, "workspace_1", &worktree_path, "docker");

        let resolved = require_local_worktree(&db_path, "workspace_1", "read workspace file")
            .expect("resolve docker worktree");
        assert_eq!(resolved, worktree_path.to_string_lossy());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }
}
