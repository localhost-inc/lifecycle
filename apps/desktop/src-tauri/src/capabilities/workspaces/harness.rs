#[path = "harness/launch_config.rs"]
mod launch_config;
#[path = "harness/parsing.rs"]
mod parsing;
#[path = "harness/providers.rs"]
mod providers;
#[path = "harness/session_store.rs"]
mod session_store;
#[path = "harness/types.rs"]
mod types;

use std::time::Duration;

pub(crate) const HARNESS_SESSION_CAPTURE_GRACE: Duration = Duration::from_secs(5);

pub(crate) use launch_config::HarnessLaunchConfig;
#[cfg(test)]
pub(crate) use launch_config::HarnessPreset;
#[cfg(test)]
pub(crate) use parsing::read_first_prompt_from_session_reader;
pub(crate) use parsing::{line_is_within_launched_session, normalize_prompt_text};
pub(crate) use providers::{default_harness_terminal_label, resolve_harness_adapter};
#[cfg(test)]
pub(crate) use providers::{
    ClaudeLaunchConfig, ClaudePermissionMode, CodexApprovalPolicy, CodexLaunchConfig,
    CodexSandboxMode,
};
pub(crate) use session_store::{
    discover_harness_session_candidates, resolve_harness_session_log_path,
};
pub(crate) use types::HarnessAdapter;

#[cfg(test)]
mod tests {
    use super::session_store::{
        claude_project_directory_name, discover_session_id_from_directory,
        discover_session_id_from_tree,
    };
    use super::*;
    use serde_json::Value;
    use std::fs;
    use std::io::Cursor;
    use std::path::{Path, PathBuf};
    use std::thread;
    use std::time::{Duration, UNIX_EPOCH};

    fn create_test_temp_dir(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-terminal-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        path
    }

    fn write_test_file(path: &Path, contents: &str) {
        fs::write(path, contents).expect("write test file");
    }

    fn sleep_for_distinct_session_timestamp() {
        thread::sleep(Duration::from_millis(25));
    }

    #[test]
    fn default_harness_terminal_label_uses_adapter_display_name() {
        assert_eq!(
            default_harness_terminal_label(Some("claude"), 2),
            "Claude · Session 2"
        );
        assert_eq!(
            default_harness_terminal_label(Some("unknown"), 2),
            "Harness · Session 2"
        );
    }

    #[test]
    fn claude_project_directory_name_matches_cli_workspace_encoding() {
        assert_eq!(
            claude_project_directory_name(
                "/Users/kyle/.lifecycle/worktrees/frost-harbor--57f59253"
            ),
            "-Users-kyle--lifecycle-worktrees-frost-harbor--57f59253"
        );
    }

