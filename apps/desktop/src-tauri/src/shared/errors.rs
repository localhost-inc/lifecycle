use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceStatus {
    Idle,
    Starting,
    Active,
    Stopping,
}

impl WorkspaceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Starting => "starting",
            Self::Active => "active",
            Self::Stopping => "stopping",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, LifecycleError> {
        match s {
            "idle" => Ok(Self::Idle),
            "starting" => Ok(Self::Starting),
            "active" => Ok(Self::Active),
            "stopping" => Ok(Self::Stopping),
            _ => Err(LifecycleError::InvalidStateTransition {
                from: s.to_string(),
                to: "unknown".to_string(),
            }),
        }
    }
}

impl std::fmt::Display for WorkspaceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceFailureReason {
    CapacityUnavailable,
    EnvironmentTaskFailed,
    ManifestInvalid,
    RepoCloneFailed,
    RepositoryDisconnected,
    SetupStepFailed,
    ServiceStartFailed,
    ServiceHealthcheckFailed,
    SandboxUnreachable,
    LocalDockerUnavailable,
    LocalPortConflict,
    LocalAppNotRunning,
    OperationTimeout,
    Unknown,
}

impl WorkspaceFailureReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::CapacityUnavailable => "capacity_unavailable",
            Self::EnvironmentTaskFailed => "environment_task_failed",
            Self::ManifestInvalid => "manifest_invalid",
            Self::RepoCloneFailed => "repo_clone_failed",
            Self::RepositoryDisconnected => "repository_disconnected",
            Self::SetupStepFailed => "setup_step_failed",
            Self::ServiceStartFailed => "service_start_failed",
            Self::ServiceHealthcheckFailed => "service_healthcheck_failed",
            Self::SandboxUnreachable => "sandbox_unreachable",
            Self::LocalDockerUnavailable => "local_docker_unavailable",
            Self::LocalPortConflict => "local_port_conflict",
            Self::LocalAppNotRunning => "local_app_not_running",
            Self::OperationTimeout => "operation_timeout",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ServiceStatus {
    Stopped,
    Starting,
    Ready,
    Failed,
}

impl ServiceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Stopped => "stopped",
            Self::Starting => "starting",
            Self::Ready => "ready",
            Self::Failed => "failed",
        }
    }
}

impl std::fmt::Display for ServiceStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TerminalType {
    Shell,
    Harness,
    Preset,
    Command,
}

impl TerminalType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Shell => "shell",
            Self::Harness => "harness",
            Self::Preset => "preset",
            Self::Command => "command",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, LifecycleError> {
        match s {
            "shell" => Ok(Self::Shell),
            "harness" => Ok(Self::Harness),
            "preset" => Ok(Self::Preset),
            "command" => Ok(Self::Command),
            _ => Err(LifecycleError::InvalidStateTransition {
                from: s.to_string(),
                to: "unknown".to_string(),
            }),
        }
    }
}

impl std::fmt::Display for TerminalType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TerminalStatus {
    Active,
    Detached,
    Sleeping,
    Finished,
    Failed,
}

impl TerminalStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Detached => "detached",
            Self::Sleeping => "sleeping",
            Self::Finished => "finished",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, LifecycleError> {
        match s {
            "active" => Ok(Self::Active),
            "detached" => Ok(Self::Detached),
            "sleeping" => Ok(Self::Sleeping),
            "finished" => Ok(Self::Finished),
            "failed" => Ok(Self::Failed),
            _ => Err(LifecycleError::InvalidStateTransition {
                from: s.to_string(),
                to: "unknown".to_string(),
            }),
        }
    }
}

impl std::fmt::Display for TerminalStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TerminalFailureReason {
    HarnessProcessExitNonzero,
    AttachFailed,
    WorkspaceDestroyed,
    Unknown,
}

