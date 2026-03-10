use crate::shared::errors::LifecycleError;
use std::path::{Path, PathBuf};

pub const DEFAULT_LIFECYCLE_ROOT: &str = "~/.lifecycle";

pub fn expand_home_path(path: &str, home: Option<&str>) -> Result<PathBuf, LifecycleError> {
    if path == "~" {
        let home = home
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                LifecycleError::Io("HOME environment variable is not set".to_string())
            })?;
        return Ok(PathBuf::from(home));
    }

    if let Some(rest) = path.strip_prefix("~/") {
        let home = home
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                LifecycleError::Io("HOME environment variable is not set".to_string())
            })?;
        return Ok(Path::new(home).join(rest));
    }

    Ok(PathBuf::from(path))
}

pub fn resolve_lifecycle_root() -> Result<PathBuf, LifecycleError> {
    let lifecycle_root = std::env::var("LIFECYCLE_ROOT").ok();
    let home = std::env::var("HOME").ok();
    resolve_lifecycle_root_from_env(lifecycle_root.as_deref(), home.as_deref())
}

pub fn resolve_lifecycle_root_from_env(
    lifecycle_root: Option<&str>,
    home: Option<&str>,
) -> Result<PathBuf, LifecycleError> {
    if let Some(root) = lifecycle_root
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let expanded = expand_home_path(root, home)?;
        if expanded.is_absolute() {
            return Ok(expanded);
        }
        return Err(LifecycleError::Io(
            "LIFECYCLE_ROOT must be an absolute path or start with ~/".to_string(),
        ));
    }

    expand_home_path(DEFAULT_LIFECYCLE_ROOT, home)
}

pub fn worktree_root_for_lifecycle_root(lifecycle_root_dir: &Path) -> PathBuf {
    lifecycle_root_dir.join("worktrees")
}

pub fn resolve_default_worktree_root() -> Result<PathBuf, LifecycleError> {
    Ok(worktree_root_for_lifecycle_root(&resolve_lifecycle_root()?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_lifecycle_root_prefers_environment_override() {
        let path =
            resolve_lifecycle_root_from_env(Some("/tmp/lifecycle-root"), Some("/Users/kyle"))
                .expect("lifecycle root");

        assert_eq!(path, PathBuf::from("/tmp/lifecycle-root"));
    }

    #[test]
    fn resolve_lifecycle_root_defaults_to_home_directory() {
        let path =
            resolve_lifecycle_root_from_env(None, Some("/Users/kyle")).expect("lifecycle root");

        assert_eq!(path, PathBuf::from("/Users/kyle/.lifecycle"));
    }

    #[test]
    fn resolve_lifecycle_root_expands_tilde_override() {
        let path = resolve_lifecycle_root_from_env(Some("~/custom-lifecycle"), Some("/Users/kyle"))
            .expect("lifecycle root");

        assert_eq!(path, PathBuf::from("/Users/kyle/custom-lifecycle"));
    }

    #[test]
    fn worktree_root_derives_from_lifecycle_root() {
        let path = worktree_root_for_lifecycle_root(Path::new("/tmp/lifecycle-root"));

        assert_eq!(path, PathBuf::from("/tmp/lifecycle-root/worktrees"));
    }
}
