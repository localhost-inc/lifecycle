use serde::{Deserialize, Serialize};

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

impl Serialize for LifecycleError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
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
}
