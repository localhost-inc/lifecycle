use crate::capabilities::workspaces::query::{ServiceRecord, TerminalRecord};
use crate::WorkspaceControllerRegistryHandle;
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
    #[serde(rename = "service.configuration_changed")]
    ServiceConfigurationChanged {
        workspace_id: String,
        service: ServiceRecord,
    },
    #[serde(rename = "workspace.setup_progress")]
    WorkspaceSetupProgress {
        workspace_id: String,
        step_name: String,
        event_kind: String,
        data: Option<String>,
    },
    #[serde(rename = "workspace.manifest_synced")]
    WorkspaceManifestSynced {
        workspace_id: String,
        manifest_fingerprint: Option<String>,
        services: Vec<ServiceRecord>,
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
            Self::WorkspaceStatusChanged { workspace_id, .. }
            | Self::WorkspaceRenamed { workspace_id, .. }
            | Self::WorkspaceDeleted { workspace_id }
            | Self::ServiceStatusChanged { workspace_id, .. }
            | Self::ServiceConfigurationChanged { workspace_id, .. }
            | Self::WorkspaceSetupProgress { workspace_id, .. }
            | Self::WorkspaceManifestSynced { workspace_id, .. }
            | Self::EnvironmentTaskProgress { workspace_id, .. }
            | Self::TerminalCreated { workspace_id, .. }
            | Self::TerminalUpdated { workspace_id, .. }
            | Self::TerminalStatusChanged { workspace_id, .. }
            | Self::TerminalRenamed { workspace_id, .. }
            | Self::TerminalHarnessPromptSubmitted { workspace_id, .. }
            | Self::TerminalHarnessTurnCompleted { workspace_id, .. }
            | Self::GitStatusChanged { workspace_id, .. }
            | Self::GitHeadChanged { workspace_id, .. }
            | Self::GitLogChanged { workspace_id, .. } => workspace_id,
        }
    }

    pub fn contributes_to_activity(&self) -> bool {
        match self {
            Self::WorkspaceSetupProgress { event_kind, .. }
            | Self::EnvironmentTaskProgress { event_kind, .. } => {
                !matches!(event_kind.as_str(), "stdout" | "stderr")
            }
            Self::TerminalUpdated { .. } => false,
            _ => true,
        }
    }
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

    if let Some(workspace_controllers) = app.try_state::<WorkspaceControllerRegistryHandle>() {
        workspace_controllers
            .inner()
            .record_lifecycle_envelope(envelope.event.workspace_id(), envelope.clone());
    }

    let _ = app.emit(LIFECYCLE_EVENT_NAME, envelope);
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
    fn completed_setup_events_continue_to_contribute_to_activity() {
        let event = LifecycleEvent::WorkspaceSetupProgress {
            workspace_id: "workspace-1".to_string(),
            step_name: "install".to_string(),
            event_kind: "completed".to_string(),
            data: None,
        };

        assert!(event.contributes_to_activity());
    }
}
