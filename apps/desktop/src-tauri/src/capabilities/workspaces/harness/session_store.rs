use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde_json::Value;

use super::parsing::json_string_at_path;
use super::types::{
    HarnessAdapter, HarnessSessionCandidate, SessionStoreConfig, SessionStoreScope,
};
use super::HARNESS_SESSION_CAPTURE_GRACE;

pub(crate) fn discover_harness_session_id(
    provider: HarnessAdapter,
    worktree_path: &str,
    launched_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let modified_after = launched_after
        .checked_sub(HARNESS_SESSION_CAPTURE_GRACE)
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let store = provider.session_store?;
    discover_session_id_from_store(&store, worktree_path, modified_after, claimed_session_ids)
}

pub(crate) fn resolve_harness_session_log_path(
    provider: HarnessAdapter,
    worktree_path: &str,
    session_id: &str,
) -> Option<PathBuf> {
    let store = provider.session_store?;
    let root = harness_home_subdir(store.root_subdir)?;

    match store.scope {
        SessionStoreScope::ExactWorkspaceDir { workspace_dir_name } => {
            let path = root
                .join(workspace_dir_name(worktree_path))
                .join(format!("{session_id}.jsonl"));
            path.exists().then_some(path)
        }
        SessionStoreScope::Recursive => {
            resolve_harness_session_log_path_from_tree(&root, &store, worktree_path, session_id)
        }
    }
}

fn resolve_harness_session_log_path_from_tree(
    root: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    session_id: &str,
) -> Option<PathBuf> {
    let mut pending = vec![root.to_path_buf()];

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };

            if file_type.is_dir() {
                pending.push(path);
                continue;
            }

            if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
                continue;
            }

            let Some((cwd, candidate_session_id)) = read_session_metadata(&path, store) else {
                continue;
            };
            if cwd == worktree_path && candidate_session_id == session_id {
                return Some(path);
            }
        }
    }

    None
}

fn harness_home_subdir(subdir: &str) -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(subdir))
}

pub(super) fn claude_project_directory_name(worktree_path: &str) -> String {
    worktree_path
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect()
}

fn discover_session_id_from_store(
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let root = harness_home_subdir(store.root_subdir)?;
    match store.scope {
        SessionStoreScope::ExactWorkspaceDir { workspace_dir_name } => {
            discover_session_id_from_directory(
                &root.join(workspace_dir_name(worktree_path)),
                store,
                worktree_path,
                modified_after,
                claimed_session_ids,
            )
        }
        SessionStoreScope::Recursive => discover_session_id_from_tree(
            &root,
            store,
            worktree_path,
            modified_after,
            claimed_session_ids,
        ),
    }
}

pub(super) fn discover_session_id_from_directory(
    dir: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    let mut candidates = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
            continue;
        }

        let Some(modified_at) = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
        else {
            continue;
        };
        if modified_at < modified_after {
            continue;
        }

        let Some((cwd, session_id)) = read_session_metadata(&path, store) else {
            continue;
        };
        if cwd != worktree_path || claimed_session_ids.contains(&session_id) {
            continue;
        }

        candidates.push(HarnessSessionCandidate {
            modified_at,
            session_id,
        });
    }

    candidates.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.session_id)
}

pub(super) fn discover_session_id_from_tree(
    root: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let mut pending = vec![root.to_path_buf()];
    let mut candidates = Vec::new();

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                pending.push(path);
                continue;
            }
            if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
                continue;
            }

            let Some(modified_at) = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
            else {
                continue;
            };
            if modified_at < modified_after {
                continue;
            }

            let Some((cwd, session_id)) = read_session_metadata(&path, store) else {
                continue;
            };
            if cwd != worktree_path || claimed_session_ids.contains(&session_id) {
                continue;
            }

            candidates.push(HarnessSessionCandidate {
                modified_at,
                session_id,
            });
        }
    }

    candidates.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.session_id)
}

fn read_session_metadata(path: &Path, store: &SessionStoreConfig) -> Option<(String, String)> {
    let file = File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(store.metadata_line_limit) {
        let Ok(line) = line else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some((type_path, expected_type)) = store.required_type {
            if json_string_at_path(&value, type_path) != Some(expected_type) {
                continue;
            }
        }

        let Some(cwd) = json_string_at_path(&value, store.cwd_path) else {
            continue;
        };
        let Some(session_id) = store
            .session_id_path
            .and_then(|path| json_string_at_path(&value, path))
            .or_else(|| {
                if store.session_id_from_file_stem {
                    path.file_stem().and_then(|stem| stem.to_str())
                } else {
                    None
                }
            })
        else {
            continue;
        };

        return Some((cwd.to_string(), session_id.to_string()));
    }

    None
}
