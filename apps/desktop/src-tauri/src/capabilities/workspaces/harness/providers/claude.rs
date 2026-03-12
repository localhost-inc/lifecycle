use serde_json::Value;

use crate::capabilities::workspaces::harness::parsing::{
    build_harness_event_key, extract_text_from_message_content, json_string_at_path,
    normalize_prompt_text,
};
use crate::capabilities::workspaces::harness::types::{
    HarnessAdapter, HarnessPromptSubmission, HarnessTurnCompletion, SessionStoreConfig,
    SessionStoreScope,
};

pub(super) const ADAPTER: HarnessAdapter = HarnessAdapter {
    name: "claude",
    display_name: "Claude",
    program: "claude",
    new_session_args: &[],
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

fn claude_resume_args(session_id: &str) -> Vec<String> {
    vec!["--resume".to_string(), session_id.to_string()]
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
