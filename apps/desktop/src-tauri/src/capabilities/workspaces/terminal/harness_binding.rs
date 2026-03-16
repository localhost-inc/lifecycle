use crate::shared::errors::{LifecycleError, TerminalType};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use super::super::query::TerminalRecord;
use super::launch::HarnessLaunchMode;

const HARNESS_STATE_DIR: &str = "harness-state";
const CODEX_STATE_DIR: &str = "codex";
const CODEX_SHARED_HOME_ENTRIES: &[&str] = &[
    "AGENTS.md",
    "auth.json",
    "config.toml",
    "memories",
    "rules",
    "skills",
    "version.json",
];

pub(crate) struct PreparedHarnessTerminal {
    pub(crate) harness_launch_mode: HarnessLaunchMode,
    pub(crate) harness_session_id: Option<String>,
}

pub(crate) fn prepare_harness_terminal(
    app: &AppHandle,
    terminal_id: &str,
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
    requested_harness_session_id: Option<&str>,
) -> Result<PreparedHarnessTerminal, LifecycleError> {
    if !matches!(launch_type, TerminalType::Harness) {
        return Ok(PreparedHarnessTerminal {
            harness_launch_mode: HarnessLaunchMode::New,
            harness_session_id: None,
        });
    }

    let harness_launch_mode = if requested_harness_session_id.is_some() {
        HarnessLaunchMode::Resume
    } else {
        HarnessLaunchMode::New
    };
    let harness_session_id = match (harness_provider, requested_harness_session_id) {
        (Some("claude"), None) => Some(uuid::Uuid::new_v4().to_string()),
        _ => requested_harness_session_id.map(ToString::to_string),
    };

    if matches!(
        (harness_provider, harness_launch_mode),
        (Some("codex"), HarnessLaunchMode::New)
    ) {
        ensure_codex_home(&codex_home_path(app, terminal_id)?)?;
    }

    Ok(PreparedHarnessTerminal {
        harness_launch_mode,
        harness_session_id,
    })
}

pub(crate) fn resolve_harness_launch_environment(
    app: &AppHandle,
    terminal: &TerminalRecord,
) -> Result<Vec<(String, String)>, LifecycleError> {
    if terminal.harness_provider.as_deref() != Some("codex") {
        return Ok(Vec::new());
    }

    let codex_home = resolve_codex_home_override(app, terminal)?;
    ensure_codex_home(&codex_home)?;

    Ok(vec![(
        "CODEX_HOME".to_string(),
        codex_home.to_string_lossy().to_string(),
    )])
}

pub(crate) fn resolve_bound_harness_session_store_root(
    app: &AppHandle,
    terminal: &TerminalRecord,
) -> Result<Option<PathBuf>, LifecycleError> {
    if terminal.harness_provider.as_deref() != Some("codex") {
        return Ok(None);
    }

    Ok(Some(resolve_codex_home_override(app, terminal)?.join("sessions")))
}

pub(crate) fn promote_harness_session_scope(
    app: &AppHandle,
    terminal: &TerminalRecord,
    harness_session_id: &str,
) -> Result<(), LifecycleError> {
    if terminal.harness_provider.as_deref() != Some("codex") {
        return Ok(());
    }

    let source = codex_home_path(app, &terminal.id)?;
    let target = codex_home_path(app, harness_session_id)?;
    if source == target || !source.exists() || target.exists() {
        return Ok(());
    }

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(map_filesystem_error)?;
    }
    fs::rename(&source, &target).map_err(map_filesystem_error)?;

    Ok(())
}

fn resolve_codex_home_override(
    app: &AppHandle,
    terminal: &TerminalRecord,
) -> Result<PathBuf, LifecycleError> {
    Ok(resolve_codex_home_override_with_root(
        &harness_state_root(app)?,
        terminal,
    ))
}

fn codex_home_path(app: &AppHandle, key: &str) -> Result<PathBuf, LifecycleError> {
    Ok(harness_state_root(app)?.join(CODEX_STATE_DIR).join(key))
}

fn harness_state_root(app: &AppHandle) -> Result<PathBuf, LifecycleError> {
    app.path()
        .app_data_dir()
        .map(|path| path.join(HARNESS_STATE_DIR))
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))
}

fn shared_codex_home() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".codex")))
}

fn ensure_codex_home(path: &Path) -> Result<(), LifecycleError> {
    fs::create_dir_all(path).map_err(map_filesystem_error)?;

    let Some(shared_home) = shared_codex_home() else {
        return Ok(());
    };

    for entry_name in CODEX_SHARED_HOME_ENTRIES {
        let source = shared_home.join(entry_name);
        if !source.exists() {
            continue;
        }

        let destination = path.join(entry_name);
        if destination.exists() || destination.symlink_metadata().is_ok() {
            continue;
        }

        create_symlink(&source, &destination)?;
    }

    Ok(())
}

