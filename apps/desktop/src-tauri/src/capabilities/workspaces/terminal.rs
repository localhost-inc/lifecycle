use crate::platform::db::{open_db, DbPath};
use crate::platform::native_terminal::{
    self, NativeTerminalColorScheme, NativeTerminalFrame,
};
use crate::platform::runtime::terminal::{
    TerminalExitOutcome, TerminalStreamChunk, TerminalSupervisor,
};
use crate::shared::errors::{
    LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType, WorkspaceStatus,
};
use crate::TerminalSupervisorMap;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::CommandBuilder;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State, WebviewWindow};

use super::query::TerminalRow;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalAttachResult {
    pub terminal: TerminalRow,
    pub replay_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct TerminalCreatedEvent {
    workspace_id: String,
    terminal: TerminalRow,
}

#[derive(Debug, Clone, Serialize)]
struct TerminalStatusEvent {
    terminal_id: String,
    workspace_id: String,
    status: String,
    failure_reason: Option<String>,
    exit_code: Option<i64>,
    ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTerminalAttachment {
    pub absolute_path: String,
    pub file_name: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTerminalCapabilities {
    pub available: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTerminalTheme {
    pub background: String,
    pub cursor_color: String,
    pub foreground: String,
    pub palette: Vec<String>,
    pub selection_background: String,
    pub selection_foreground: String,
}

pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
    cols: u16,
    rows: u16,
) -> Result<TerminalAttachResult, LifecycleError> {
    let db = db_path.0.clone();
    let workspace = load_workspace_runtime(&db, &workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_access".to_string(),
        });
    }

    let launch_type = TerminalType::from_str(&launch_type)?;
    let label = next_terminal_label(
        &db,
        &workspace_id,
        &launch_type,
        harness_provider.as_deref(),
    )?;
    let terminal_id = uuid::Uuid::new_v4().to_string();
    let launch = resolve_terminal_launch(
        &launch_type,
        harness_provider.as_deref(),
        harness_session_id.as_deref(),
    )?;

    if native_terminal::is_available() {
        let terminal = insert_terminal_row(
            &db,
            &terminal_id,
            &workspace_id,
            &launch_type,
            harness_provider.as_deref(),
            harness_session_id.as_deref(),
            &label,
            TerminalStatus::Detached,
        )?;
        emit_terminal_created(&app, &terminal);
        return Ok(TerminalAttachResult {
            replay_cursor: None,
            terminal,
        });
    }

    let mut command = build_command(&launch, &workspace.worktree_path);
    command.cwd(&workspace.worktree_path);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");

    let app_for_exit = app.clone();
    let db_for_exit = db.clone();
    let terminal_id_for_exit = terminal_id.clone();
    let workspace_id_for_exit = workspace_id.clone();
    let supervisor = TerminalSupervisor::spawn(
        command,
        cols,
        rows,
        launch.treat_nonzero_as_failure,
        Arc::new(move |outcome| {
            if let Err(error) = complete_terminal_exit(
                &app_for_exit,
                &db_for_exit,
                &terminal_id_for_exit,
                &workspace_id_for_exit,
                &outcome,
            ) {
                tracing::error!(
                    "failed to finalize terminal exit {}: {error}",
                    terminal_id_for_exit
                );
            }
        }),
    )?;
    let replay_cursor = supervisor.replay_cursor();

    let terminal = insert_terminal_row(
        &db,
        &terminal_id,
        &workspace_id,
        &launch_type,
        harness_provider.as_deref(),
        harness_session_id.as_deref(),
        &label,
        TerminalStatus::Detached,
    )?;

    {
        let mut terminals = terminal_supervisors.lock().await;
        terminals.insert(terminal_id.clone(), supervisor);
    }

    emit_terminal_created(&app, &terminal);

    Ok(TerminalAttachResult {
        replay_cursor,
        terminal,
    })
}

pub async fn attach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    cols: u16,
    rows: u16,
    replay_cursor: Option<String>,
    handler: Channel<TerminalStreamChunk>,
) -> Result<TerminalAttachResult, LifecycleError> {
    let db = db_path.0.clone();
    let mut terminal = load_terminal_row(&db, &terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
    let workspace = load_workspace_runtime(&db, &terminal.workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_access".to_string(),
        });
    }

    let supervisor = {
        let terminals = terminal_supervisors.lock().await;
        terminals.get(&terminal_id).cloned()
    };

    if let Some(supervisor) = supervisor {
        supervisor.resize(cols, rows)?;
        let next_replay_cursor = supervisor.attach(handler, replay_cursor.as_deref())?;
        if terminal.status != TerminalStatus::Finished.as_str()
            && terminal.status != TerminalStatus::Failed.as_str()
        {
            terminal =
                update_terminal_state(&db, &terminal_id, TerminalStatus::Active, None, None, false)?;
            emit_terminal_status(&app, &terminal);
        }

        return Ok(TerminalAttachResult {
            replay_cursor: next_replay_cursor,
            terminal,
        });
    } else if terminal.status != TerminalStatus::Finished.as_str()
        && terminal.status != TerminalStatus::Failed.as_str()
    {
        terminal = update_terminal_state(
            &db,
            &terminal_id,
            TerminalStatus::Failed,
            Some(&TerminalFailureReason::AttachFailed),
            terminal.exit_code,
            true,
        )?;
        emit_terminal_status(&app, &terminal);
        return Ok(TerminalAttachResult {
            replay_cursor: None,
            terminal,
        });
    }

    Ok(TerminalAttachResult {
        replay_cursor: None,
        terminal,
    })
}

