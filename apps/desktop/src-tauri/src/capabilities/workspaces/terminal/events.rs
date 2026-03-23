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
