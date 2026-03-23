use super::paths::{
    normalize_repo_relative_path, require_local_worktree,
    resolve_workspace_file_path_for_operation, resolve_workspace_write_path_for_operation,
};
use crate::shared::errors::LifecycleError;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct WorkspaceFileTreeEntry {
    pub extension: Option<String>,
    pub file_path: String,
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

fn workspace_file_read_result(
    resolved_path: &Path,
    normalized_path: PathBuf,
) -> Result<WorkspaceFileReadResult, LifecycleError> {
    let metadata = fs::metadata(resolved_path).map_err(|error| {
        workspace_file_failure(
            "read workspace file",
            format!("failed to inspect file: {error}"),
        )
    })?;

    if !metadata.is_file() {
        return Err(workspace_file_failure(
            "read workspace file",
            format!(
                "path is not a regular file: {}",
                normalized_path.to_string_lossy()
            ),
        ));
    }

    let byte_len = usize::try_from(metadata.len()).map_err(|_| {
        workspace_file_failure(
            "read workspace file",
            format!(
                "file is too large to inspect: {}",
                normalized_path.to_string_lossy()
            ),
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

    let bytes = fs::read(resolved_path).map_err(|error| {
        workspace_file_failure(
            "read workspace file",
            format!("failed to read file: {error}"),
        )
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

    workspace_file_read_result(&resolved_path, normalized_path)
}

pub fn write_workspace_file(
    db_path: &str,
    workspace_id: String,
    file_path: String,
    content: String,
) -> Result<WorkspaceFileReadResult, LifecycleError> {
    let normalized_path = normalize_repo_relative_path(&file_path, "write workspace file")?;
    let resolved_path = resolve_workspace_write_path_for_operation(
        db_path,
        &workspace_id,
        &file_path,
        "write workspace file",
    )?;

    if let Some(parent) = resolved_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            workspace_file_failure(
                "write workspace file",
                format!("failed to create parent directory: {error}"),
            )
        })?;
    }

    fs::write(&resolved_path, content).map_err(|error| {
        workspace_file_failure(
            "write workspace file",
            format!("failed to write file: {error}"),
        )
    })?;

    workspace_file_read_result(&resolved_path, normalized_path)
}

pub fn list_workspace_files(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<WorkspaceFileTreeEntry>, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "list workspace files")?;
    let output = Command::new("git")
        .args([
            "-C",
            &worktree_path,
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()
        .map_err(|error| {
            workspace_file_failure(
                "list workspace files",
                format!("failed to run git ls-files: {error}"),
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(workspace_file_failure(
            "list workspace files",
            if stderr.is_empty() {
                "git ls-files returned a non-zero exit code".to_string()
            } else {
                format!("git ls-files failed: {stderr}")
            },
        ));
    }

    let mut entries = output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|raw| !raw.is_empty())
        .filter_map(|raw| String::from_utf8(raw.to_vec()).ok())
        .filter_map(|file_path| {
            let normalized_path =
                normalize_repo_relative_path(&file_path, "list workspace files").ok()?;
            Some(WorkspaceFileTreeEntry {
                extension: workspace_file_extension(&normalized_path),
                file_path: normalized_path.to_string_lossy().into_owned(),
            })
        })
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| left.file_path.cmp(&right.file_path));
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::{apply_test_schema, open_db};
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
        apply_test_schema(db_path);
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

    #[test]
    fn writes_workspace_text_files_and_returns_updated_payload() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let file_path = worktree_path.join("docs").join("guide.md");
        let db_path = temp_db_path();

        fs::create_dir_all(file_path.parent().expect("file parent")).expect("create file parent");
        fs::write(&file_path, "before\n").expect("seed file");
        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let result = write_workspace_file(
            &db_path,
            "workspace_1".to_string(),
            "docs/guide.md".to_string(),
            "# Guide\n\nupdated\n".to_string(),
        )
        .expect("write workspace file");

        assert_eq!(result.content.as_deref(), Some("# Guide\n\nupdated\n"));
        assert_eq!(
            fs::read_to_string(&file_path).expect("read file from disk"),
            "# Guide\n\nupdated\n"
        );

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }

    #[test]
    fn lists_tracked_and_untracked_workspace_files() {
        let root = temp_fixture_root();
        let worktree_path = root.join("worktree");
        let db_path = temp_db_path();

        fs::create_dir_all(worktree_path.join("src")).expect("create src dir");
        fs::write(worktree_path.join("src/main.ts"), "console.log('hi')\n").expect("write file");
        fs::write(worktree_path.join("README.md"), "# Readme\n").expect("write readme");

        std::process::Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(&worktree_path)
            .output()
            .expect("git init");
        std::process::Command::new("git")
            .args(["add", "README.md"])
            .current_dir(&worktree_path)
            .output()
            .expect("git add");

        seed_workspace(&db_path, "workspace_1", &worktree_path);

        let result = list_workspace_files(&db_path, "workspace_1".to_string())
            .expect("list workspace files");

        assert_eq!(
            result,
            vec![
                WorkspaceFileTreeEntry {
                    extension: Some("md".to_string()),
                    file_path: "README.md".to_string(),
                },
                WorkspaceFileTreeEntry {
                    extension: Some("ts".to_string()),
                    file_path: "src/main.ts".to_string(),
                },
            ]
        );

        let _ = fs::remove_dir_all(root);
        let _ = fs::remove_file(db_path);
    }
}
