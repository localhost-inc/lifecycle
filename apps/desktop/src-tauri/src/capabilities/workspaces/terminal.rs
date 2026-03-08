use crate::platform::db::{open_db, DbPath};
use crate::platform::native_terminal::{self, NativeTerminalColorScheme, NativeTerminalFrame};
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
use serde_json::Value;
use std::collections::{hash_map::DefaultHasher, HashSet};
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{ipc::Channel, AppHandle, Emitter, Manager, State, WebviewWindow};

use super::query::TerminalRow;
use super::rename::TitleOrigin;

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
struct TerminalHarnessTurnCompletedEvent {
    terminal_id: String,
    workspace_id: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
    completion_key: String,
    turn_id: Option<String>,
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

const HARNESS_SESSION_CAPTURE_GRACE: Duration = Duration::from_secs(5);
const HARNESS_SESSION_CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HARNESS_SESSION_CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);
const HARNESS_COMPLETION_WATCH_POLL_INTERVAL: Duration = Duration::from_millis(500);

static HARNESS_SESSION_CAPTURE_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static HARNESS_COMPLETION_WATCH_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

#[derive(Clone, Copy)]
struct HarnessProviderConfig {
    name: &'static str,
    program: &'static str,
    new_session_args: &'static [&'static str],
    resume_args: fn(&str) -> Vec<String>,
    session_store: Option<SessionStoreConfig>,
}

#[derive(Debug)]
struct HarnessSessionCandidate {
    modified_at: SystemTime,
    session_id: String,
}

#[derive(Clone, Copy)]
struct SessionStoreConfig {
    root_subdir: &'static str,
    scope: SessionStoreScope,
    metadata_line_limit: usize,
    required_type: Option<(&'static [&'static str], &'static str)>,
    cwd_path: &'static [&'static str],
    session_id_path: Option<&'static [&'static str]>,
    session_id_from_file_stem: bool,
}

#[derive(Clone, Copy)]
enum SessionStoreScope {
    ExactWorkspaceDir {
        workspace_dir_name: fn(&str) -> String,
    },
    Recursive,
}

fn harness_session_capture_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_SESSION_CAPTURE_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn harness_completion_watch_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_COMPLETION_WATCH_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn claude_resume_args(session_id: &str) -> Vec<String> {
    vec!["--resume".to_string(), session_id.to_string()]
}

fn codex_resume_args(session_id: &str) -> Vec<String> {
    vec!["resume".to_string(), session_id.to_string()]
}

// Keep harness-specific launch and session-store details behind one boundary so
// adding a new provider does not leak provider conditionals across the terminal lifecycle.
fn resolve_harness_provider(provider: Option<&str>) -> Option<HarnessProviderConfig> {
    match provider {
        Some("claude") => Some(HarnessProviderConfig {
            name: "claude",
            program: "claude",
            new_session_args: &[],
            resume_args: claude_resume_args,
            session_store: Some(SessionStoreConfig {
                root_subdir: ".claude/projects",
                scope: SessionStoreScope::ExactWorkspaceDir {
                    workspace_dir_name: claude_project_directory_name,
                },
                metadata_line_limit: 10,
                required_type: None,
                cwd_path: &["cwd"],
                session_id_path: Some(&["sessionId"]),
                session_id_from_file_stem: true,
            }),
        }),
        Some("codex") => Some(HarnessProviderConfig {
            name: "codex",
            program: "codex",
            new_session_args: &[],
            resume_args: codex_resume_args,
            session_store: Some(SessionStoreConfig {
                root_subdir: ".codex/sessions",
                scope: SessionStoreScope::Recursive,
                metadata_line_limit: 1,
                required_type: Some((&["type"], "session_meta")),
                cwd_path: &["payload", "cwd"],
                session_id_path: Some(&["payload", "id"]),
                session_id_from_file_stem: false,
            }),
        }),
        _ => None,
    }
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
            &workspace.worktree_path,
            &label,
            TitleOrigin::Default,
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
    let launch_started_at = SystemTime::now();

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
        &workspace.worktree_path,
        &label,
        TitleOrigin::Default,
        TerminalStatus::Detached,
    )?;

    {
        let mut terminals = terminal_supervisors.lock().await;
        terminals.insert(terminal_id.clone(), supervisor);
    }

    emit_terminal_created(&app, &terminal);
    maybe_schedule_harness_observers(
        &app,
        &db,
        &terminal,
        terminal
            .launch_worktree_path
            .as_deref()
            .unwrap_or(&workspace.worktree_path),
        launch_started_at,
    );

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
            terminal = update_terminal_state(
                &db,
                &terminal_id,
                TerminalStatus::Active,
                None,
                None,
                false,
            )?;
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
    _app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
    data: String,
) -> Result<(), LifecycleError> {
    let db = db_path.0.clone();
    load_terminal_row(&db, &terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
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
    let cursor_color = validate_native_terminal_theme_value("cursorColor", &theme.cursor_color)?;
    let selection_background =
        validate_native_terminal_theme_value("selectionBackground", &theme.selection_background)?;
    let selection_foreground =
        validate_native_terminal_theme_value("selectionForeground", &theme.selection_foreground)?;

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
    pointer_passthrough: bool,
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
    let worktree_path = terminal
        .launch_worktree_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
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
            pointer_passthrough,
            &theme.background,
            &theme_override_path,
            font_size,
            scale_factor,
            color_scheme,
        )
    })?;
    maybe_schedule_harness_observers(
        window.app_handle(),
        &db,
        &terminal,
        terminal
            .launch_worktree_path
            .as_deref()
            .unwrap_or(&workspace.worktree_path),
        SystemTime::now(),
    );

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