    #[test]
    fn discovers_claude_session_ids_for_the_matching_workspace() {
        let project_dir = create_test_temp_dir("claude-session");
        let matching_path = project_dir.join("session-a.jsonl");
        let ignored_path = project_dir.join("session-b.jsonl");
        let store = resolve_harness_adapter(Some("claude"))
            .and_then(|provider| provider.session_store)
            .expect("claude session store");
        write_test_file(
            &matching_path,
            concat!(
                "{\"type\":\"file-history-snapshot\"}\n",
                "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-a\"}\n"
            ),
        );
        write_test_file(
            &ignored_path,
            "{\"cwd\":\"/tmp/worktree-b\",\"sessionId\":\"session-b\"}\n",
        );

        let discovered =
            discover_session_id_from_directory(&project_dir, &store, "/tmp/worktree-a", UNIX_EPOCH);

        assert_eq!(discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn discovers_oldest_matching_claude_session_before_newer_candidates() {
        let project_dir = create_test_temp_dir("claude-session-order");
        let store = resolve_harness_adapter(Some("claude"))
            .and_then(|provider| provider.session_store)
            .expect("claude session store");
        let first_path = project_dir.join("session-a.jsonl");
        let second_path = project_dir.join("session-b.jsonl");
        write_test_file(
            &first_path,
            "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-a\"}\n",
        );
        sleep_for_distinct_session_timestamp();
        write_test_file(
            &second_path,
            "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-b\"}\n",
        );

        let first_discovered =
            discover_session_id_from_directory(&project_dir, &store, "/tmp/worktree-a", UNIX_EPOCH);

        assert_eq!(first_discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn discovers_codex_session_ids_for_the_matching_workspace() {
        let root = create_test_temp_dir("codex-session");
        let session_dir = root.join("2026/03/07");
        let store = resolve_harness_adapter(Some("codex"))
            .and_then(|provider| provider.session_store)
            .expect("codex session store");
        fs::create_dir_all(&session_dir).expect("create nested codex dir");
        let matching_path = session_dir.join("rollout-a.jsonl");
        let ignored_path = session_dir.join("rollout-b.jsonl");
        write_test_file(
            &matching_path,
            concat!(
                "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-a\",\"cwd\":\"/tmp/worktree-a\"}}\n",
                "{\"type\":\"event_msg\"}\n"
            ),
        );
        write_test_file(
            &ignored_path,
            "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-b\",\"cwd\":\"/tmp/worktree-b\"}}\n",
        );

        let discovered =
            discover_session_id_from_tree(&root, &store, "/tmp/worktree-a", UNIX_EPOCH);

        assert_eq!(discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn discovers_oldest_matching_codex_session_before_newer_candidates() {
        let root = create_test_temp_dir("codex-session-order");
        let session_dir = root.join("2026/03/08");
        let store = resolve_harness_adapter(Some("codex"))
            .and_then(|provider| provider.session_store)
            .expect("codex session store");
        fs::create_dir_all(&session_dir).expect("create nested codex dir");
        let first_path = session_dir.join("rollout-a.jsonl");
        let second_path = session_dir.join("rollout-b.jsonl");
        write_test_file(
            &first_path,
            concat!(
                "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-a\",\"cwd\":\"/tmp/worktree-a\"}}\n",
                "{\"type\":\"event_msg\"}\n"
            ),
        );
        sleep_for_distinct_session_timestamp();
        write_test_file(
            &second_path,
            concat!(
                "{\"type\":\"session_meta\",\"payload\":{\"id\":\"session-b\",\"cwd\":\"/tmp/worktree-a\"}}\n",
                "{\"type\":\"event_msg\"}\n"
            ),
        );

        let first_discovered =
            discover_session_id_from_tree(&root, &store, "/tmp/worktree-a", UNIX_EPOCH);

        assert_eq!(first_discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn parses_codex_user_messages_as_prompt_submissions() {
        let provider = resolve_harness_adapter(Some("codex")).expect("codex provider");
        let value = serde_json::from_str::<Value>(
            "{\"timestamp\":\"2026-03-08T16:40:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"\\n## My request for Codex:\\nfix auto tab titles\\n\"}}",
        )
        .expect("valid codex user message");

        let prompt = provider
            .parse_prompt_submission(
                &value,
                "{\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"\\n## My request for Codex:\\nfix auto tab titles\\n\"}}",
            )
            .expect("codex prompt submission");

        assert!(prompt.prompt_key.starts_with("codex:prompt:hash:"));
        assert_eq!(prompt.prompt_text, "fix auto tab titles");
        assert_eq!(prompt.turn_id.as_deref(), None);
    }

    #[test]
    fn parses_claude_user_messages_as_prompt_submissions() {
        let provider = resolve_harness_adapter(Some("claude")).expect("claude provider");
        let value = serde_json::from_str::<Value>(
            "{\"timestamp\":\"2026-03-08T16:40:00Z\",\"type\":\"user\",\"uuid\":\"user-123\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"rename the terminal tab\"}]}}",
        )
        .expect("valid claude user message");

        let prompt = provider
            .parse_prompt_submission(
                &value,
                "{\"type\":\"user\",\"uuid\":\"user-123\",\"message\":{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"rename the terminal tab\"}]}}",
            )
            .expect("claude prompt submission");

        assert_eq!(prompt.prompt_key, "claude:prompt:user-123");
        assert_eq!(prompt.prompt_text, "rename the terminal tab");
        assert_eq!(prompt.turn_id.as_deref(), Some("user-123"));
    }

    #[test]
    fn parses_codex_task_complete_lines_as_turn_completions() {
        let provider = resolve_harness_adapter(Some("codex")).expect("codex provider");
        let value = serde_json::from_str::<Value>(
            "{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"turn-123\"}}",
        )
        .expect("valid codex task complete");

        let completion = provider
            .parse_turn_completion(
                &value,
                "{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\",\"turn_id\":\"turn-123\"}}",
            )
            .expect("codex task complete");

        assert_eq!(completion.completion_key, "codex:completion:turn-123");
        assert_eq!(completion.turn_id.as_deref(), Some("turn-123"));
    }

    #[test]
    fn parses_claude_end_turn_lines_as_turn_completions() {
        let provider = resolve_harness_adapter(Some("claude")).expect("claude provider");
        let value = serde_json::from_str::<Value>(
            "{\"type\":\"assistant\",\"uuid\":\"assistant-uuid\",\"message\":{\"id\":\"msg_123\",\"stop_reason\":\"end_turn\"}}",
        )
        .expect("valid claude end_turn");

        let completion = provider
            .parse_turn_completion(
                &value,
                "{\"type\":\"assistant\",\"uuid\":\"assistant-uuid\",\"message\":{\"id\":\"msg_123\",\"stop_reason\":\"end_turn\"}}",
            )
            .expect("claude end_turn");

        assert_eq!(completion.completion_key, "claude:completion:msg_123");
        assert_eq!(completion.turn_id.as_deref(), Some("msg_123"));
    }

    #[test]
    fn session_log_filter_skips_history_before_launch_boundary() {
        let old_value = serde_json::from_str::<Value>(
            "{\"timestamp\":\"2026-03-08T16:39:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"old\"}}",
        )
        .expect("valid old value");
        let new_value = serde_json::from_str::<Value>(
            "{\"timestamp\":\"2026-03-08T16:41:00Z\",\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"new\"}}",
        )
        .expect("valid new value");
        let launched_after = std::time::SystemTime::UNIX_EPOCH + Duration::from_secs(1_772_988_000);

        assert!(!line_is_within_launched_session(&old_value, launched_after));
        assert!(line_is_within_launched_session(&new_value, launched_after));
    }

    #[test]
    fn codex_prompt_extraction_prefers_submitted_user_message() {
        let log = concat!(
            r##"{"timestamp":"2025-11-07T17:57:22.109Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /Users/kyle/dev/lifecycle\n\n<INSTRUCTIONS>\n...\n</INSTRUCTIONS>\n\n<environment_context>\n  <cwd>/Users/kyle/dev/lifecycle</cwd>\n</environment_context>"}]}}"##,
            "\n",
            r#"{"timestamp":"2025-11-07T17:57:22.118Z","type":"event_msg","payload":{"type":"user_message","message":"\n## My request for Codex:\nfix workspace rename flow\n","images":[]}}"#
        );

        assert_eq!(
            read_first_prompt_from_session_reader("codex", Cursor::new(log)),
            Some("fix workspace rename flow".to_string())
        );
    }

    #[test]
    fn ignores_codex_response_item_user_messages_for_prompt_submissions() {
        let provider = resolve_harness_adapter(Some("codex")).expect("codex provider");
        let value = serde_json::from_str::<Value>(
            r##"{"timestamp":"2026-03-08T16:40:00Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /Users/kyle/dev/lifecycle"}]}}"##,
        )
        .expect("valid codex response item");

        assert_eq!(
            provider.parse_prompt_submission(
                &value,
                r##"{"timestamp":"2026-03-08T16:40:00Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"# AGENTS.md instructions for /Users/kyle/dev/lifecycle"}]}}"##,
            ),
            None
        );
    }

    #[test]
    fn claude_prompt_extraction_skips_meta_and_tool_results() {
        let log = concat!(
            r#"{"type":"user","isMeta":true,"message":{"role":"user","content":"<local-command-caveat>ignore this</local-command-caveat>"}}"#,
            "\n",
            r#"{"type":"user","message":{"role":"user","content":[{"type":"tool_result","content":"ignored"}]}}"#,
            "\n",
            r#"{"type":"user","message":{"role":"user","content":[{"type":"text","text":"rename workspace and session tabs"}]}}"#
        );

        assert_eq!(
            read_first_prompt_from_session_reader("claude", Cursor::new(log)),
            Some("rename workspace and session tabs".to_string())
        );
    }
}
