use serde::Serialize;
use serde_json::{Map, Value};

#[derive(Debug, thiserror::Error)]
pub enum LifecycleError {
    #[error("Repository clone failed: {0}")]
    RepoCloneFailed(String),

    #[error("Step failed: {step} (exit code {exit_code})")]
    PrepareStepFailed { step: String, exit_code: i32 },

    #[error("Step timed out: {step}")]
    PrepareStepTimeout { step: String },

    #[error("Process start failed: {name} - {reason}")]
    ProcessStartFailed { name: String, reason: String },

    #[error("Health check failed: {name}")]
    HealthcheckFailed { name: String },

    #[error("Docker unavailable: {0}")]
    DockerUnavailable(String),

    #[error("No available port for {name}")]
    PortExhausted { name: String },

    #[error("Attach failed: {0}")]
    AttachFailed(String),

    #[error("Git operation failed during {operation}: {reason}")]
    GitOperationFailed { operation: String, reason: String },

    #[error("Invalid {field}: {reason}")]
    InvalidInput { field: String, reason: String },

    #[error("IO error: {0}")]
    Io(String),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LifecycleErrorEnvelope {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Map<String, Value>>,
    pub retryable: bool,
}

impl LifecycleError {
    fn envelope(&self) -> LifecycleErrorEnvelope {
        let (code, details, retryable) = match self {
            Self::RepoCloneFailed(reason) => (
                "repo_clone_failed",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                false,
            ),
            Self::PrepareStepFailed { step, exit_code } => (
                "step_failed",
                Some(Map::from_iter([
                    ("step".to_string(), Value::String(step.clone())),
                    ("exitCode".to_string(), serde_json::json!(*exit_code)),
                ])),
                false,
            ),
            Self::PrepareStepTimeout { step } => (
                "step_timeout",
                Some(Map::from_iter([
                    ("step".to_string(), Value::String(step.clone())),
                ])),
                true,
            ),
            Self::ProcessStartFailed { name, reason } => (
                "process_start_failed",
                Some(Map::from_iter([
                    ("name".to_string(), Value::String(name.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                true,
            ),
            Self::HealthcheckFailed { name } => (
                "healthcheck_failed",
                Some(Map::from_iter([(
                    "name".to_string(),
                    Value::String(name.clone()),
                )])),
                true,
            ),
            Self::DockerUnavailable(reason) => (
                "docker_unavailable",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                true,
            ),
            Self::PortExhausted { name } => (
                "port_exhausted",
                Some(Map::from_iter([(
                    "name".to_string(),
                    Value::String(name.clone()),
                )])),
                true,
            ),
            Self::AttachFailed(reason) => (
                "attach_failed",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                true,
            ),
            Self::GitOperationFailed { operation, reason } => (
                "git_operation_failed",
                Some(Map::from_iter([
                    ("operation".to_string(), Value::String(operation.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                true,
            ),
            Self::InvalidInput { field, reason } => (
                "validation_failed",
                Some(Map::from_iter([
                    ("field".to_string(), Value::String(field.clone())),
                    ("reason".to_string(), Value::String(reason.clone())),
                ])),
                false,
            ),
            Self::Io(reason) => (
                "io_error",
                Some(Map::from_iter([(
                    "reason".to_string(),
                    Value::String(reason.clone()),
                )])),
                true,
            ),
        };

        LifecycleErrorEnvelope {
            code: code.to_string(),
            message: self.to_string(),
            details,
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
