use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceStatus {
    Creating,
    Starting,
    Ready,
    Resetting,
    Sleeping,
    Destroying,
    Failed,
}

impl WorkspaceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Creating => "creating",
            Self::Starting => "starting",
            Self::Ready => "ready",
            Self::Resetting => "resetting",
            Self::Sleeping => "sleeping",
            Self::Destroying => "destroying",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(s: &str) -> Result<Self, LifecycleError> {
        match s {
            "creating" => Ok(Self::Creating),
            "starting" => Ok(Self::Starting),
            "ready" => Ok(Self::Ready),
            "resetting" => Ok(Self::Resetting),
            "sleeping" => Ok(Self::Sleeping),
            "destroying" => Ok(Self::Destroying),
            "failed" => Ok(Self::Failed),
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
    ManifestInvalid,
    ManifestSecretUnresolved,
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
            Self::ManifestInvalid => "manifest_invalid",
            Self::ManifestSecretUnresolved => "manifest_secret_unresolved",
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

#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("Invalid state transition from '{from}' to '{to}'")]
    InvalidStateTransition { from: String, to: String },

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_status_roundtrip() {
        let statuses = vec![
            WorkspaceStatus::Creating,
            WorkspaceStatus::Starting,
            WorkspaceStatus::Ready,
            WorkspaceStatus::Resetting,
            WorkspaceStatus::Sleeping,
            WorkspaceStatus::Destroying,
            WorkspaceStatus::Failed,
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
}
