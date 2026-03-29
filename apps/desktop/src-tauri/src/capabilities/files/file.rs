use crate::capabilities::targets::{normalize_relative_path, resolve_sandboxed_path, resolve_sandboxed_write_path};
use crate::shared::errors::LifecycleError;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const MAX_TEXT_FILE_BYTES: usize = 1024 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileReadResult {
    pub absolute_path: String,
    pub byte_len: usize,
    pub content: Option<String>,
    pub extension: Option<String>,
    pub file_path: String,
    pub is_binary: bool,
    pub is_too_large: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct FileTreeEntry {
    pub extension: Option<String>,
    pub file_path: String,
}

fn file_extension(file_path: &Path) -> Option<String> {
    file_path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
}

fn looks_binary(bytes: &[u8]) -> bool {
    bytes.contains(&0)
}

fn build_file_read_result(
    resolved_path: &Path,
    normalized_path: PathBuf,
) -> Result<FileReadResult, LifecycleError> {
    let metadata = fs::metadata(resolved_path).map_err(|error| {
        LifecycleError::Io(format!("failed to inspect file: {error}"))
    })?;

    if !metadata.is_file() {
        return Err(LifecycleError::InvalidInput {
            field: "file_path".to_string(),
            reason: format!("path is not a regular file: {}", normalized_path.to_string_lossy()),
        });
    }

    let byte_len = usize::try_from(metadata.len()).map_err(|_| {
        LifecycleError::Io(format!("file is too large to inspect: {}", normalized_path.to_string_lossy()))
    })?;

    let extension = file_extension(&normalized_path);
    let normalized_path = normalized_path.to_string_lossy().into_owned();
    let absolute_path = resolved_path.to_string_lossy().into_owned();

    if byte_len > MAX_TEXT_FILE_BYTES {
        return Ok(FileReadResult {
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
        LifecycleError::Io(format!("failed to read file: {error}"))
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

    Ok(FileReadResult {
        absolute_path,
        byte_len,
        content,
        extension,
        file_path: normalized_path,
        is_binary,
        is_too_large: false,
    })
}

pub fn read_file(
    root_path: &str,
    file_path: &str,
) -> Result<FileReadResult, LifecycleError> {
    let normalized_path = normalize_relative_path(file_path, "read file")?;
    let resolved_path = resolve_sandboxed_path(root_path, file_path, "read file")?;
    build_file_read_result(&resolved_path, normalized_path)
}

pub fn file_exists(
    root_path: &str,
    file_path: &str,
) -> Result<bool, LifecycleError> {
    let canonical_root = std::fs::canonicalize(root_path).map_err(|error| {
        LifecycleError::InvalidInput {
            field: "file exists".to_string(),
            reason: format!("failed to resolve root path: {error}"),
        }
    })?;
    let relative = normalize_relative_path(file_path, "file exists")?;
    let candidate = canonical_root.join(&relative);

    if !candidate.exists() {
        return Ok(false);
    }

    let canonical_candidate = std::fs::canonicalize(&candidate).map_err(|error| {
        LifecycleError::InvalidInput {
            field: "file exists".to_string(),
            reason: format!("failed to resolve file: {error}"),
        }
    })?;

    if !canonical_candidate.starts_with(&canonical_root) {
        return Err(LifecycleError::InvalidInput {
            field: "file exists".to_string(),
            reason: format!("path resolves outside root: {file_path}"),
        });
    }

    Ok(true)
}

pub fn write_file(
    root_path: &str,
    file_path: &str,
    content: &str,
) -> Result<FileReadResult, LifecycleError> {
    let normalized_path = normalize_relative_path(file_path, "write file")?;
    let resolved_path = resolve_sandboxed_write_path(root_path, file_path, "write file")?;

    if let Some(parent) = resolved_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            LifecycleError::Io(format!("failed to create parent directory: {error}"))
        })?;
    }

    fs::write(&resolved_path, content).map_err(|error| {
        LifecycleError::Io(format!("failed to write file: {error}"))
    })?;

    build_file_read_result(&resolved_path, normalized_path)
}

pub fn list_files(root_path: &str) -> Result<Vec<FileTreeEntry>, LifecycleError> {
    let output = Command::new("git")
        .args([
            "-C",
            root_path,
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
        ])
        .output()
        .map_err(|error| {
            LifecycleError::Io(format!("failed to run git ls-files: {error}"))
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(LifecycleError::Io(
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
        .filter_map(|fp| {
            let normalized_path = normalize_relative_path(&fp, "list files").ok()?;
            Some(FileTreeEntry {
                extension: file_extension(&normalized_path),
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

    fn temp_fixture_root() -> PathBuf {
        std::env::temp_dir().join(format!("lifecycle-file-read-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn reads_text_files_with_normalized_paths() {
        let root = temp_fixture_root();
        let file_path = root.join("docs").join("guide.md");

        fs::create_dir_all(file_path.parent().expect("parent")).expect("create dir");
        fs::write(&file_path, "# Guide\n\nhello\n").expect("write file");

        let result = read_file(
            root.to_str().expect("utf8"),
            "./docs/guide.md",
        )
        .expect("read file");

        assert_eq!(result.file_path, "docs/guide.md");
        assert_eq!(result.extension.as_deref(), Some("md"));
        assert_eq!(result.content.as_deref(), Some("# Guide\n\nhello\n"));
        assert!(!result.is_binary);
        assert!(!result.is_too_large);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn marks_binary_files_without_inline_text_content() {
        let root = temp_fixture_root();
        let file_path = root.join("assets").join("logo.bin");

        fs::create_dir_all(file_path.parent().expect("parent")).expect("create dir");
        fs::write(&file_path, [0_u8, 159, 146, 150]).expect("write binary");

        let result = read_file(
            root.to_str().expect("utf8"),
            "assets/logo.bin",
        )
        .expect("read binary");

        assert!(result.is_binary);
        assert!(result.content.is_none());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn flags_large_files_without_loading_content() {
        let root = temp_fixture_root();
        let file_path = root.join("docs").join("large.txt");

        fs::create_dir_all(file_path.parent().expect("parent")).expect("create dir");
        fs::write(&file_path, vec![b'x'; MAX_TEXT_FILE_BYTES + 1]).expect("write large");

        let result = read_file(
            root.to_str().expect("utf8"),
            "docs/large.txt",
        )
        .expect("read large");

        assert!(result.is_too_large);
        assert!(result.content.is_none());
        assert_eq!(result.byte_len, MAX_TEXT_FILE_BYTES + 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn writes_text_files_and_returns_updated_payload() {
        let root = temp_fixture_root();
        let file_path = root.join("docs").join("guide.md");

        fs::create_dir_all(file_path.parent().expect("parent")).expect("create dir");
        fs::write(&file_path, "before\n").expect("seed");

        let result = write_file(
            root.to_str().expect("utf8"),
            "docs/guide.md",
            "# Guide\n\nupdated\n",
        )
        .expect("write file");

        assert_eq!(result.content.as_deref(), Some("# Guide\n\nupdated\n"));
        assert_eq!(fs::read_to_string(&file_path).expect("disk"), "# Guide\n\nupdated\n");

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn file_exists_reports_presence_inside_root() {
        let root = temp_fixture_root();
        let file_path = root.join("docs").join("guide.md");

        fs::create_dir_all(file_path.parent().expect("parent")).expect("create dir");
        fs::write(&file_path, "# Guide\n").expect("write file");

        assert!(file_exists(
            root.to_str().expect("utf8"),
            "docs/guide.md",
        )
        .expect("existing file"));
        assert!(!file_exists(
            root.to_str().expect("utf8"),
            "docs/missing.md",
        )
        .expect("missing file"));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn lists_tracked_and_untracked_files() {
        let root = temp_fixture_root();

        fs::create_dir_all(root.join("src")).expect("create src");
        fs::write(root.join("src/main.ts"), "console.log('hi')\n").expect("write");
        fs::write(root.join("README.md"), "# Readme\n").expect("write readme");

        Command::new("git").args(["init", "--quiet"]).current_dir(&root).output().expect("git init");
        Command::new("git").args(["add", "README.md"]).current_dir(&root).output().expect("git add");

        let result = list_files(root.to_str().expect("utf8")).expect("list files");

        assert_eq!(
            result,
            vec![
                FileTreeEntry { extension: Some("md".to_string()), file_path: "README.md".to_string() },
                FileTreeEntry { extension: Some("ts".to_string()), file_path: "src/main.ts".to_string() },
            ]
        );

        let _ = fs::remove_dir_all(root);
    }
}
