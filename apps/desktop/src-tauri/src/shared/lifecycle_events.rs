use crate::capabilities::workspaces::query::TerminalRecord;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
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
    #[serde(rename = "workspace.status_changed")]
    WorkspaceStatusChanged {
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
        service_name: String,
        status: String,
        status_reason: Option<String>,
    },
    #[serde(rename = "workspace.setup_progress")]
    WorkspaceSetupProgress {
        workspace_id: String,
        step_name: String,
        event_kind: String,
        data: Option<String>,
    },
    #[serde(rename = "environment.task_progress")]
    EnvironmentTaskProgress {
        workspace_id: String,
        step_name: String,
        event_kind: String,
        data: Option<String>,
    },
    #[serde(rename = "terminal.created")]
    TerminalCreated {
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

pub fn publish_lifecycle_event(app: &AppHandle, event: LifecycleEvent) {
    let occurred_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let envelope = LifecycleEnvelope {
        id: Uuid::new_v4().to_string(),
        occurred_at,
        event,
    };

    let _ = app.emit(LIFECYCLE_EVENT_NAME, envelope);
}
