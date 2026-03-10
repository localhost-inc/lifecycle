use crate::platform::lifecycle_root::{expand_home_path, resolve_default_worktree_root};
use crate::shared::errors::LifecycleError;
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub async fn create_worktree(
    repo_path: &str,
    base_ref: &str,
    source_ref: &str,
    workspace_name: &str,
    workspace_id: &str,
    configured_worktree_root: Option<&str>,
) -> Result<String, LifecycleError> {
    let worktree_root = resolve_worktree_root(repo_path, configured_worktree_root)?;
    std::fs::create_dir_all(&worktree_root).map_err(|e| LifecycleError::Io(e.to_string()))?;
    let worktree_path = worktree_root.join(worktree_directory_name(workspace_name, workspace_id));
    let worktree_path_str = worktree_path.to_string_lossy().into_owned();

    let output = Command::new("git")
        .args(["worktree", "add", "--detach", &worktree_path_str, base_ref])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git worktree add failed: {stderr}"
        )));
    }

    let checkout_output = Command::new("git")
        .args(["-C", &worktree_path_str, "checkout", "-b", source_ref])
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !checkout_output.status.success() {
        let stderr = String::from_utf8_lossy(&checkout_output.stderr);
        let _ = remove_worktree(repo_path, &worktree_path_str).await;
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git checkout -b failed: {stderr}"
        )));
    }

    Ok(worktree_path_str)
}

pub async fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<(), LifecycleError> {
    let _ = Command::new("git")
        .args(["worktree", "remove", "--force", worktree_path])
        .current_dir(repo_path)
        .output()
        .await;

    Ok(())
}

pub async fn move_worktree(
    repo_path: &str,
    current_worktree_path: &str,
    workspace_name: &str,
    workspace_id: &str,
) -> Result<String, LifecycleError> {
    let current_path = Path::new(current_worktree_path);
    let parent = current_path
        .parent()
        .ok_or_else(|| LifecycleError::GitOperationFailed {
            operation: "move worktree".to_string(),
            reason: "worktree path has no parent directory".to_string(),
        })?;
    let next_path = parent.join(worktree_directory_name(workspace_name, workspace_id));
    let next_path_str = next_path.to_string_lossy().into_owned();

    if next_path_str == current_worktree_path {
        return Ok(next_path_str);
    }

    if next_path.exists() {
        return Err(LifecycleError::GitOperationFailed {
            operation: "move worktree".to_string(),
            reason: format!("target worktree path already exists: {next_path_str}"),
        });
    }

    let output = Command::new("git")
        .args(["worktree", "move", current_worktree_path, &next_path_str])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "move worktree".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::GitOperationFailed {
            operation: "move worktree".to_string(),
            reason: format!("git worktree move failed: {stderr}"),
        });
    }

    Ok(next_path_str)
}

pub async fn rename_workspace_branch(
    worktree_path: &str,
    current_source_ref: &str,
    next_source_ref: &str,
) -> Result<(), LifecycleError> {
    if current_source_ref == next_source_ref {
        return Ok(());
    }

    let output = Command::new("git")
        .args([
            "-C",
            worktree_path,
            "branch",
            "-m",
            current_source_ref,
            next_source_ref,
        ])
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "rename workspace branch".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::GitOperationFailed {
            operation: "rename workspace branch".to_string(),
            reason: format!("git branch -m failed: {stderr}"),
        });
    }

    Ok(())
}

pub async fn branch_has_upstream(
    worktree_path: &str,
    branch_name: &str,
) -> Result<bool, LifecycleError> {
    let ref_name = format!("refs/heads/{branch_name}");
    let output = Command::new("git")
        .args([
            "-C",
            worktree_path,
            "for-each-ref",
            "--format=%(upstream:short)",
            &ref_name,
        ])
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "inspect workspace branch upstream".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::GitOperationFailed {
            operation: "inspect workspace branch upstream".to_string(),
            reason: format!("git for-each-ref failed: {stderr}"),
        });
    }

    Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
}