pub async fn write_terminal(
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    data: String,
) -> Result<(), LifecycleError> {
    let db = db_path.0.clone();
    let supervisor = {
        let terminals = terminal_supervisors.lock().await;
        terminals.get(&terminal_id).cloned()
    }
    .ok_or_else(|| LifecycleError::AttachFailed("terminal session is unavailable".to_string()))?;

    supervisor.write(&data)?;
    touch_terminal(&db, &terminal_id)?;
    Ok(())
}

pub async fn save_terminal_attachment(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_name: String,
    media_type: Option<String>,
    base64_data: String,
) -> Result<SavedTerminalAttachment, LifecycleError> {
    let workspace = load_workspace_runtime(&db_path.0, &workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_attachment".to_string(),
        });
    }

    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|error| LifecycleError::AttachmentPersistenceFailed(error.to_string()))?;
    let attachment_dir = Path::new(&workspace.worktree_path)
        .join(".lifecycle")
        .join("attachments");
    std::fs::create_dir_all(&attachment_dir).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to create attachment directory: {error}"
        ))
    })?;

    let stored_file_name = build_terminal_attachment_file_name(&file_name, media_type.as_deref());
    let attachment_path = attachment_dir.join(&stored_file_name);
    std::fs::write(&attachment_path, bytes).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to persist attachment: {error}"
        ))
    })?;

    Ok(SavedTerminalAttachment {
        absolute_path: attachment_path.to_string_lossy().to_string(),
        file_name: stored_file_name.clone(),
        relative_path: format!(".lifecycle/attachments/{stored_file_name}"),
    })
}

pub fn native_terminal_capabilities() -> NativeTerminalCapabilities {
    NativeTerminalCapabilities {
        available: native_terminal::is_available(),
    }
}

fn validate_native_terminal_theme_value(
    field: &str,
    value: &str,
) -> Result<String, LifecycleError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(LifecycleError::AttachFailed(format!(
            "native terminal theme field `{field}` is empty"
        )));
    }

    Ok(trimmed.to_string())
}