impl TerminalFailureReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::HarnessProcessExitNonzero => "harness_process_exit_nonzero",
            Self::AttachFailed => "attach_failed",
            Self::WorkspaceDestroyed => "workspace_destroyed",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("Invalid state transition from '{from}' to '{to}'")]
    InvalidStateTransition { from: String, to: String },

    #[error("Workspace mutation locked while environment status is '{status}'")]
    WorkspaceMutationLocked { status: String },

    #[error("Workspace not found: {0}")]
    WorkspaceNotFound(String),

    #[error("Repository clone failed: {0}")]
    RepoCloneFailed(String),

    #[error("Setup step failed: {step} (exit code {exit_code})")]
    SetupStepFailed { step: String, exit_code: i32 },

    #[error("Setup step timed out: {step}")]
    SetupStepTimeout { step: String },

    #[error("Service start failed: {service} - {reason}")]
    ServiceStartFailed { service: String, reason: String },

    #[error("Service healthcheck failed: {service}")]
    ServiceHealthcheckFailed { service: String },

    #[error("Docker unavailable: {0}")]
    DockerUnavailable(String),

    #[error("Port conflict on port {port}: {service}")]
    PortConflict { service: String, port: u16 },

    #[error("Manifest deserialization failed: {0}")]
    ManifestInvalid(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Terminal attach failed: {0}")]
    AttachFailed(String),

    #[error("Attachment persistence failed: {0}")]
    AttachmentPersistenceFailed(String),

    #[error("Git operation failed during {operation}: {reason}")]
    GitOperationFailed { operation: String, reason: String },

    #[error("Invalid {field}: {reason}")]
    InvalidInput { field: String, reason: String },

    #[error("IO error: {0}")]
    Io(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleErrorEnvelope {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, Value>>,
    pub request_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggested_action: Option<String>,
    pub retryable: bool,
}

impl LifecycleError {
    fn envelope(&self) -> LifecycleErrorEnvelope {
        let (code, details, suggested_action, retryable) = match self {
            Self::InvalidStateTransition { from, to } => (
                "invalid_state_transition",
                Some(Map::from_iter([
                    ("from".to_string(), Value::String(from.clone())),
                    ("to".to_string(), Value::String(to.clone())),
                ])),
                Some("Wait for the current workspace transition to finish, then retry.".to_string()),
                false,
            ),
            Self::WorkspaceMutationLocked { status } => (
                "workspace_mutation_locked",
                Some(Map::from_iter([(
                    "status".to_string(),
                    Value::String(status.clone()),
                )])),
                Some("Wait for the current workspace lifecycle action to finish and try again.".to_string()),
                true,
            ),
            Self::WorkspaceNotFound(workspace_id) => (
                "not_found",
                Some(Map::from_iter([(
                    "workspaceId".to_string(),
                    Value::String(workspace_id.clone()),
                )])),
                Some("Refresh the workspace list and retry the action.".to_string()),
                false,
            ),
            Self::RepoCloneFailed(reason) => (
                "internal_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                Some("Check repository access and retry the workspace creation.".to_string()),
                false,
            ),
            Self::SetupStepFailed { step, exit_code } => (
                "setup_step_failed",
                Some(Map::from_iter([
                    ("step".to_string(), Value::String(step.clone())),
                    ("exitCode".to_string(), json!(*exit_code)),
                ])),
                Some("Inspect the setup step output, fix the failure, and retry.".to_string()),
                false,
            ),
            Self::SetupStepTimeout { step } => (
                "setup_step_failed",
                Some(Map::from_iter([
                    ("step".to_string(), Value::String(step.clone())),
                    ("timeout".to_string(), Value::Bool(true)),
                ])),
                Some("Inspect the setup step output and increase the timeout or fix the step before retrying.".to_string()),
                true,
            ),
            Self::ServiceStartFailed { service, reason } => (
                "service_start_failed",
                Some(Map::from_iter([
                    ("service".to_string(), Value::String(service.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                Some("Inspect the service logs, fix the startup failure, and retry.".to_string()),
                true,
            ),
            Self::ServiceHealthcheckFailed { service } => (
                "service_healthcheck_failed",
                Some(Map::from_iter([(
                    "service".to_string(),
                    Value::String(service.clone()),
                )])),
                Some("Inspect the service health checks and retry once the service is reachable.".to_string()),
                true,
            ),
            Self::DockerUnavailable(reason) => (
                "local_docker_unavailable",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                Some("Start Docker Desktop and retry the workspace action.".to_string()),
                true,
            ),
            Self::PortConflict { service, port } => (
                "local_port_conflict",
                Some(Map::from_iter([
                    ("service".to_string(), Value::String(service.clone())),
                    ("port".to_string(), json!(*port)),
                ])),
                Some("Choose a different port or stop the conflicting process, then retry.".to_string()),
                true,
            ),
            Self::ManifestInvalid(reason) => (
                "validation_failed",
                Some(Map::from_iter([
                    ("field".to_string(), Value::String("manifest".to_string())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                Some("Fix lifecycle.json validation errors and retry.".to_string()),
                false,
            ),
            Self::Database(reason) => (
                "internal_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                None,
                false,
            ),
            Self::AttachFailed(reason) => (
                "internal_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                Some("Retry the terminal action. If it keeps failing, recreate the session.".to_string()),
                true,
            ),
            Self::AttachmentPersistenceFailed(reason) => (
                "internal_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                Some("Retry saving the attachment. If it keeps failing, check workspace disk access.".to_string()),
                true,
            ),
            Self::GitOperationFailed { operation, reason } => (
                "internal_error",
                Some(Map::from_iter([
                    ("operation".to_string(), Value::String(operation.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                Some("Inspect the git operation output and retry once the repository state is corrected.".to_string()),
                true,
            ),
            Self::InvalidInput { field, reason } => (
                "validation_failed",
                Some(Map::from_iter([
                    ("field".to_string(), Value::String(field.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                Some("Correct the invalid input and retry.".to_string()),
                false,
            ),
            Self::Io(reason) => (
                "internal_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                None,
                true,
            ),
        };

        LifecycleErrorEnvelope {
            code: code.to_string(),
            message: self.to_string(),
            details,
            request_id: uuid::Uuid::new_v4().to_string(),
            suggested_action,
            retryable,
        }
    }
}

impl Serialize for LifecycleError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.envelope().serialize(serializer)
    }
}

impl From<std::io::Error> for LifecycleError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}

impl From<rusqlite::Error> for LifecycleError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_status_roundtrip() {
        let statuses = vec![
            WorkspaceStatus::Idle,
            WorkspaceStatus::Starting,
            WorkspaceStatus::Active,
            WorkspaceStatus::Stopping,
        ];
        for status in statuses {
            let s = status.as_str();
            let parsed = WorkspaceStatus::from_str(s).unwrap();
            assert_eq!(status, parsed);
        }
    }

    #[test]
    fn service_status_display() {
        assert_eq!(ServiceStatus::Stopped.as_str(), "stopped");
        assert_eq!(ServiceStatus::Starting.as_str(), "starting");
        assert_eq!(ServiceStatus::Ready.as_str(), "ready");
        assert_eq!(ServiceStatus::Failed.as_str(), "failed");
    }

    #[test]
    fn terminal_status_roundtrip() {
        let statuses = vec![
            TerminalStatus::Active,
            TerminalStatus::Detached,
            TerminalStatus::Sleeping,
            TerminalStatus::Finished,
            TerminalStatus::Failed,
        ];
        for status in statuses {
            let s = status.as_str();
            let parsed = TerminalStatus::from_str(s).unwrap();
            assert_eq!(status, parsed);
        }
    }

    #[test]
    fn lifecycle_errors_serialize_to_typed_envelopes() {
        let value = serde_json::to_value(LifecycleError::WorkspaceMutationLocked {
            status: "stopping".to_string(),
        })
        .expect("serialize typed lifecycle error");

        assert_eq!(
            value.get("code"),
            Some(&Value::String("workspace_mutation_locked".into()))
        );
        assert_eq!(
            value.get("message"),
            Some(&Value::String(
                "Workspace mutation locked while environment status is 'stopping'".into()
            ))
        );
        assert_eq!(
            value.pointer("/details/status"),
            Some(&Value::String("stopping".into()))
        );
        assert_eq!(value.get("retryable"), Some(&Value::Bool(true)));
        assert!(matches!(
            value.get("requestId"),
            Some(Value::String(request_id)) if !request_id.is_empty()
        ));
    }

    #[test]
    fn invalid_input_errors_keep_field_level_details() {
        let value = serde_json::to_value(LifecycleError::InvalidInput {
            field: "port_override".to_string(),
            reason: "must be between 1 and 65535".to_string(),
        })
        .expect("serialize invalid input lifecycle error");

        assert_eq!(
            value.get("code"),
            Some(&Value::String("validation_failed".into()))
        );
        assert_eq!(
            value.pointer("/details/field"),
            Some(&Value::String("port_override".into()))
        );
        assert_eq!(
            value.pointer("/details/reason"),
            Some(&Value::String("must be between 1 and 65535".into()))
        );
        assert_eq!(value.get("retryable"), Some(&Value::Bool(false)));
    }
}
