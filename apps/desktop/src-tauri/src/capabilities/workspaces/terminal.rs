use crate::platform::db::{open_db, DbPath};
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
use serde::Serialize;
use std::path::Path;
use std::sync::Arc;
use tauri::{ipc::Channel, AppHandle, Emitter, State};

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
        replay_cursor: None,
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
        supervisor.attach(handler)?;
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

    if terminal.status != TerminalStatus::Finished.as_str()
        && terminal.status != TerminalStatus::Failed.as_str()
    {
        terminal =
            update_terminal_state(&db, &terminal_id, TerminalStatus::Active, None, None, false)?;
        emit_terminal_status(&app, &terminal);
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
    terminal_supervisors: State<'_, TerminalSupervisorMap>,
    terminal_id: String,
) -> Result<(), LifecycleError> {
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

fn update_terminal_state(
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

fn load_terminal_row(
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
}