fn build_native_terminal_theme_config(
    theme: &NativeTerminalTheme,
) -> Result<String, LifecycleError> {
    if theme.palette.len() != 16 {
        return Err(LifecycleError::AttachFailed(format!(
            "native terminal theme palette must contain 16 colors, received {}",
            theme.palette.len()
        )));
    }

    let background = validate_native_terminal_theme_value("background", &theme.background)?;
    let foreground = validate_native_terminal_theme_value("foreground", &theme.foreground)?;
    let cursor_color =
        validate_native_terminal_theme_value("cursorColor", &theme.cursor_color)?;
    let selection_background = validate_native_terminal_theme_value(
        "selectionBackground",
        &theme.selection_background,
    )?;
    let selection_foreground = validate_native_terminal_theme_value(
        "selectionForeground",
        &theme.selection_foreground,
    )?;

    let mut config_lines = Vec::with_capacity(theme.palette.len() + 8);
    for (index, color) in theme.palette.iter().enumerate() {
        let color = validate_native_terminal_theme_value("palette", color)?;
        config_lines.push(format!("palette = {index}={color}"));
    }
    config_lines.push(format!("background = {background}"));
    config_lines.push(format!("foreground = {foreground}"));
    config_lines.push(format!("cursor-color = {cursor_color}"));
    config_lines.push(format!("selection-background = {selection_background}"));
    config_lines.push(format!("selection-foreground = {selection_foreground}"));
    config_lines.push("background-opacity = 1".to_string());
    config_lines.push("window-padding-x = 0".to_string());
    config_lines.push("window-padding-y = 0".to_string());

    Ok(config_lines.join("\n"))
}

fn native_terminal_theme_dir() -> Result<PathBuf, LifecycleError> {
    let path = std::env::temp_dir().join("lifecycle-native-terminal-themes");
    fs::create_dir_all(&path).map_err(|error| {
        LifecycleError::AttachFailed(format!(
            "failed to create native terminal theme directory: {error}"
        ))
    })?;
    Ok(path)
}

fn write_native_terminal_theme_override(
    theme: &NativeTerminalTheme,
) -> Result<PathBuf, LifecycleError> {
    let config = build_native_terminal_theme_config(theme)?;
    let mut hasher = DefaultHasher::new();
    config.hash(&mut hasher);
    let path = native_terminal_theme_dir()?.join(format!("{:016x}.conf", hasher.finish()));
    if !path.exists() {
        fs::write(&path, config).map_err(|error| {
            LifecycleError::AttachFailed(format!(
                "failed to write native terminal theme override: {error}"
            ))
        })?;
    }

    Ok(path)
}

#[allow(clippy::too_many_arguments)]
pub async fn sync_native_terminal_surface(
    window: WebviewWindow,
    db_path: State<'_, DbPath>,
    terminal_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
    focused: bool,
    appearance: String,
    theme: NativeTerminalTheme,
    font_size: f64,
    scale_factor: f64,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ));
    }

    let db = db_path.0.clone();
    let terminal = load_terminal_row(&db, &terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
    if terminal.status == TerminalStatus::Finished.as_str()
        || terminal.status == TerminalStatus::Failed.as_str()
    {
        native_terminal::hide_surface(&terminal_id)?;
        return Ok(());
    }

    let workspace = load_workspace_runtime(&db, &terminal.workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_access".to_string(),
        });
    }

    let launch_type = TerminalType::from_str(&terminal.launch_type)?;
    let launch = resolve_terminal_launch(
        &launch_type,
        terminal.harness_provider.as_deref(),
        terminal.harness_session_id.as_deref(),
    )?;
    let theme_override_path = write_native_terminal_theme_override(&theme)?;
    let color_scheme = parse_native_terminal_color_scheme(&appearance)?;
    let command_line = native_terminal_command(&launch_type, &launch);
    let terminal_id_for_surface = terminal_id.clone();
    let theme_override_path = theme_override_path.to_string_lossy().to_string();
    let worktree_path = workspace.worktree_path.clone();
    sync_native_terminal_in_webview(&window, move |webview_view| {
        native_terminal::sync_surface(
            webview_view,
            &terminal_id_for_surface,
            &worktree_path,
            &command_line,
            NativeTerminalFrame {
                x,
                y,
                width,
                height,
            },
            visible,
            focused,
            &theme.background,
            &theme_override_path,
            font_size,
            scale_factor,
            color_scheme,
        )
    })?;

    let target_status = if visible {
        TerminalStatus::Active
    } else {
        TerminalStatus::Detached
    };
    if terminal.status != target_status.as_str() {
        let terminal = update_terminal_state(&db, &terminal_id, target_status, None, None, false)?;
        emit_terminal_status(window.app_handle(), &terminal);
    }

    Ok(())
}

