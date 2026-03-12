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
    name: "codex",
    display_name: "Codex",
    program: "codex",
    new_session_args: &[],
    resume_args: codex_resume_args,
    session_store: Some(SessionStoreConfig {
        root_subdir: ".codex/sessions",
        scope: SessionStoreScope::Recursive,
        metadata_line_limit: 1,
        required_type: Some((&["type"], "session_meta")),
        cwd_path: &["payload", "cwd"],
        session_id_path: Some(&["payload", "id"]),
        session_id_from_file_stem: false,
    }),
    parse_prompt_submission,
    parse_turn_completion,
};

fn codex_resume_args(session_id: &str) -> Vec<String> {
    vec!["resume".to_string(), session_id.to_string()]
}

fn parse_prompt_submission(value: &Value, line: &str) -> Option<HarnessPromptSubmission> {
    let prompt_text = if json_string_at_path(value, &["type"]) == Some("event_msg")
        && json_string_at_path(value, &["payload", "type"]) == Some("user_message")
    {
        value
            .get("payload")
            .and_then(|payload| payload.get("message"))
            .and_then(Value::as_str)
            .and_then(normalize_prompt_text)?
    } else if json_string_at_path(value, &["type"]) == Some("message")
        && json_string_at_path(value, &["role"]) == Some("user")
    {
        normalize_prompt_text(&extract_text_from_message_content(value)?)?
    } else {
        return None;
    };

    let prompt_id = json_string_at_path(value, &["uuid"])
        .or_else(|| json_string_at_path(value, &["payload", "turn_id"]))
        .or_else(|| json_string_at_path(value, &["message", "id"]));
    let turn_id = json_string_at_path(value, &["payload", "turn_id"])
        .or_else(|| json_string_at_path(value, &["message", "id"]))
        .or_else(|| json_string_at_path(value, &["uuid"]));

    Some(HarnessPromptSubmission {
        prompt_key: build_harness_event_key("codex", "prompt", line, &[prompt_id, turn_id]),
        prompt_text,
        turn_id: turn_id.map(ToString::to_string),
    })
}

fn parse_turn_completion(value: &Value, line: &str) -> Option<HarnessTurnCompletion> {
    if json_string_at_path(value, &["type"]) != Some("event_msg") {
        return None;
    }
    if json_string_at_path(value, &["payload", "type"]) != Some("task_complete") {
        return None;
    }

    let turn_id = json_string_at_path(value, &["payload", "turn_id"]);
    let last_agent_message_id =
        json_string_at_path(value, &["payload", "last_agent_message", "id"])
            .or_else(|| json_string_at_path(value, &["payload", "last_agent_message", "uuid"]));

    Some(HarnessTurnCompletion {
        completion_key: build_harness_event_key(
            "codex",
            "completion",
            line,
            &[turn_id, last_agent_message_id],
        ),
        turn_id: turn_id.map(ToString::to_string),
    })
}
