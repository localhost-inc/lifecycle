use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use tauri::AppHandle;

use super::super::query::TerminalRecord;

pub(crate) fn emit_terminal_created(app: &AppHandle, terminal: &TerminalRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalCreated {
            workspace_id: terminal.workspace_id.clone(),
            terminal: terminal.clone(),
        },
    );
}

pub(crate) fn emit_terminal_status(app: &AppHandle, terminal: &TerminalRecord) {
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

pub(crate) fn emit_terminal_updated(app: &AppHandle, terminal: &TerminalRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalUpdated {
            workspace_id: terminal.workspace_id.clone(),
            terminal: terminal.clone(),
        },
    );
}

pub(crate) fn emit_harness_prompt_submitted(
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

pub(crate) fn emit_harness_turn_started(
    app: &AppHandle,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: Option<&str>,
    harness_session_id: &str,
    turn_id: Option<&str>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalHarnessTurnStarted {
            terminal_id: terminal_id.to_string(),
            workspace_id: workspace_id.to_string(),
            harness_provider: harness_provider.map(str::to_string),
            harness_session_id: Some(harness_session_id.to_string()),
            turn_id: turn_id.map(str::to_string),
        },
    );
}

pub(crate) fn emit_harness_turn_completed(
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
