use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::capabilities::workspaces::harness::launch_config::{HarnessLaunchConfig, HarnessPreset};
use crate::capabilities::workspaces::harness::parsing::{
    build_harness_event_key, extract_text_from_message_content, json_string_at_path,
    normalize_prompt_text,
};
use crate::capabilities::workspaces::harness::types::{
    HarnessAdapter, HarnessPromptSubmission, HarnessTurnCompletion, SessionStoreConfig,
    SessionStoreScope,
};
use crate::shared::errors::LifecycleError;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) enum ClaudePermissionMode {
    #[serde(rename = "acceptEdits")]
    AcceptEdits,
    #[serde(rename = "auto")]
    Auto,
    #[serde(rename = "bypassPermissions")]
    BypassPermissions,
    #[serde(rename = "default")]
    Default,
    #[serde(rename = "dontAsk")]
    DontAsk,
    #[serde(rename = "plan")]
    Plan,
}

impl ClaudePermissionMode {
    pub(crate) fn as_str(&self) -> &'static str {
        match self {
            Self::AcceptEdits => "acceptEdits",
            Self::Auto => "auto",
            Self::BypassPermissions => "bypassPermissions",
            Self::Default => "default",
            Self::DontAsk => "dontAsk",
            Self::Plan => "plan",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClaudeLaunchConfig {
    pub(crate) preset: HarnessPreset,
    pub(crate) permission_mode: ClaudePermissionMode,
    pub(crate) dangerous_skip_permissions: bool,
}

impl ClaudeLaunchConfig {
    fn cli_args(&self) -> Vec<String> {
        if self.dangerous_skip_permissions {
            return vec!["--dangerously-skip-permissions".to_string()];
        }

        vec![
            "--permission-mode".to_string(),
            self.permission_mode.as_str().to_string(),
        ]
    }
}

fn resolve_claude_launch_config(
    launch_config: &HarnessLaunchConfig,
) -> Result<&ClaudeLaunchConfig, LifecycleError> {
    match launch_config {
        HarnessLaunchConfig::Claude { config } => Ok(config),
        HarnessLaunchConfig::Codex { .. } => Err(LifecycleError::AttachFailed(
            "received a Codex launch config for a Claude harness".to_string(),
        )),
    }
}

pub(super) const ADAPTER: HarnessAdapter = HarnessAdapter {
    name: "claude",
    display_name: "Claude",
    program: "claude",
    new_session_args: claude_new_session_args,
    resume_args: claude_resume_args,
    session_store: Some(SessionStoreConfig {
        root_subdir: ".claude/projects",
        scope: SessionStoreScope::ExactWorkspaceDir {
            workspace_dir_name: crate::capabilities::workspaces::harness::session_store::claude_project_directory_name,
        },
        metadata_line_limit: 10,
        required_type: None,
        cwd_path: &["cwd"],
        session_id_path: Some(&["sessionId"]),
        session_id_from_file_stem: true,
    }),
    parse_prompt_submission,
    parse_turn_completion,
};

fn claude_new_session_args(
    session_id: Option<&str>,
    launch_config: Option<&HarnessLaunchConfig>,
) -> Result<Vec<String>, LifecycleError> {
    let mut args = match session_id {
        Some(session_id) => vec!["--session-id".to_string(), session_id.to_string()],
        None => Vec::new(),
    };

    if let Some(launch_config) = launch_config {
        args.extend(resolve_claude_launch_config(launch_config)?.cli_args());
    }

    Ok(args)
}

fn claude_resume_args(
    session_id: &str,
    launch_config: Option<&HarnessLaunchConfig>,
) -> Result<Vec<String>, LifecycleError> {
    let mut args = vec!["--resume".to_string(), session_id.to_string()];
    if let Some(launch_config) = launch_config {
        args.extend(resolve_claude_launch_config(launch_config)?.cli_args());
    }

    Ok(args)
}

fn parse_prompt_submission(value: &Value, line: &str) -> Option<HarnessPromptSubmission> {
    if json_string_at_path(value, &["type"]) != Some("user") {
        return None;
    }
    if value
        .get("isMeta")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }

    let message = value.get("message")?;
    if json_string_at_path(message, &["role"]) != Some("user") {
        return None;
    }

    let prompt_text = normalize_prompt_text(&extract_text_from_message_content(message)?)?;
    let prompt_id = json_string_at_path(value, &["uuid"])
        .or_else(|| json_string_at_path(value, &["message", "id"]));
    let turn_id = json_string_at_path(value, &["message", "id"])
        .or_else(|| json_string_at_path(value, &["uuid"]));

    Some(HarnessPromptSubmission {
        prompt_key: build_harness_event_key("claude", "prompt", line, &[prompt_id, turn_id]),
        prompt_text,
        turn_id: turn_id.map(ToString::to_string),
    })
}

fn parse_turn_completion(value: &Value, line: &str) -> Option<HarnessTurnCompletion> {
    if json_string_at_path(value, &["type"]) != Some("assistant") {
        return None;
    }
    if json_string_at_path(value, &["message", "stop_reason"]) != Some("end_turn") {
        return None;
    }

    let turn_id = json_string_at_path(value, &["message", "id"])
        .or_else(|| json_string_at_path(value, &["uuid"]));

    Some(HarnessTurnCompletion {
        completion_key: build_harness_event_key("claude", "completion", line, &[turn_id]),
        turn_id: turn_id.map(ToString::to_string),
    })
}