pub async fn hide_native_terminal_surface(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Ok(());
    }

    let terminal_id_for_surface = terminal_id.clone();
    run_native_terminal_on_main_thread(&app, move || {
        native_terminal::hide_surface(&terminal_id_for_surface)
    })?;
    let db = db_path.0.clone();
    let Some(terminal) = load_terminal_row(&db, &terminal_id)? else {
        return Ok(());
    };
    if terminal.status == TerminalStatus::Active.as_str() {
        let terminal =
            update_terminal_state(&db, &terminal_id, TerminalStatus::Detached, None, None, false)?;
        emit_terminal_status(&app, &terminal);
    }

    Ok(())
}

pub async fn resize_terminal(
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), LifecycleError> {
    let supervisor = {
        let terminals = terminal_supervisors.lock().await;
        terminals.get(&terminal_id).cloned()
    }
    .ok_or_else(|| LifecycleError::AttachFailed("terminal session is unavailable".to_string()))?;

    supervisor.resize(cols, rows)?;
    Ok(())
}

pub async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    if native_terminal::is_available() {
        return hide_native_terminal_surface(app, db_path, terminal_id).await;
    }

    let db = db_path.0.clone();
    let terminal = load_terminal_row(&db, &terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
    if terminal.status == TerminalStatus::Finished.as_str()
        || terminal.status == TerminalStatus::Failed.as_str()
    {
        return Ok(());
    }

    let supervisor = {
        let terminals = terminal_supervisors.lock().await;
        terminals.get(&terminal_id).cloned()
    };
    if let Some(supervisor) = supervisor {
        supervisor.detach();
    }

    let terminal = update_terminal_state(
        &db,
        &terminal_id,
        TerminalStatus::Detached,
        None,
        None,
        false,
    )?;
    emit_terminal_status(&app, &terminal);
    Ok(())
}

pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    if native_terminal::is_available() {
        let terminal_id_for_surface = terminal_id.clone();
        run_native_terminal_on_main_thread(&app, move || {
            native_terminal::destroy_surface(&terminal_id_for_surface)
        })?;
        let db = db_path.0.clone();
        if let Some(terminal) = load_terminal_row(&db, &terminal_id)? {
            if terminal.status != TerminalStatus::Finished.as_str()
                && terminal.status != TerminalStatus::Failed.as_str()
            {
                let terminal = update_terminal_state(
                    &db,
                    &terminal_id,
                    TerminalStatus::Finished,
                    None,
                    Some(130),
                    true,
                )?;
                emit_terminal_status(&app, &terminal);
            }
        }

        return Ok(());
    }

    let supervisor = {
        let terminals = terminal_supervisors.lock().await;
        terminals.get(&terminal_id).cloned()
    };

    if let Some(supervisor) = supervisor {
        supervisor.kill()?;
    }

    Ok(())
}

fn complete_terminal_exit(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    outcome: &TerminalExitOutcome,
) -> Result<(), LifecycleError> {
    let terminal = update_terminal_state(
        db_path,
        terminal_id,
        outcome.status.clone(),
        outcome.failure_reason.as_ref(),
        outcome.exit_code,
        true,
    )?;

    emit_terminal_status(app, &terminal);
    tracing::debug!(
        "terminal {} in workspace {} exited",
        terminal_id,
        workspace_id
    );
    Ok(())
}

fn build_command(launch: &TerminalLaunchSpec, worktree_path: &str) -> CommandBuilder {
    let mut command = CommandBuilder::new(&launch.program);
    if !launch.args.is_empty() {
        command.args(launch.args.iter().map(String::as_str));
    }
    command.cwd(worktree_path);
    command
}

fn shell_command_line(launch: &TerminalLaunchSpec) -> String {
    let mut parts = Vec::with_capacity(1 + launch.args.len());
    parts.push(shell_quote(&launch.program));
    parts.extend(launch.args.iter().map(|arg| shell_quote(arg)));
    parts.join(" ")
}