fn maybe_schedule_harness_observers(
    app: &AppHandle,
    db_path: &str,
    terminal: &TerminalRow,
    worktree_path: &str,
    launched_after: SystemTime,
) {
    let Some(provider) = resolve_harness_provider(terminal.harness_provider.as_deref()) else {
        return;
    };

    if let Some(session_id) = terminal.harness_session_id.as_deref() {
        maybe_schedule_harness_completion_watch(
            app,
            db_path,
            &terminal.id,
            &terminal.workspace_id,
            terminal.harness_provider.as_deref(),
            provider,
            session_id,
            worktree_path,
        );
        return;
    }

    let registry = harness_session_capture_registry();
    {
        let mut inflight = registry.lock().unwrap();
        if !inflight.insert(terminal.id.clone()) {
            return;
        }
    }

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal.id.clone();
    let workspace_id = terminal.workspace_id.clone();
    let worktree_path = worktree_path.to_string();

    thread::spawn(move || {
        let capture_result = wait_for_harness_session_id(
            &db_path,
            &terminal_id,
            &workspace_id,
            provider,
            &worktree_path,
            launched_after,
        );

        if let Some(session_id) = capture_result {
            if let Err(error) =
                update_terminal_harness_session_id(&db_path, &terminal_id, &session_id)
            {
                tracing::warn!(
                    "failed to persist {} harness session id for terminal {}: {error}",
                    provider.name,
                    terminal_id
                );
            }

            maybe_schedule_harness_completion_watch(
                &app,
                &db_path,
                &terminal_id,
                &workspace_id,
                Some(provider.name),
                provider,
                &session_id,
                &worktree_path,
            );
        }

        let mut inflight = harness_session_capture_registry().lock().unwrap();
        inflight.remove(&terminal_id);
    });
}

fn maybe_schedule_harness_completion_watch(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    provider: HarnessProviderConfig,
    session_id: &str,
    worktree_path: &str,
) {
    if provider.session_store.is_none() {
        return;
    }

    let registry = harness_completion_watch_registry();
    {
        let mut inflight = registry.lock().unwrap();
        if !inflight.insert(terminal_id.to_string()) {
            return;
        }
    }

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal_id.to_string();
    let workspace_id = workspace_id.to_string();
    let harness_provider = harness_provider.map(str::to_string);
    let harness_session_id = session_id.to_string();
    let worktree_path = worktree_path.to_string();

    thread::spawn(move || {
        watch_harness_turn_completions(
            &app,
            &db_path,
            &terminal_id,
            &workspace_id,
            harness_provider.as_deref(),
            &harness_session_id,
            provider,
            &worktree_path,
        );

        let mut inflight = harness_completion_watch_registry().lock().unwrap();
        inflight.remove(&terminal_id);
    });
}

#[derive(Debug, Clone)]
struct HarnessTurnCompletion {
    completion_key: String,
    turn_id: Option<String>,
}

