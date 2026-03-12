use crate::platform::db::DbPath;
use crate::platform::lifecycle_root::resolve_lifecycle_root;
use crate::platform::native_terminal::{
    self, NativeTerminalFrame, NativeTerminalSurfaceSyncRequest,
};
#[cfg(test)]
use crate::shared::errors::WorkspaceStatus;
use crate::shared::errors::{LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType};
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use super::harness::{self, HarnessAdapter};
use super::query::TerminalRecord;
use super::rename::TitleOrigin;

#[path = "terminal/attachments.rs"]
mod attachments;
#[path = "terminal/native_surface.rs"]
mod native_surface;
#[path = "terminal/persistence.rs"]
mod persistence;

use attachments::{
    build_native_terminal_attachment_paste_payload, build_terminal_attachment_file_name,
};
#[cfg(test)]
use native_surface::build_native_terminal_theme_config;
use native_surface::{parse_native_terminal_color_scheme, write_native_terminal_theme_override};
pub(crate) use persistence::load_terminal_record;
#[cfg(test)]
use persistence::WorkspaceRuntime;
use persistence::{
    insert_terminal_record, load_claimed_harness_session_ids, load_workspace_runtime,
    next_terminal_label, update_terminal_harness_session_id, update_terminal_state,
    workspace_has_interactive_terminal_context,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedTerminalAttachment {
    pub absolute_path: String,
    pub file_name: String,
    pub relative_path: String,
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

const HARNESS_SESSION_CAPTURE_POLL_INTERVAL: Duration = Duration::from_millis(500);
const HARNESS_SESSION_CAPTURE_TIMEOUT: Duration = Duration::from_secs(15);
const HARNESS_COMPLETION_WATCH_POLL_INTERVAL: Duration = Duration::from_millis(500);

static HARNESS_SESSION_CAPTURE_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static HARNESS_COMPLETION_WATCH_INFLIGHT: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn harness_session_capture_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_SESSION_CAPTURE_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

fn harness_completion_watch_registry() -> &'static Mutex<HashSet<String>> {
    HARNESS_COMPLETION_WATCH_INFLIGHT.get_or_init(|| Mutex::new(HashSet::new()))
}

pub async fn create_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_id: String,
    launch_type: String,
    harness_provider: Option<String>,
    harness_session_id: Option<String>,
) -> Result<TerminalRecord, LifecycleError> {
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
    resolve_terminal_launch(
        &launch_type,
        harness_provider.as_deref(),
        harness_session_id.as_deref(),
    )?;

    if !native_terminal::is_available() {
        return Err(LifecycleError::AttachFailed(
            "native terminal runtime is unavailable".to_string(),
        ));
    }

    let terminal = insert_terminal_record(
        &db,
        &terminal_id,
        &workspace_id,
        &launch_type,
        harness_provider.as_deref(),
        harness_session_id.as_deref(),
        &label,
        TitleOrigin::Default,
        TerminalStatus::Detached,
    )?;

    emit_terminal_created(&app, &terminal);
    Ok(terminal)
}

fn persist_terminal_attachment_bytes(
    db_path: &str,
    workspace_id: &str,
    file_name: &str,
    media_type: Option<&str>,
    bytes: &[u8],
) -> Result<SavedTerminalAttachment, LifecycleError> {
    let workspace = load_workspace_runtime(db_path, workspace_id)?;
    if !workspace_has_interactive_terminal_context(&workspace) {
        return Err(LifecycleError::InvalidStateTransition {
            from: workspace.status.as_str().to_string(),
            to: "terminal_attachment".to_string(),
        });
    }

    let attachment_dir = terminal_attachment_dir(workspace_id)?;
    std::fs::create_dir_all(&attachment_dir).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to create attachment directory: {error}"
        ))
    })?;

    let stored_file_name = build_terminal_attachment_file_name(file_name, media_type);
    let attachment_path = attachment_dir.join(&stored_file_name);
    std::fs::write(&attachment_path, bytes).map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to persist attachment: {error}"
        ))
    })?;

    Ok(SavedTerminalAttachment {
        absolute_path: attachment_path.to_string_lossy().to_string(),
        file_name: stored_file_name.clone(),
        relative_path: format!("attachments/{workspace_id}/{stored_file_name}"),
    })
}