fn native_terminal_command(launch_type: &TerminalType, launch: &TerminalLaunchSpec) -> String {
    match launch_type {
        // Embedded Ghostty treats `command` as a shell-expanded string and
        // force-enables wait-after-command. Plain terminal tabs should use the
        // runtime's default-shell startup path instead of that command mode.
        TerminalType::Shell => String::new(),
        _ => shell_command_line(launch),
    }
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.' | ':'))
    {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn parse_native_terminal_color_scheme(
    appearance: &str,
) -> Result<NativeTerminalColorScheme, LifecycleError> {
    match appearance {
        "light" => Ok(NativeTerminalColorScheme::Light),
        "dark" => Ok(NativeTerminalColorScheme::Dark),
        other => Err(LifecycleError::AttachFailed(format!(
            "unsupported native terminal appearance: {other}"
        ))),
    }
}

fn run_native_terminal_on_main_thread<T: Send + 'static>(
    app: &AppHandle,
    task: impl FnOnce() -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(task());
    })
    .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed(
            "native terminal main-thread task did not complete".to_string(),
        )
    })?
}

#[cfg(target_os = "macos")]
fn sync_native_terminal_in_webview<T: Send + 'static>(
    window: &WebviewWindow,
    task: impl FnOnce(*mut std::ffi::c_void) -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    let (sender, receiver) = std::sync::mpsc::sync_channel(1);
    window
        .with_webview(move |webview| {
            let _ = sender.send(task(webview.inner()));
        })
        .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

    receiver.recv().map_err(|_| {
        LifecycleError::AttachFailed(
            "native terminal webview task did not complete".to_string(),
        )
    })?
}

#[cfg(not(target_os = "macos"))]
fn sync_native_terminal_in_webview<T: Send + 'static>(
    _window: &WebviewWindow,
    _task: impl FnOnce(*mut std::ffi::c_void) -> Result<T, LifecycleError> + Send + 'static,
) -> Result<T, LifecycleError> {
    Err(LifecycleError::AttachFailed(
        "native terminal webview integration is unavailable on this platform".to_string(),
    ))
}

#[derive(Debug, PartialEq, Eq)]
struct TerminalLaunchSpec {
    program: String,
    args: Vec<String>,
    treat_nonzero_as_failure: bool,
}

fn resolve_terminal_launch(
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
    harness_session_id: Option<&str>,
) -> Result<TerminalLaunchSpec, LifecycleError> {
    match (launch_type, harness_provider, harness_session_id) {
        (TerminalType::Shell, Some(_), _) => Err(LifecycleError::LocalPtySpawnFailed(
            "shell terminals do not accept harness providers".to_string(),
        )),
        (TerminalType::Shell, None, Some(_)) => Err(LifecycleError::LocalPtySpawnFailed(
            "shell terminals do not support harness session ids".to_string(),
        )),
        (TerminalType::Shell, None, None) => Ok(TerminalLaunchSpec {
            program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        }),
        (TerminalType::Harness, None, _) => Err(LifecycleError::LocalPtySpawnFailed(
            "harness terminals require a harness provider".to_string(),
        )),
        (TerminalType::Harness, Some("claude"), Some(session_id)) => Ok(TerminalLaunchSpec {
            program: "claude".to_string(),
            args: vec!["--resume".to_string(), session_id.to_string()],
            treat_nonzero_as_failure: true,
        }),
        (TerminalType::Harness, Some("claude"), None) => Ok(TerminalLaunchSpec {
            program: "claude".to_string(),
            args: Vec::new(),
            treat_nonzero_as_failure: true,
        }),
        (TerminalType::Harness, Some("codex"), Some(session_id)) => Ok(TerminalLaunchSpec {
            program: "codex".to_string(),
            args: vec!["resume".to_string(), session_id.to_string()],
            treat_nonzero_as_failure: true,
        }),
        (TerminalType::Harness, Some("codex"), None) => Ok(TerminalLaunchSpec {
            program: "codex".to_string(),
            args: Vec::new(),
            treat_nonzero_as_failure: true,
        }),
        (TerminalType::Harness, Some(other), _) => Err(LifecycleError::LocalPtySpawnFailed(
            format!("unsupported harness provider: {other}"),
        )),
        (other, _, _) => Err(LifecycleError::LocalPtySpawnFailed(format!(
            "unsupported terminal type: {}",
            other.as_str()
        ))),
    }
}

fn next_terminal_label(
    db_path: &str,
    workspace_id: &str,
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
) -> Result<String, LifecycleError> {
    let conn = open_db(db_path)?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM terminal WHERE workspace_id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let sequence = count + 1;

    let label = match (launch_type, harness_provider) {
        (TerminalType::Harness, Some("claude")) => format!("Claude · Session {sequence}"),
        (TerminalType::Harness, Some("codex")) => format!("Codex · Session {sequence}"),
        (TerminalType::Harness, Some(_)) => format!("Harness · Session {sequence}"),
        _ => format!("Terminal {sequence}"),
    };

    Ok(label)
}

