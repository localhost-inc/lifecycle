use crate::shared::errors::LifecycleError;
use std::path::{Component, Path, PathBuf};

fn path_failure(operation: &str, reason: impl Into<String>) -> LifecycleError {
    LifecycleError::InvalidInput {
        field: operation.to_string(),
        reason: reason.into(),
    }
}

pub(crate) fn normalize_relative_path(
    relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err(path_failure(operation, "relative path cannot be empty"));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(path_failure(
            operation,
            format!("path must be relative: {trimmed}"),
        ));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::Normal(segment) => normalized.push(segment),
            Component::ParentDir => {
                if !normalized.pop() {
                    return Err(path_failure(
                        operation,
                        format!("path escapes root: {trimmed}"),
                    ));
                }
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(path_failure(
                    operation,
                    format!("path must be relative: {trimmed}"),
                ));
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(path_failure(
            operation,
            "relative path cannot resolve to root",
        ));
    }

    Ok(normalized)
}

pub(crate) fn resolve_sandboxed_path(
    root_path: &str,
    relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let canonical_root = std::fs::canonicalize(root_path).map_err(|error| {
        path_failure(operation, format!("failed to resolve root path: {error}"))
    })?;
    let relative = normalize_relative_path(relative_path, operation)?;
    let candidate = canonical_root.join(relative);
    let canonical = std::fs::canonicalize(&candidate).map_err(|error| {
        path_failure(operation, format!("failed to resolve file: {error}"))
    })?;

    if !canonical.starts_with(&canonical_root) {
        return Err(path_failure(
            operation,
            format!("path resolves outside root: {relative_path}"),
        ));
    }

    Ok(canonical)
}

pub(crate) fn resolve_sandboxed_write_path(
    root_path: &str,
    relative_path: &str,
    operation: &str,
) -> Result<PathBuf, LifecycleError> {
    let canonical_root = std::fs::canonicalize(root_path).map_err(|error| {
        path_failure(operation, format!("failed to resolve root path: {error}"))
    })?;
    let relative = normalize_relative_path(relative_path, operation)?;
    let candidate = canonical_root.join(&relative);

    let existing_scope = if candidate.exists() {
        candidate.clone()
    } else {
        candidate
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| canonical_root.clone())
    };

    let canonical_scope = std::fs::canonicalize(&existing_scope).map_err(|error| {
        path_failure(operation, format!("failed to resolve scope: {error}"))
    })?;

    if !canonical_scope.starts_with(&canonical_root) {
        return Err(path_failure(
            operation,
            format!("path resolves outside root: {relative_path}"),
        ));
    }

    Ok(candidate)
}