fn terminal_attachment_dir_for_root(lifecycle_root_dir: &Path, workspace_id: &str) -> PathBuf {
    lifecycle_root_dir.join("attachments").join(workspace_id)
}

fn terminal_attachment_dir(workspace_id: &str) -> Result<PathBuf, LifecycleError> {
    let lifecycle_root_dir = resolve_lifecycle_root().map_err(|error| {
        LifecycleError::AttachmentPersistenceFailed(format!(
            "failed to resolve Lifecycle root: {error}"
        ))
    })?;
    Ok(terminal_attachment_dir_for_root(
        &lifecycle_root_dir,
        workspace_id,
    ))
}

pub async fn save_terminal_attachment(
    db_path: State<'_, DbPath>,
    workspace_id: String,
    file_name: String,
    media_type: Option<String>,
    base64_data: String,
) -> Result<SavedTerminalAttachment, LifecycleError> {
    let bytes = STANDARD
        .decode(base64_data)
        .map_err(|error| LifecycleError::AttachmentPersistenceFailed(error.to_string()))?;
    persist_terminal_attachment_bytes(
        &db_path.0,
        &workspace_id,
        &file_name,
        media_type.as_deref(),
        &bytes,
    )
}

pub fn prepare_native_terminal_attachment_paste(
    db_path: &str,
    terminal_id: &str,
    file_name: &str,
    media_type: Option<&str>,
    bytes: &[u8],
) -> Result<String, LifecycleError> {
    let terminal = load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    let attachment = persist_terminal_attachment_bytes(
        db_path,
        &terminal.workspace_id,
        file_name,
        media_type,
        bytes,
    )?;
    Ok(build_native_terminal_attachment_paste_payload(
        terminal.harness_provider.as_deref(),
        &[attachment.absolute_path],
    ))
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
    font_family: String,
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
    let terminal = load_terminal_record(&db, &terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.clone()))?;
    if terminal.status == TerminalStatus::Finished.as_str()
        || terminal.status == TerminalStatus::Failed.as_str()
    {
        native_terminal::hide_surface(&window.app_handle(), &terminal_id)?;
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
    let theme_override_path = write_native_terminal_theme_override(&theme, &font_family)?;
    let color_scheme = parse_native_terminal_color_scheme(&appearance)?;
    let command_line = native_terminal_command(&launch_type, &launch);
    let terminal_id_for_surface = terminal_id.clone();
    let theme_override_path = theme_override_path.to_string_lossy().to_string();
    let worktree_path = workspace.worktree_path.clone();
    native_terminal::sync_surface(
        &window,
        NativeTerminalSurfaceSyncRequest {
            background_color: &theme.background,
            color_scheme,
            command: &command_line,
            focused,
            font_size,
            frame: NativeTerminalFrame {
                x,
                y,
                width,
                height,
            },
            pointer_passthrough,
            scale_factor,
            terminal_id: &terminal_id_for_surface,
            theme_config_path: &theme_override_path,
            visible,
            working_directory: &worktree_path,
        },
    )?;
    maybe_schedule_harness_observers(
        window.app_handle(),
        &db,
        &terminal,
        &workspace.worktree_path,
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
    terminal: &TerminalRecord,
    worktree_path: &str,
    launched_after: SystemTime,
) {
    let Some(provider) = harness::resolve_harness_adapter(terminal.harness_provider.as_deref())
    else {
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
            launched_after,
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
                launched_after,
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
    provider: HarnessAdapter,
    session_id: &str,
    worktree_path: &str,
    launched_after: SystemTime,
) {
    if !provider.supports_session_observer() {
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
            launched_after,
        );

        let mut inflight = harness_completion_watch_registry().lock().unwrap();
        inflight.remove(&terminal_id);
    });
}

