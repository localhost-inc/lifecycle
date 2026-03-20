use crate::capabilities::workspaces::query::TerminalRecord;
use crate::platform::db::DbPath;
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

pub const LIFECYCLE_EVENT_NAME: &str = "lifecycle:event";

#[derive(Debug, Clone, Serialize)]
pub struct LifecycleEnvelope {
    pub id: String,
    pub occurred_at: String,
    #[serde(flatten)]
    pub event: LifecycleEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum LifecycleEvent {
    #[serde(rename = "environment.status_changed")]
    EnvironmentStatusChanged {
        workspace_id: String,
        status: String,
        failure_reason: Option<String>,
    },
    #[serde(rename = "workspace.renamed")]
    WorkspaceRenamed {
        workspace_id: String,
        name: String,
        source_ref: String,
        worktree_path: Option<String>,
    },
    #[serde(rename = "workspace.deleted")]
    WorkspaceDeleted { workspace_id: String },
    #[serde(rename = "service.status_changed")]
    ServiceStatusChanged {
        workspace_id: String,
        name: String,
        status: String,
        status_reason: Option<String>,
    },
    #[serde(rename = "terminal.created")]
    TerminalCreated {
        workspace_id: String,
        terminal: TerminalRecord,
    },
    #[serde(rename = "terminal.updated")]
    TerminalUpdated {
        workspace_id: String,
        terminal: TerminalRecord,
    },
    #[serde(rename = "terminal.status_changed")]
    TerminalStatusChanged {
        terminal_id: String,
        workspace_id: String,
        status: String,
        failure_reason: Option<String>,
        exit_code: Option<i64>,
        ended_at: Option<String>,
    },
    #[serde(rename = "terminal.renamed")]
    TerminalRenamed {
        terminal_id: String,
        workspace_id: String,
        label: String,
    },
    #[serde(rename = "terminal.harness_prompt_submitted")]
    TerminalHarnessPromptSubmitted {
        terminal_id: String,
        workspace_id: String,
        prompt_text: String,
        harness_provider: Option<String>,
        harness_session_id: Option<String>,
        turn_id: Option<String>,
    },
    #[serde(rename = "terminal.harness_turn_completed")]
    TerminalHarnessTurnCompleted {
        terminal_id: String,
        workspace_id: String,
        harness_provider: Option<String>,
        harness_session_id: Option<String>,
        completion_key: String,
        turn_id: Option<String>,
    },
    #[serde(rename = "service.process_exited")]
    ServiceProcessExited {
        workspace_id: String,
        name: String,
        exit_code: Option<i32>,
    },
    #[serde(rename = "service.log_line")]
    ServiceLogLine {
        workspace_id: String,
        name: String,
        stream: String,
        line: String,
    },
    #[serde(rename = "git.status_changed")]
    GitStatusChanged {
        workspace_id: String,
        branch: Option<String>,
        head_sha: Option<String>,
        upstream: Option<String>,
    },
    #[serde(rename = "git.head_changed")]
    GitHeadChanged {
        workspace_id: String,
        branch: Option<String>,
        head_sha: Option<String>,
        upstream: Option<String>,
        ahead: Option<u64>,
        behind: Option<u64>,
    },
    #[serde(rename = "git.log_changed")]
    GitLogChanged {
        workspace_id: String,
        branch: Option<String>,
        head_sha: Option<String>,
    },
}

impl LifecycleEvent {
    pub fn workspace_id(&self) -> &str {
        match self {
            Self::EnvironmentStatusChanged { workspace_id, .. }
            | Self::WorkspaceRenamed { workspace_id, .. }
            | Self::WorkspaceDeleted { workspace_id }
            | Self::ServiceStatusChanged { workspace_id, .. }
            | Self::ServiceProcessExited { workspace_id, .. }
            | Self::TerminalCreated { workspace_id, .. }
            | Self::TerminalUpdated { workspace_id, .. }
            | Self::TerminalStatusChanged { workspace_id, .. }
            | Self::TerminalRenamed { workspace_id, .. }
            | Self::TerminalHarnessPromptSubmitted { workspace_id, .. }
            | Self::TerminalHarnessTurnCompleted { workspace_id, .. }
            | Self::ServiceLogLine { workspace_id, .. }
            | Self::GitStatusChanged { workspace_id, .. }
            | Self::GitHeadChanged { workspace_id, .. }
            | Self::GitLogChanged { workspace_id, .. } => workspace_id,
        }
    }