pub async fn get_sha(repo_path: &str, ref_name: &str) -> Result<String, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", ref_name])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git rev-parse failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub async fn get_current_branch(repo_path: &str) -> Result<String, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git rev-parse --abbrev-ref HEAD failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn slugify_workspace_name(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            previous_dash = false;
            continue;
        }

        if matches!(ch, ' ' | '-' | '_' | '/' | '.') {
            if !slug.is_empty() && !previous_dash {
                slug.push('-');
                previous_dash = true;
            }
        }
    }

    while slug.ends_with('-') {
        slug.pop();
    }

    if slug.is_empty() {
        "workspace".to_string()
    } else {
        slug
    }
}

pub fn short_workspace_id(workspace_id: &str) -> String {
    let short: String = workspace_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(8)
        .collect();

    if short.is_empty() {
        "workspace".to_string()
    } else {
        short
    }
}

pub fn workspace_branch_name(workspace_name: &str, workspace_id: &str) -> String {
    let name_slug = slugify_workspace_name(workspace_name);
    let short_id = short_workspace_id(workspace_id);
    format!("lifecycle/{}-{}", name_slug, short_id)
}

pub fn is_managed_workspace_branch(source_ref: &str, workspace_id: &str) -> bool {
    let Some(slug) = source_ref.strip_prefix("lifecycle/") else {
        return false;
    };

    let short_id = short_workspace_id(workspace_id);
    let Some(name_slug) = slug.strip_suffix(&format!("-{short_id}")) else {
        return false;
    };

    !name_slug.is_empty()
        && name_slug
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn worktree_directory_name(workspace_name: &str, workspace_id: &str) -> String {
    format!(
        "{}--{}",
        slugify_workspace_name(workspace_name),
        short_workspace_id(workspace_id)
    )
}

fn resolve_worktree_root(
    repo_path: &str,
    configured_worktree_root: Option<&str>,
) -> Result<PathBuf, LifecycleError> {
    let expanded = if let Some(raw_root) = configured_worktree_root
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let home = std::env::var("HOME").ok();
        expand_home_path(raw_root, home.as_deref())?
    } else {
        resolve_default_worktree_root()?
    };
    if expanded.is_absolute() {
        Ok(expanded)
    } else {
        Ok(Path::new(repo_path).join(expanded))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::process::Command as StdCommand;

    fn temp_repo_path() -> std::path::PathBuf {
        std::env::temp_dir().join(format!("lifecycle-worktree-{}", uuid::Uuid::new_v4()))
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }
    }

    fn init_repo(repo_path: &Path) {
        fs::create_dir_all(repo_path).expect("create temp repo path");
        run_git(repo_path, &["init"]);
        run_git(repo_path, &["config", "user.email", "test@example.com"]);
        run_git(repo_path, &["config", "user.name", "Lifecycle Test"]);
        fs::write(repo_path.join("README.md"), "seed\n").expect("write seed file");
        run_git(repo_path, &["add", "README.md"]);
        run_git(repo_path, &["commit", "-m", "init"]);
    }

    fn git_output(repo_path: &Path, args: &[&str]) -> String {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }

        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    #[test]
    fn slugify_workspace_name_normalizes_and_trims() {
        assert_eq!(slugify_workspace_name("Sydney"), "sydney");
        assert_eq!(
            slugify_workspace_name("Sydney / Debug Build"),
            "sydney-debug-build"
        );
        assert_eq!(slugify_workspace_name("___"), "workspace");
    }

    #[tokio::test]
    async fn create_worktree_allows_checked_out_source_ref() {
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        let repo_path_str = repo_path.to_str().expect("repo path is utf8");
        let base_ref = get_current_branch(repo_path_str)
            .await
            .expect("get current branch");
        let source_ref = "lifecycle/sydney-branch";
        let configured_root =
            std::env::temp_dir().join(format!("lifecycle-worktree-root-{}", uuid::Uuid::new_v4()));
        let configured_root_str = configured_root
            .to_str()
            .expect("configured root path is utf8");

        let worktree_path = create_worktree(
            repo_path_str,
            &base_ref,
            source_ref,
            "Sydney",
            "ws-checked-out-ref",
            Some(configured_root_str),
        )
        .await
        .expect("worktree should be created from checked-out branch");

        assert!(
            Path::new(&worktree_path).exists(),
            "worktree path should exist: {worktree_path}"
        );
        assert!(
            worktree_path.starts_with(configured_root_str),
            "worktree path should use configured root: {worktree_path}"
        );

        let checked_out_branch = git_output(
            Path::new(&worktree_path),
            &["rev-parse", "--abbrev-ref", "HEAD"],
        );
        assert_eq!(checked_out_branch, source_ref);

        remove_worktree(repo_path_str, &worktree_path)
            .await
            .expect("worktree cleanup should succeed");
        fs::remove_dir_all(repo_path).expect("remove temp repo");
        fs::remove_dir_all(configured_root).expect("remove configured root");
    }

    #[tokio::test]
    async fn move_worktree_renames_the_worktree_directory() {
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        let repo_path_str = repo_path.to_str().expect("repo path is utf8");
        let base_ref = get_current_branch(repo_path_str)
            .await
            .expect("get current branch");
        let configured_root =
            std::env::temp_dir().join(format!("lifecycle-worktree-root-{}", uuid::Uuid::new_v4()));
        let configured_root_str = configured_root
            .to_str()
            .expect("configured root path is utf8");

        let initial_path = create_worktree(
            repo_path_str,
            &base_ref,
            "lifecycle/rename-source",
            "Initial Name",
            "ws-rename-target",
            Some(configured_root_str),
        )
        .await
        .expect("initial worktree should be created");

        let moved_path = move_worktree(
            repo_path_str,
            &initial_path,
            "Renamed Workspace",
            "ws-rename-target",
        )
        .await
        .expect("worktree should move");

        assert_ne!(initial_path, moved_path);
        assert!(
            !Path::new(&initial_path).exists(),
            "old path should be removed"
        );
        assert!(Path::new(&moved_path).exists(), "new path should exist");

        let worktree_list = git_output(&repo_path, &["worktree", "list"]);
        assert!(
            worktree_list.contains(&moved_path),
            "git worktree metadata should reflect new path"
        );

        remove_worktree(repo_path_str, &moved_path)
            .await
            .expect("worktree cleanup should succeed");
        fs::remove_dir_all(repo_path).expect("remove temp repo");
        fs::remove_dir_all(configured_root).expect("remove configured root");
    }

    #[test]
    fn is_managed_workspace_branch_requires_lifecycle_prefix_and_workspace_suffix() {
        assert!(is_managed_workspace_branch(
            "lifecycle/fix-auth-1234abcd",
            "1234abcd"
        ));
        assert!(!is_managed_workspace_branch("feature/fix-auth", "1234abcd"));
        assert!(!is_managed_workspace_branch(
            "lifecycle/fix-auth-9876ffff",
            "1234abcd"
        ));
    }

    #[tokio::test]
    async fn rename_workspace_branch_renames_the_checked_out_branch() {
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        let repo_path_str = repo_path.to_str().expect("repo path is utf8");
        let base_ref = get_current_branch(repo_path_str)
            .await
            .expect("get current branch");
        let configured_root =
            std::env::temp_dir().join(format!("lifecycle-worktree-root-{}", uuid::Uuid::new_v4()));
        let configured_root_str = configured_root
            .to_str()
            .expect("configured root path is utf8");
        let workspace_id = "ws-rename-branch";
        let current_source_ref = workspace_branch_name("Initial Name", workspace_id);
        let next_source_ref = workspace_branch_name("Next Name", workspace_id);

        let worktree_path = create_worktree(
            repo_path_str,
            &base_ref,
            &current_source_ref,
            "Initial Name",
            workspace_id,
            Some(configured_root_str),
        )
        .await
        .expect("create worktree");

        rename_workspace_branch(&worktree_path, &current_source_ref, &next_source_ref)
            .await
            .expect("rename branch");

        let checked_out_branch = git_output(
            Path::new(&worktree_path),
            &["rev-parse", "--abbrev-ref", "HEAD"],
        );
        assert_eq!(checked_out_branch, next_source_ref);

        remove_worktree(repo_path_str, &worktree_path)
            .await
            .expect("worktree cleanup should succeed");
        fs::remove_dir_all(repo_path).expect("remove temp repo");
        fs::remove_dir_all(configured_root).expect("remove configured root");
    }
}