fn touch_terminal(db_path: &str, terminal_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal SET last_active_at = datetime('now') WHERE id = ?1",
        params![terminal_id],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

fn build_terminal_attachment_file_name(file_name: &str, media_type: Option<&str>) -> String {
    let stem = sanitize_attachment_stem(
        Path::new(file_name)
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("pasted-image"),
    );
    let extension = infer_attachment_extension(file_name, media_type);
    let unique_id = uuid::Uuid::new_v4().simple().to_string();
    format!("{stem}-{}.{}", &unique_id[..8], extension)
}

fn sanitize_attachment_stem(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "pasted-image".to_string()
    } else {
        trimmed.to_string()
    }
}

fn infer_attachment_extension(file_name: &str, media_type: Option<&str>) -> &'static str {
    if let Some(extension) = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
    {
        return match extension.to_ascii_lowercase().as_str() {
            "avif" => "avif",
            "bmp" => "bmp",
            "gif" => "gif",
            "heic" => "heic",
            "heif" => "heif",
            "jpeg" | "jpg" => "jpg",
            "png" => "png",
            "svg" | "svgz" => "svg",
            "tif" | "tiff" => "tiff",
            "webp" => "webp",
            _ => infer_attachment_extension_from_media_type(media_type),
        };
    }

    infer_attachment_extension_from_media_type(media_type)
}

fn infer_attachment_extension_from_media_type(media_type: Option<&str>) -> &'static str {
    match media_type.map(str::trim).unwrap_or_default() {
        "image/avif" => "avif",
        "image/bmp" => "bmp",
        "image/gif" => "gif",
        "image/heic" => "heic",
        "image/heif" => "heif",
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/svg+xml" => "svg",
        "image/tiff" => "tiff",
        "image/webp" => "webp",
        _ => "png",
    }
}

fn insert_terminal_row(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
    harness_session_id: Option<&str>,
    label: &str,
    status: TerminalStatus,
) -> Result<TerminalRow, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "INSERT INTO terminal (id, workspace_id, launch_type, harness_provider, harness_session_id, label, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            terminal_id,
            workspace_id,
            launch_type.as_str(),
            harness_provider,
            harness_session_id,
            label,
            status.as_str()
        ],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    load_terminal_row(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::Database("terminal insert did not persist".to_string()))
}

pub(crate) fn update_terminal_state(
    db_path: &str,
    terminal_id: &str,
    status: TerminalStatus,
    failure_reason: Option<&TerminalFailureReason>,
    exit_code: Option<i64>,
    ended: bool,
) -> Result<TerminalRow, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET status = ?1,
             failure_reason = ?2,
             exit_code = ?3,
             ended_at = CASE WHEN ?4 THEN datetime('now') ELSE ended_at END,
             last_active_at = datetime('now')
         WHERE id = ?5",
        params![
            status.as_str(),
            failure_reason.map(|reason| reason.as_str()),
            exit_code,
            ended,
            terminal_id
        ],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    load_terminal_row(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
}

