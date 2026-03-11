use super::paths::{normalize_repo_relative_path, resolve_workspace_file_path_for_operation};
use crate::shared::errors::LifecycleError;
use serde::Serialize;
use std::fs;
use std::path::Path;

const MAX_WORKSPACE_TEXT_FILE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceFileReadResult {
    pub absolute_path: String,
    pub byte_len: usize,
    pub content: Option<String>,
    pub extension: Option<String>,
    pub file_path: String,
    pub is_binary: bool,
    pub is_too_large: bool,
}

fn workspace_file_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: reason.into(),
    }
}

fn workspace_file_extension(file_path: &Path) -> Option<String> {
    file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

pub fn read_workspace_file(
    db_path: &str,
    workspace_id: String,
    file_path: String,
) -> Result<WorkspaceFileReadResult, LifecycleError> {
    let normalized_path = normalize_repo_relative_path(&file_path, "read workspace file")?;
    let resolved_path = resolve_workspace_file_path_for_operation(
        db_path,
        &workspace_id,
        &file_path,
        "read workspace file",
    )?;

    let metadata = fs::metadata(&resolved_path).map_err(|error| {
        workspace_file_failure("read workspace file", format!("failed to inspect file: {error}"))
    })?;

    if !metadata.is_file() {
        return Err(workspace_file_failure(
            "read workspace file",
            format!("path is not a regular file: {}", normalized_path.to_string_lossy()),
        ));
    }

    let byte_len = usize::try_from(metadata.len()).map_err(|_| {
        workspace_file_failure(
            "read workspace file",
            format!("file is too large to inspect: {}", normalized_path.to_string_lossy()),
        )
    })?;

    let extension = workspace_file_extension(&normalized_path);
    let normalized_path = normalized_path.to_string_lossy().into_owned();
    let absolute_path = resolved_path.to_string_lossy().into_owned();

    if byte_len > MAX_WORKSPACE_TEXT_FILE_BYTES {
        return Ok(WorkspaceFileReadResult {
            absolute_path,
            byte_len,
            content: None,
            extension,
            file_path: normalized_path,
            is_binary: false,
            is_too_large: true,
        });
    }

    let bytes = fs::read(&resolved_path).map_err(|error| {
        workspace_file_failure("read workspace file", format!("failed to read file: {error}"))
    })?;
    let is_binary = looks_binary(&bytes);

    let content = if is_binary {
        None
    } else {
        Some(
            String::from_utf8(bytes.clone())
                .unwrap_or_else(|_| String::from_utf8_lossy(&bytes).into_owned()),
        )
    };

    Ok(WorkspaceFileReadResult {
        absolute_path,
        byte_len,
        content,
        extension,
        file_path: normalized_path,
        is_binary,
        is_too_large: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::{open_db, run_migrations};
    use std::path::{Path, PathBuf};

    fn temp_fixture_root() -> PathBuf {
        std::env::temp_dir().join(format!(
            "lifecycle-workspace-file-read-{}",
            uuid::Uuid::new_v4()
        ))
    }

    fn temp_db_path() -> String {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-workspace-file-read-{}.db",
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
                "active"
            ],
        )
        .expect("insert workspace");
    }

    #[test]
    fn reads_workspace_text_files_with_normalized_paths() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let file_path = worktree_path.join("docs").join("guide.md");
        let db_path = temp_db_path();

        fs::create_dir_all(file_path.parent().expect("file parent")).expect("create file parent");
        fs::write(&file_path, "# Guide\n\nhello\n").expect("write file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let result = read_workspace_file(
            &db_path,
            "workspace_1".to_string(),
            "./docs/guide.md".to_string(),
        )
        .expect("read workspace file");

        assert_eq!(result.file_path, "docs/guide.md");
        assert_eq!(result.extension.as_deref(), Some("md"));
        assert_eq!(result.content.as_deref(), Some("# Guide\n\nhello\n"));
        assert!(!result.is_binary);
        assert!(!result.is_too_large);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn marks_binary_files_without_inline_text_content() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let file_path = worktree_path.join("assets").join("logo.bin");
        let db_path = temp_db_path();

        fs::create_dir_all(file_path.parent().expect("file parent")).expect("create file parent");
        fs::write(&file_path, [0_u8, 159, 146, 150]).expect("write binary file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let result = read_workspace_file(
            &db_path,
            "workspace_1".to_string(),
            "assets/logo.bin".to_string(),
        )
        .expect("read binary file");

        assert!(result.is_binary);
        assert!(!result.is_too_large);
        assert!(result.content.is_none());

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn flags_large_files_without_loading_content_into_memory() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let file_path = worktree_path.join("docs").join("large.txt");
        let db_path = temp_db_path();

        fs::create_dir_all(file_path.parent().expect("file parent")).expect("create file parent");
        fs::write(&file_path, vec![b'x'; MAX_WORKSPACE_TEXT_FILE_BYTES + 1]).expect("write file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let result = read_workspace_file(
            &db_path,
            "workspace_1".to_string(),
            "docs/large.txt".to_string(),
        )
        .expect("read large file metadata");

        assert!(result.is_too_large);
        assert!(!result.is_binary);
        assert!(result.content.is_none());
        assert_eq!(result.byte_len, MAX_WORKSPACE_TEXT_FILE_BYTES + 1);

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }
}