    pub fn contributes_to_activity(&self) -> bool {
        match self {
            Self::ServiceLogLine { .. } => false,
            Self::TerminalUpdated { .. } => false,
            _ => true,
        }
    }
}

pub fn publish_lifecycle_event(app: &AppHandle, event: LifecycleEvent) {
    // Capture fields before moving event into envelope
    let process_exited = match &event {
        LifecycleEvent::ServiceProcessExited {
            workspace_id,
            name,
            exit_code,
        } => Some((workspace_id.clone(), name.clone(), *exit_code)),
        _ => None,
    };

    let occurred_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let envelope = LifecycleEnvelope {
        id: Uuid::new_v4().to_string(),
        occurred_at,
        event,
    };

    if let Some(workspace_controllers) = app.try_state::<WorkspaceControllerRegistryHandle>() {
        workspace_controllers
            .inner()
            .record_lifecycle_envelope(envelope.event.workspace_id(), envelope.clone());
    }

    let _ = app.emit(LIFECYCLE_EVENT_NAME, envelope);

    // React to ServiceProcessExited: transition "ready" services to "failed"
    if let Some((workspace_id, name, _exit_code)) = process_exited {
        handle_service_process_exited(app, &workspace_id, &name);
    }
}

fn handle_service_process_exited(app: &AppHandle, workspace_id: &str, name: &str) {
    let db_path = match app.try_state::<DbPath>() {
        Some(state) => state.0.clone(),
        None => return,
    };

    let Ok(conn) = crate::platform::db::open_db(&db_path) else {
        return;
    };

    let current_status: Option<String> = conn
        .query_row(
            "SELECT status FROM service WHERE environment_id = ?1 AND name = ?2",
            params![workspace_id, name],
            |row| row.get(0),
        )
        .ok();

    if current_status.as_deref() != Some("ready") {
        return;
    }

    let _ = conn.execute(
        "UPDATE service
         SET status = 'failed',
             status_reason = 'service_process_exited',
             assigned_port = NULL,
             updated_at = datetime('now')
         WHERE environment_id = ?1 AND name = ?2",
        params![workspace_id, name],
    );

    publish_lifecycle_event(
        app,
        LifecycleEvent::ServiceStatusChanged {
            workspace_id: workspace_id.to_string(),
            name: name.to_string(),
            status: "failed".to_string(),
            status_reason: Some("service_process_exited".to_string()),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::LifecycleEvent;

    #[test]
    fn terminal_updated_events_do_not_contribute_to_activity() {
        let event = LifecycleEvent::TerminalUpdated {
            workspace_id: "workspace-1".to_string(),
            terminal: crate::capabilities::workspaces::query::TerminalRecord {
                id: "terminal-1".to_string(),
                workspace_id: "workspace-1".to_string(),
                launch_type: "harness".to_string(),
                harness_provider: Some("codex".to_string()),
                harness_session_id: Some("session-1".to_string()),
                harness_launch_mode: "resume".to_string(),
                created_by: None,
                label: "Codex · Session 1".to_string(),
                label_origin: Some("default".to_string()),
                status: "active".to_string(),
                failure_reason: None,
                exit_code: None,
                started_at: "2026-03-15 10:00:00".to_string(),
                last_active_at: "2026-03-15 10:00:00".to_string(),
                ended_at: None,
            },
        };

        assert!(!event.contributes_to_activity());
    }

    #[test]
    fn service_log_events_do_not_contribute_to_activity() {
        let event = LifecycleEvent::ServiceLogLine {
            workspace_id: "workspace-1".to_string(),
            name: "api".to_string(),
            stream: "stdout".to_string(),
            line: "booting".to_string(),
        };

        assert!(!event.contributes_to_activity());
    }
}