pub(crate) fn load_terminal_row(
    db_path: &str,
    terminal_id: &str,
) -> Result<Option<TerminalRow>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, created_by, label, status, failure_reason, exit_code, started_at, last_active_at, ended_at
             FROM terminal
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let row = stmt.query_row(params![terminal_id], |row| {
        Ok(TerminalRow {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            launch_type: row.get(2)?,
            harness_provider: row.get(3)?,
            harness_session_id: row.get(4)?,
            created_by: row.get(5)?,
            label: row.get(6)?,
            status: row.get(7)?,
            failure_reason: row.get(8)?,
            exit_code: row.get(9)?,
            started_at: row.get(10)?,
            last_active_at: row.get(11)?,
            ended_at: row.get(12)?,
        })
    });

    match row {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

struct WorkspaceRuntime {
    status: WorkspaceStatus,
    worktree_path: String,
}

fn workspace_has_interactive_terminal_context(workspace: &WorkspaceRuntime) -> bool {
    !matches!(
        workspace.status,
        WorkspaceStatus::Creating | WorkspaceStatus::Destroying
    )
}

fn load_workspace_runtime(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceRuntime, LifecycleError> {
    let conn = open_db(db_path)?;
    let (status, worktree_path): (String, Option<String>) = conn
        .query_row(
            "SELECT status, worktree_path FROM workspace WHERE id = ?1 LIMIT 1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(e.to_string()),
        })?;

    Ok(WorkspaceRuntime {
        status: WorkspaceStatus::from_str(&status)?,
        worktree_path: worktree_path.ok_or_else(|| {
            LifecycleError::Database("workspace is missing worktree_path".to_string())
        })?,
    })
}

fn emit_terminal_created(app: &AppHandle, terminal: &TerminalRow) {
    let _ = app.emit(
        "terminal:created",
        TerminalCreatedEvent {
            workspace_id: terminal.workspace_id.clone(),
            terminal: terminal.clone(),
        },
    );
}

pub(super) fn emit_terminal_status(app: &AppHandle, terminal: &TerminalRow) {
    let _ = app.emit(
        "terminal:status-changed",
        TerminalStatusEvent {
            terminal_id: terminal.id.clone(),
            workspace_id: terminal.workspace_id.clone(),
            status: terminal.status.clone(),
            failure_reason: terminal.failure_reason.clone(),
            exit_code: terminal.exit_code,
            ended_at: terminal.ended_at.clone(),
        },
    );
}

pub(crate) fn complete_native_terminal_exit(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    exit_code: i64,
) -> Result<(), LifecycleError> {
    let Some(terminal) = load_terminal_row(db_path, terminal_id)? else {
        return Ok(());
    };

    if terminal.status == TerminalStatus::Finished.as_str()
        || terminal.status == TerminalStatus::Failed.as_str()
    {
        return Ok(());
    }

    let launch_type = TerminalType::from_str(&terminal.launch_type)?;
    let launch = resolve_terminal_launch(
        &launch_type,
        terminal.harness_provider.as_deref(),
        terminal.harness_session_id.as_deref(),
    )?;
    let (status, failure_reason) = if exit_code == 0 {
        (TerminalStatus::Finished, None)
    } else if launch.treat_nonzero_as_failure {
        (
            TerminalStatus::Failed,
            Some(TerminalFailureReason::HarnessProcessExitNonzero),
        )
    } else {
        (TerminalStatus::Finished, None)
    };

    let terminal = update_terminal_state(
        db_path,
        terminal_id,
        status,
        failure_reason.as_ref(),
        Some(exit_code),
        true,
    )?;
    emit_terminal_status(app, &terminal);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_terminal_launch_rejects_unsupported_harness() {
        let error = resolve_terminal_launch(&TerminalType::Harness, Some("unsupported"), None)
            .expect_err("must fail");
        match error {
            LifecycleError::LocalPtySpawnFailed(message) => {
                assert!(message.contains("unsupported harness"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn resolve_terminal_launch_supports_documented_resume_flags() {
        let claude =
            resolve_terminal_launch(&TerminalType::Harness, Some("claude"), Some("session-123"))
                .expect("claude resume launch");
        assert_eq!(claude.program, "claude");
        assert_eq!(claude.args, vec!["--resume", "session-123"]);

        let codex =
            resolve_terminal_launch(&TerminalType::Harness, Some("codex"), Some("session-456"))
                .expect("codex resume");
        assert_eq!(codex.program, "codex");
        assert_eq!(codex.args, vec!["resume", "session-456"]);
    }

    #[test]
    fn resolve_terminal_launch_rejects_resume_for_plain_shell() {
        let error = resolve_terminal_launch(&TerminalType::Shell, None, Some("session-123"))
            .expect_err("shell resume fails");
        match error {
            LifecycleError::LocalPtySpawnFailed(message) => {
                assert!(message.contains("do not support harness session ids"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn native_terminal_command_uses_default_shell_startup_for_shell_tabs() {
        let launch = TerminalLaunchSpec {
            program: "/bin/zsh".to_string(),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        };

        assert_eq!(native_terminal_command(&TerminalType::Shell, &launch), "");
    }

    #[test]
    fn native_terminal_command_keeps_harness_commands_quoted() {
        let launch = TerminalLaunchSpec {
            program: "claude".to_string(),
            args: vec!["--resume".to_string(), "session value".to_string()],
            treat_nonzero_as_failure: true,
        };

        assert_eq!(
            native_terminal_command(&TerminalType::Harness, &launch),
            "claude --resume 'session value'"
        );
    }

    #[test]
    fn interactive_terminal_context_requires_worktree_lifecycle_to_exist() {
        let interactive_statuses = [
            WorkspaceStatus::Starting,
            WorkspaceStatus::Ready,
            WorkspaceStatus::Resetting,
            WorkspaceStatus::Sleeping,
            WorkspaceStatus::Failed,
        ];

        for status in interactive_statuses {
            assert!(workspace_has_interactive_terminal_context(
                &WorkspaceRuntime {
                    status,
                    worktree_path: "/tmp/worktree".to_string(),
                }
            ));
        }

        assert!(!workspace_has_interactive_terminal_context(
            &WorkspaceRuntime {
                status: WorkspaceStatus::Creating,
                worktree_path: "/tmp/worktree".to_string(),
            }
        ));
        assert!(!workspace_has_interactive_terminal_context(
            &WorkspaceRuntime {
                status: WorkspaceStatus::Destroying,
                worktree_path: "/tmp/worktree".to_string(),
            }
        ));
    }

    #[test]
    fn build_terminal_attachment_file_name_sanitizes_the_stem() {
        let file_name = build_terminal_attachment_file_name(
            "Screenshot 2026-03-06 11.22.33.PNG",
            Some("image/png"),
        );

        assert!(file_name.starts_with("screenshot-2026-03-06-11-22-33-"));
        assert!(file_name.ends_with(".png"));
    }

    #[test]
    fn build_terminal_attachment_file_name_infers_extension_from_media_type() {
        let file_name = build_terminal_attachment_file_name("clipboard-image", Some("image/webp"));

        assert!(file_name.starts_with("clipboard-image-"));
        assert!(file_name.ends_with(".webp"));
    }

    #[test]
    fn build_native_terminal_theme_config_serializes_ghostty_theme_fields() {
        let config = build_native_terminal_theme_config(&NativeTerminalTheme {
            background: "#1a1a1a".to_string(),
            cursor_color: "#539bf5".to_string(),
            foreground: "#adbac7".to_string(),
            palette: vec![
                "#545d68".to_string(),
                "#f47067".to_string(),
                "#57ab5a".to_string(),
                "#c69026".to_string(),
                "#539bf5".to_string(),
                "#b083f0".to_string(),
                "#39c5cf".to_string(),
                "#909dab".to_string(),
                "#636e7b".to_string(),
                "#ff938a".to_string(),
                "#6bc46d".to_string(),
                "#daaa3f".to_string(),
                "#6cb6ff".to_string(),
                "#dcbdfb".to_string(),
                "#56d4dd".to_string(),
                "#cdd9e5".to_string(),
            ],
            selection_background: "#444c56".to_string(),
            selection_foreground: "#adbac7".to_string(),
        })
        .expect("native theme config");

        assert!(config.contains("palette = 0=#545d68"));
        assert!(config.contains("palette = 15=#cdd9e5"));
        assert!(config.contains("background = #1a1a1a"));
        assert!(config.contains("foreground = #adbac7"));
        assert!(config.contains("cursor-color = #539bf5"));
        assert!(config.contains("selection-background = #444c56"));
        assert!(config.contains("selection-foreground = #adbac7"));
        assert!(config.contains("window-padding-x = 0"));
        assert!(config.contains("window-padding-y = 0"));
    }

    #[test]
    fn build_native_terminal_theme_config_rejects_incomplete_palettes() {
        let error = build_native_terminal_theme_config(&NativeTerminalTheme {
            background: "#09090b".to_string(),
            cursor_color: "#93c5fd".to_string(),
            foreground: "#fafaf9".to_string(),
            palette: vec!["#27272a".to_string(); 15],
            selection_background: "#27272a".to_string(),
            selection_foreground: "#fafaf9".to_string(),
        })
        .expect_err("palette length must fail");

        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("palette must contain 16 colors"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