fn watch_harness_turn_completions(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    harness_session_id: &str,
    provider: HarnessProviderConfig,
    worktree_path: &str,
) {
    let mut session_log_path: Option<PathBuf> = None;
    let mut emitted_completion_keys = HashSet::new();
    let mut log_offset = 0_u64;
    let mut pending_line_fragment = String::new();

    loop {
        match load_terminal_row(db_path, terminal_id) {
            Ok(Some(terminal)) => {
                if terminal.status == TerminalStatus::Finished.as_str()
                    || terminal.status == TerminalStatus::Failed.as_str()
                {
                    return;
                }
            }
            Ok(None) => return,
            Err(error) => {
                tracing::warn!(
                    "failed to load terminal {} while watching harness completion: {error}",
                    terminal_id
                );
                return;
            }
        }

        if session_log_path.is_none() {
            session_log_path =
                resolve_harness_session_log_path(provider, worktree_path, harness_session_id);
            if let Some(path) = session_log_path.as_ref() {
                if let Ok(metadata) = fs::metadata(path) {
                    log_offset = metadata.len();
                    pending_line_fragment.clear();
                }
            } else {
                thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                continue;
            }
        }

        let Some(path) = session_log_path.as_ref() else {
            thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
            continue;
        };

        match read_new_harness_log_lines(path, &mut log_offset, &mut pending_line_fragment) {
            Ok(lines) => {
                for line in lines {
                    let Some(completion) = parse_harness_turn_completion(provider, &line) else {
                        continue;
                    };
                    if !emitted_completion_keys.insert(completion.completion_key.clone()) {
                        continue;
                    }

                    emit_harness_turn_completed(
                        app,
                        terminal_id,
                        workspace_id,
                        harness_provider,
                        harness_session_id,
                        &completion.completion_key,
                        completion.turn_id.as_deref(),
                    );
                    super::title::maybe_schedule_terminal_auto_title_from_harness_completion(
                        app,
                        db_path,
                        terminal_id,
                        workspace_id,
                        provider.name,
                        path,
                    );
                }
            }
            Err(error) => {
                tracing::debug!(
                    "failed to tail harness session log for terminal {}: {error}",
                    terminal_id
                );
                session_log_path = None;
                log_offset = 0;
                pending_line_fragment.clear();
            }
        }

        thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
    }
}

fn resolve_harness_session_log_path(
    provider: HarnessProviderConfig,
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

fn read_new_harness_log_lines(
    path: &Path,
    offset: &mut u64,
    pending_line_fragment: &mut String,
) -> Result<Vec<String>, std::io::Error> {
    let metadata = fs::metadata(path)?;
    let file_len = metadata.len();
    if file_len < *offset {
        *offset = file_len;
        pending_line_fragment.clear();
        return Ok(Vec::new());
    }

    let mut file = File::open(path)?;
    file.seek(SeekFrom::Start(*offset))?;

    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    *offset = file_len;

    if bytes.is_empty() {
        return Ok(Vec::new());
    }

    pending_line_fragment.push_str(&String::from_utf8_lossy(&bytes));

    let mut lines = Vec::new();
    while let Some(newline_index) = pending_line_fragment.find('\n') {
        let line = pending_line_fragment[..newline_index]
            .trim_end_matches('\r')
            .to_string();
        pending_line_fragment.drain(..=newline_index);
        if !line.is_empty() {
            lines.push(line);
        }
    }

    Ok(lines)
}

fn parse_harness_turn_completion(
    provider: HarnessProviderConfig,
    line: &str,
) -> Option<HarnessTurnCompletion> {
    let value = serde_json::from_str::<Value>(line).ok()?;

    match provider.name {
        "claude" => {
            if json_string_at_path(&value, &["type"]) != Some("assistant") {
                return None;
            }
            if json_string_at_path(&value, &["message", "stop_reason"]) != Some("end_turn") {
                return None;
            }

            let turn_id = json_string_at_path(&value, &["message", "id"])
                .or_else(|| json_string_at_path(&value, &["uuid"]));

            Some(HarnessTurnCompletion {
                completion_key: build_harness_completion_key(provider.name, line, &[turn_id]),
                turn_id: turn_id.map(ToString::to_string),
            })
        }
        "codex" => {
            if json_string_at_path(&value, &["type"]) != Some("event_msg") {
                return None;
            }
            if json_string_at_path(&value, &["payload", "type"]) != Some("task_complete") {
                return None;
            }

            let turn_id = json_string_at_path(&value, &["payload", "turn_id"]);
            let last_agent_message_id =
                json_string_at_path(&value, &["payload", "last_agent_message", "id"]).or_else(
                    || json_string_at_path(&value, &["payload", "last_agent_message", "uuid"]),
                );

            Some(HarnessTurnCompletion {
                completion_key: build_harness_completion_key(
                    provider.name,
                    line,
                    &[turn_id, last_agent_message_id],
                ),
                turn_id: turn_id.map(ToString::to_string),
            })
        }
        _ => None,
    }
}

fn build_harness_completion_key(
    provider_name: &str,
    line: &str,
    identifiers: &[Option<&str>],
) -> String {
    if let Some(identifier) = identifiers.iter().flatten().find(|value| !value.is_empty()) {
        return format!("{provider_name}:{identifier}");
    }

    let mut hasher = DefaultHasher::new();
    provider_name.hash(&mut hasher);
    line.hash(&mut hasher);
    format!("{provider_name}:hash:{:016x}", hasher.finish())
}

fn wait_for_harness_session_id(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    provider: HarnessProviderConfig,
    worktree_path: &str,
    launched_after: SystemTime,
) -> Option<String> {
    let deadline = SystemTime::now()
        .checked_add(HARNESS_SESSION_CAPTURE_TIMEOUT)
        .unwrap_or_else(SystemTime::now);

    loop {
        if SystemTime::now() > deadline {
            return None;
        }

        match load_terminal_row(db_path, terminal_id) {
            Ok(Some(terminal)) => {
                if let Some(session_id) = terminal.harness_session_id {
                    return Some(session_id);
                }
                if terminal.status == TerminalStatus::Finished.as_str()
                    || terminal.status == TerminalStatus::Failed.as_str()
                {
                    return None;
                }
            }
            Ok(None) | Err(_) => return None,
        }

        let claimed_session_ids =
            load_claimed_harness_session_ids(db_path, workspace_id, provider.name, terminal_id)
                .unwrap_or_default();

        if let Some(session_id) = discover_harness_session_id(
            provider,
            worktree_path,
            launched_after,
            &claimed_session_ids,
        ) {
            return Some(session_id);
        }

        thread::sleep(HARNESS_SESSION_CAPTURE_POLL_INTERVAL);
    }
}

fn discover_harness_session_id(
    provider: HarnessProviderConfig,
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

fn harness_home_subdir(subdir: &str) -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(subdir))
}