fn watch_harness_turn_completions(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    harness_session_id: &str,
    provider: HarnessAdapter,
    worktree_path: &str,
    launched_after: SystemTime,
) {
    let mut session_log_path: Option<PathBuf> = None;
    let mut emitted_prompt_keys = HashSet::new();
    let mut emitted_completion_keys = HashSet::new();
    let mut log_offset = 0_u64;
    let mut pending_line_fragment = String::new();

    loop {
        match load_terminal_record(db_path, terminal_id) {
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
            session_log_path = harness::resolve_harness_session_log_path(
                provider,
                worktree_path,
                harness_session_id,
            );
            if session_log_path.is_none() {
                thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
                continue;
            }

            log_offset = 0;
            pending_line_fragment.clear();
        }

        let Some(path) = session_log_path.as_ref() else {
            thread::sleep(HARNESS_COMPLETION_WATCH_POLL_INTERVAL);
            continue;
        };

        match read_new_harness_log_lines(path, &mut log_offset, &mut pending_line_fragment) {
            Ok(lines) => {
                for line in lines {
                    let Ok(value) = serde_json::from_str::<Value>(&line) else {
                        continue;
                    };
                    if !harness::line_is_within_launched_session(&value, launched_after) {
                        continue;
                    }

                    if let Some(prompt) = provider.parse_prompt_submission(&value, &line) {
                        if emitted_prompt_keys.insert(prompt.prompt_key.clone()) {
                            tracing::info!(
                                terminal_id,
                                workspace_id,
                                harness_provider = harness_provider.unwrap_or(provider.name),
                                harness_session_id,
                                prompt_key = %prompt.prompt_key,
                                turn_id = ?prompt.turn_id,
                                "harness prompt submitted; scheduling auto title"
                            );
                            emit_harness_prompt_submitted(
                                app,
                                terminal_id,
                                workspace_id,
                                harness_provider,
                                harness_session_id,
                                &prompt.prompt_text,
                                prompt.turn_id.as_deref(),
                            );
                            super::identity::maybe_schedule_workspace_identity_from_prompt(
                                app,
                                db_path,
                                terminal_id,
                                workspace_id,
                                &prompt.prompt_text,
                            );
                        }
                    }

                    let Some(completion) = provider.parse_turn_completion(&value, &line) else {
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

fn wait_for_harness_session_id(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    provider: HarnessAdapter,
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

        match load_terminal_record(db_path, terminal_id) {
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

        if let Some(session_id) = harness::discover_harness_session_id(
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

pub async fn hide_native_terminal_surface(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    if !native_terminal::is_available() {
        return Ok(());
    }

    let terminal_id_for_surface = terminal_id.clone();
    native_terminal::hide_surface(&app, &terminal_id_for_surface)?;
    let db = db_path.0.clone();
    let Some(terminal) = load_terminal_record(&db, &terminal_id)? else {
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

pub async fn detach_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    hide_native_terminal_surface(app, db_path, terminal_id).await
}

pub async fn kill_terminal(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
    let terminal_id_for_surface = terminal_id.clone();
    native_terminal::destroy_surface(&app, &terminal_id_for_surface)?;
    let db = db_path.0.clone();
    if let Some(terminal) = load_terminal_record(&db, &terminal_id)? {
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

    Ok(())
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
        (TerminalType::Shell, Some(_), _) => Err(LifecycleError::AttachFailed(
            "shell terminals do not accept harness providers".to_string(),
        )),
        (TerminalType::Shell, None, Some(_)) => Err(LifecycleError::AttachFailed(
            "shell terminals do not support harness session ids".to_string(),
        )),
        (TerminalType::Shell, None, None) => Ok(TerminalLaunchSpec {
            program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        }),
        (TerminalType::Harness, None, _) => Err(LifecycleError::AttachFailed(
            "harness terminals require a harness provider".to_string(),
        )),
        (TerminalType::Harness, Some(provider), harness_session_id) => {
            let provider = harness::resolve_harness_adapter(Some(provider)).ok_or_else(|| {
                LifecycleError::AttachFailed(format!("unsupported harness provider: {provider}"))
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
        (other, _, _) => Err(LifecycleError::AttachFailed(format!(
            "unsupported terminal type: {}",
            other.as_str()
        ))),
    }
}

fn emit_terminal_created(app: &AppHandle, terminal: &TerminalRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalCreated {
            workspace_id: terminal.workspace_id.clone(),
            terminal: terminal.clone(),
        },
    );
}

pub(super) fn emit_terminal_status(app: &AppHandle, terminal: &TerminalRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalStatusChanged {
            terminal_id: terminal.id.clone(),
            workspace_id: terminal.workspace_id.clone(),
            status: terminal.status.clone(),
            failure_reason: terminal.failure_reason.clone(),
            exit_code: terminal.exit_code,
            ended_at: terminal.ended_at.clone(),
        },
    );
}

fn emit_harness_prompt_submitted(
    app: &AppHandle,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    harness_session_id: &str,
    prompt_text: &str,
    turn_id: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalHarnessPromptSubmitted {
            terminal_id: terminal_id.to_string(),
            workspace_id: workspace_id.to_string(),
            prompt_text: prompt_text.to_string(),
            harness_provider: harness_provider.map(str::to_string),
            harness_session_id: Some(harness_session_id.to_string()),
            turn_id: turn_id.map(str::to_string),
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
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalHarnessTurnCompleted {
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
    let Some(terminal) = load_terminal_record(db_path, terminal_id)? else {
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
            LifecycleError::AttachFailed(message) => {
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
            LifecycleError::AttachFailed(message) => {
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
            WorkspaceStatus::Idle,
            WorkspaceStatus::Starting,
            WorkspaceStatus::Active,
            WorkspaceStatus::Stopping,
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
                status: WorkspaceStatus::Idle,
                worktree_path: String::new(),
            }
        ));
        assert!(!workspace_has_interactive_terminal_context(
            &WorkspaceRuntime {
                status: WorkspaceStatus::Stopping,
                worktree_path: String::new(),
            }
        ));
    }

    #[test]
    fn terminal_attachment_dir_uses_lifecycle_root_storage() {
        let path =
            terminal_attachment_dir_for_root(Path::new("/tmp/lifecycle-root"), "workspace-123");

        assert_eq!(
            path,
            PathBuf::from("/tmp/lifecycle-root/attachments/workspace-123")
        );
    }

    #[test]
    fn build_native_terminal_theme_config_serializes_ghostty_theme_fields() {
        let config = build_native_terminal_theme_config(
            &NativeTerminalTheme {
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
            },
            "Geist Mono",
        )
        .expect("native theme config");

        assert!(config.contains("palette = 0=#545d68"));
        assert!(config.contains("palette = 15=#cdd9e5"));
        assert!(config.contains("font-family = \"\""));
        assert!(config.contains("font-family = \"Geist Mono\""));
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
        let error = build_native_terminal_theme_config(
            &NativeTerminalTheme {
                background: "#09090b".to_string(),
                cursor_color: "#93c5fd".to_string(),
                foreground: "#fafaf9".to_string(),
                palette: vec!["#27272a".to_string(); 15],
                selection_background: "#27272a".to_string(),
                selection_foreground: "#fafaf9".to_string(),
            },
            "Geist Mono",
        )
        .expect_err("palette length must fail");

        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("palette must contain 16 colors"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn build_native_terminal_theme_config_rejects_blank_font_family() {
        let error = build_native_terminal_theme_config(
            &NativeTerminalTheme {
                background: "#09090b".to_string(),
                cursor_color: "#93c5fd".to_string(),
                foreground: "#fafaf9".to_string(),
                palette: vec!["#27272a".to_string(); 16],
                selection_background: "#27272a".to_string(),
                selection_foreground: "#fafaf9".to_string(),
            },
            "   ",
        )
        .expect_err("blank font family must fail");

        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("font family"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