fn create_symlink(source: &Path, destination: &Path) -> Result<(), LifecycleError> {
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(source, destination).map_err(map_filesystem_error)?;
        Ok(())
    }

    #[cfg(windows)]
    {
        let metadata = source.metadata().map_err(map_filesystem_error)?;
        if metadata.is_dir() {
            std::os::windows::fs::symlink_dir(source, destination).map_err(map_filesystem_error)?;
        } else {
            std::os::windows::fs::symlink_file(source, destination)
                .map_err(map_filesystem_error)?;
        }
        Ok(())
    }

    #[cfg(not(any(unix, windows)))]
    {
        let metadata = source.metadata().map_err(map_filesystem_error)?;
        if metadata.is_dir() {
            fs::create_dir_all(destination).map_err(map_filesystem_error)?;
        } else {
            fs::copy(source, destination).map_err(map_filesystem_error)?;
        }
        Ok(())
    }
}

fn map_filesystem_error(error: std::io::Error) -> LifecycleError {
    LifecycleError::AttachFailed(error.to_string())
}

fn resolve_codex_home_override_with_root(
    root: &Path,
    terminal: &TerminalRecord,
) -> PathBuf {
    let temporary_path = root.join(CODEX_STATE_DIR).join(&terminal.id);
    if let Some(harness_session_id) = terminal.harness_session_id.as_deref() {
        let promoted_path = root.join(CODEX_STATE_DIR).join(harness_session_id);
        if promoted_path.exists() {
            return promoted_path;
        }
        if temporary_path.exists() {
            return temporary_path;
        }
        return promoted_path;
    }
    temporary_path
}

#[cfg(test)]
mod tests {
    use super::{resolve_codex_home_override_with_root, CODEX_STATE_DIR, HARNESS_STATE_DIR};
    use crate::capabilities::workspaces::query::TerminalRecord;
    use crate::capabilities::workspaces::terminal::launch::HarnessLaunchMode;
    use std::fs;
    use std::path::{Path, PathBuf};

    fn codex_scope_root(root: &Path, key: &str) -> PathBuf {
        root.join(HARNESS_STATE_DIR).join(CODEX_STATE_DIR).join(key)
    }

    fn temp_root(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-harness-binding-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn terminal(
        terminal_id: &str,
        harness_session_id: Option<&str>,
        harness_launch_mode: HarnessLaunchMode,
    ) -> TerminalRecord {
        TerminalRecord {
            id: terminal_id.to_string(),
            workspace_id: "workspace-1".to_string(),
            launch_type: "harness".to_string(),
            harness_provider: Some("codex".to_string()),
            harness_session_id: harness_session_id.map(ToString::to_string),
            harness_launch_mode: harness_launch_mode.as_str().to_string(),
            created_by: None,
            label: "Codex · Session 1".to_string(),
            label_origin: None,
            status: "detached".to_string(),
            failure_reason: None,
            exit_code: None,
            started_at: "2026-03-15 16:00:00".to_string(),
            last_active_at: "2026-03-15 16:00:00".to_string(),
            ended_at: None,
        }
    }

    #[test]
    fn resolve_codex_home_override_uses_temporary_scope_for_new_terminals() {
        let root = temp_root("temporary");
        let terminal = terminal("terminal-1", None, HarnessLaunchMode::New);
        let temporary_scope = codex_scope_root(&root, "terminal-1");
        fs::create_dir_all(&temporary_scope).expect("create temporary scope");

        let resolved =
            resolve_codex_home_override_for_test(&root, &terminal);

        assert_eq!(resolved, temporary_scope);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolve_codex_home_override_prefers_promoted_scope_after_capture() {
        let root = temp_root("promoted");
        let terminal = terminal("terminal-1", Some("session-1"), HarnessLaunchMode::Resume);
        let promoted_scope = codex_scope_root(&root, "session-1");
        fs::create_dir_all(&promoted_scope).expect("create promoted scope");

        let resolved =
            resolve_codex_home_override_for_test(&root, &terminal);

        assert_eq!(resolved, promoted_scope);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn resolve_codex_home_override_uses_promoted_scope_key_for_resumes() {
        let root = temp_root("resume");
        let terminal = terminal("terminal-1", Some("session-1"), HarnessLaunchMode::Resume);
        let promoted_scope = codex_scope_root(&root, "session-1");

        let resolved =
            resolve_codex_home_override_for_test(&root, &terminal);

        assert_eq!(resolved, promoted_scope);
        let _ = fs::remove_dir_all(root);
    }

    fn resolve_codex_home_override_for_test(
        root: &Path,
        terminal: &TerminalRecord,
    ) -> PathBuf {
        resolve_codex_home_override_with_root(&root.join(HARNESS_STATE_DIR), terminal)
    }
}