fn claude_project_directory_name(worktree_path: &str) -> String {
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

fn discover_session_id_from_directory(
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

fn discover_session_id_from_tree(
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

fn json_string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

fn load_claimed_harness_session_ids(
    db_path: &str,
    workspace_id: &str,
    harness_provider: &str,
    exclude_terminal_id: &str,
) -> Result<HashSet<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT harness_session_id
             FROM terminal
             WHERE workspace_id = ?1
               AND harness_provider = ?2
               AND id != ?3
               AND harness_session_id IS NOT NULL
               AND harness_session_id != ''",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(
            params![workspace_id, harness_provider, exclude_terminal_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut claimed = HashSet::new();
    for row in rows {
        claimed.insert(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }

    Ok(claimed)
}

fn update_terminal_harness_session_id(
    db_path: &str,
    terminal_id: &str,
    harness_session_id: &str,
) -> Result<TerminalRow, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET harness_session_id = ?1
         WHERE id = ?2
           AND (harness_session_id IS NULL OR harness_session_id = '')",
        params![harness_session_id, terminal_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    load_terminal_row(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
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
        let terminal = update_terminal_state(
            &db,
            &terminal_id,
            TerminalStatus::Detached,
            None,
            None,
            false,
        )?;
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
        LifecycleError::AttachFailed("native terminal webview task did not complete".to_string())
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
        (TerminalType::Harness, Some(provider), harness_session_id) => {
            let provider = resolve_harness_provider(Some(provider)).ok_or_else(|| {
                LifecycleError::LocalPtySpawnFailed(format!(
                    "unsupported harness provider: {provider}"
                ))
            })?;
            Ok(TerminalLaunchSpec {
                program: provider.program.to_string(),
                args: match harness_session_id {
                    Some(session_id) => (provider.resume_args)(session_id),
                    None => provider
                        .new_session_args
                        .iter()
                        .map(|value| (*value).to_string())
                        .collect(),
                },
                treat_nonzero_as_failure: true,
            })
        }
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
    launch_worktree_path: &str,
    label: &str,
    label_origin: TitleOrigin,
    status: TerminalStatus,
) -> Result<TerminalRow, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "INSERT INTO terminal (id, workspace_id, launch_type, harness_provider, harness_session_id, launch_worktree_path, label, label_origin, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            terminal_id,
            workspace_id,
            launch_type.as_str(),
            harness_provider,
            harness_session_id,
            launch_worktree_path,
            label,
            label_origin.as_str(),
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
            "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, created_by, launch_worktree_path, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
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
            launch_worktree_path: row.get(6)?,
            label: row.get(7)?,
            label_origin: row.get(8)?,
            status: row.get(9)?,
            failure_reason: row.get(10)?,
            exit_code: row.get(11)?,
            started_at: row.get(12)?,
            last_active_at: row.get(13)?,
            ended_at: row.get(14)?,
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

fn emit_harness_turn_completed(
    app: &AppHandle,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    harness_session_id: &str,
    completion_key: &str,
    turn_id: Option<&str>,
) {
    let _ = app.emit(
        "terminal:harness-turn-completed",
        TerminalHarnessTurnCompletedEvent {
            completion_key: completion_key.to_string(),
            terminal_id: terminal_id.to_string(),
            workspace_id: workspace_id.to_string(),
            harness_provider: harness_provider.map(str::to_string),
            harness_session_id: Some(harness_session_id.to_string()),
            turn_id: turn_id.map(str::to_string),
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
    use std::time::UNIX_EPOCH;

    fn create_test_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-terminal-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn write_test_file(path: &Path, contents: &str) {
        fs::write(path, contents).expect("write test file");
    }

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
    fn claude_project_directory_name_matches_cli_workspace_encoding() {
        assert_eq!(
            claude_project_directory_name(
                "/Users/kyle/.lifecycle/worktrees/frost-harbor--57f59253"
            ),
            "-Users-kyle--lifecycle-worktrees-frost-harbor--57f59253"
        );
    }

    #[test]
    fn discovers_claude_session_ids_for_the_matching_workspace() {
        let project_dir = create_test_temp_dir("claude-session");
        let matching_path = project_dir.join("session-a.jsonl");
        let ignored_path = project_dir.join("session-b.jsonl");
        let store = resolve_harness_provider(Some("claude"))
            .and_then(|provider| provider.session_store)
            .expect("claude session store");
        write_test_file(
            &matching_path,
            concat!(
                "{\"type\":\"file-history-snapshot\"}\n",
                "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-a\"}\n"
            ),
        );
        write_test_file(
            &ignored_path,
            "{\"cwd\":\"/tmp/worktree-b\",\"sessionId\":\"session-b\"}\n",
        );

        let discovered = discover_session_id_from_directory(
            &project_dir,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &HashSet::new(),
        );

        assert_eq!(discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn discovers_codex_session_ids_for_the_matching_workspace() {
        let root = create_test_temp_dir("codex-session");
        let session_dir = root.join("2026/03/07");
        let store = resolve_harness_provider(Some("codex"))
            .and_then(|provider| provider.session_store)
            .expect("codex session store");
        fs::create_dir_all(&session_dir).expect("create nested codex dir");
        let matching_path = session_dir.join("rollout-a.jsonl");
        let ignored_path = session_dir.join("rollout-b.jsonl");
        write_test_file(
            &matching_path,
            concat!(
                "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-a\",\"cwd\":\"/tmp/worktree-a\"}}\n",
                "{\"type\":\"event_msg\"}\n"
            ),
        );
        write_test_file(
            &ignored_path,
            "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-b\",\"cwd\":\"/tmp/worktree-b\"}}\n",
        );

        let discovered = discover_session_id_from_tree(
            &root,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &HashSet::new(),
        );

        assert_eq!(discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn skips_harness_session_ids_already_claimed_by_another_terminal() {
        let project_dir = create_test_temp_dir("claimed-session");
        let matching_path = project_dir.join("session-a.jsonl");
        let store = resolve_harness_provider(Some("claude"))
            .and_then(|provider| provider.session_store)
            .expect("claude session store");
        write_test_file(
            &matching_path,
            "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-a\"}\n",
        );
        let claimed = HashSet::from([String::from("session-a")]);

        let discovered = discover_session_id_from_directory(
            &project_dir,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &claimed,
        );

        assert_eq!(discovered, None);
    }

    #[test]
    fn parses_codex_task_complete_lines_as_turn_completions() {
        let provider = resolve_harness_provider(Some("codex")).expect("codex provider");

        let completion = parse_harness_turn_completion(
            provider,
            "{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"turn-123\"}}",
        )
        .expect("codex task complete");

        assert_eq!(completion.completion_key, "codex:turn-123");
        assert_eq!(completion.turn_id.as_deref(), Some("turn-123"));
    }

    #[test]
    fn parses_claude_end_turn_lines_as_turn_completions() {
        let provider = resolve_harness_provider(Some("claude")).expect("claude provider");

        let completion = parse_harness_turn_completion(
            provider,
            "{\"type\":\"assistant\",\"uuid\":\"assistant-uuid\",\"message\":{\"id\":\"msg_123\",\"stop_reason\":\"end_turn\"}}",
        )
        .expect("claude end_turn");

        assert_eq!(completion.completion_key, "claude:msg_123");
        assert_eq!(completion.turn_id.as_deref(), Some("msg_123"));
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
