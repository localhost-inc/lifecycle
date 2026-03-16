use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};

use super::providers::{ClaudeLaunchConfig, CodexLaunchConfig};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum HarnessPreset {
    Guarded,
    TrustedHost,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "provider")]
pub(crate) enum HarnessLaunchConfig {
    Codex {
        #[serde(flatten)]
        config: CodexLaunchConfig,
    },
    Claude {
        #[serde(flatten)]
        config: ClaudeLaunchConfig,
    },
}

impl HarnessLaunchConfig {
    fn provider_name(&self) -> &'static str {
        match self {
            Self::Codex { .. } => "codex",
            Self::Claude { .. } => "claude",
        }
    }

    pub(crate) fn validate_provider(&self, provider: &str) -> Result<(), LifecycleError> {
        let config_provider = self.provider_name();
        if config_provider == provider {
            return Ok(());
        }

        Err(LifecycleError::AttachFailed(format!(
            "harness launch config for {config_provider} does not match provider {provider}"
        )))
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{ClaudeLaunchConfig, CodexLaunchConfig, HarnessLaunchConfig, HarnessPreset};
    use crate::capabilities::workspaces::harness::providers::{
        ClaudePermissionMode, CodexApprovalPolicy, CodexSandboxMode,
    };

    #[test]
    fn serializes_codex_launch_config_with_flat_provider_fields() {
        let config = HarnessLaunchConfig::Codex {
            config: CodexLaunchConfig {
                preset: HarnessPreset::Guarded,
                sandbox_mode: CodexSandboxMode::WorkspaceWrite,
                approval_policy: CodexApprovalPolicy::Untrusted,
                dangerous_bypass: false,
            },
        };

        let json_value = serde_json::to_value(config).expect("serialize launch config");

        assert_eq!(
            json_value,
            json!({
                "provider": "codex",
                "preset": "guarded",
                "sandboxMode": "workspace-write",
                "approvalPolicy": "untrusted",
                "dangerousBypass": false,
            })
        );
    }

    #[test]
    fn serializes_claude_launch_config_with_flat_provider_fields() {
        let config = HarnessLaunchConfig::Claude {
            config: ClaudeLaunchConfig {
                preset: HarnessPreset::TrustedHost,
                permission_mode: ClaudePermissionMode::BypassPermissions,
                dangerous_skip_permissions: true,
            },
        };

        let json_value = serde_json::to_value(config).expect("serialize launch config");

        assert_eq!(
            json_value,
            json!({
                "provider": "claude",
                "preset": "trusted_host",
                "permissionMode": "bypassPermissions",
                "dangerousSkipPermissions": true,
            })
        );
    }
}
