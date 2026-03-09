use serde_json::Value;
use std::collections::{hash_map::DefaultHasher, HashSet};
use std::fs::{self, File};
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const HARNESS_SESSION_CAPTURE_GRACE: Duration = Duration::from_secs(5);

#[derive(Clone, Copy)]
pub(crate) struct HarnessAdapter {
    pub(crate) name: &'static str,
    pub(crate) display_name: &'static str,
    pub(crate) program: &'static str,
    pub(crate) new_session_args: &'static [&'static str],
    pub(crate) resume_args: fn(&str) -> Vec<String>,
    session_store: Option<SessionStoreConfig>,
    parse_prompt_submission: fn(&Value, &str) -> Option<HarnessPromptSubmission>,
    parse_turn_completion: fn(&Value, &str) -> Option<HarnessTurnCompletion>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HarnessPromptSubmission {
    pub(crate) prompt_key: String,
    pub(crate) prompt_text: String,
    pub(crate) turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HarnessTurnCompletion {
    pub(crate) completion_key: String,
    pub(crate) turn_id: Option<String>,
}

#[derive(Debug)]
struct HarnessSessionCandidate {
    modified_at: SystemTime,
    session_id: String,
}

#[derive(Clone, Copy)]
struct SessionStoreConfig {
    root_subdir: &'static str,
    scope: SessionStoreScope,
    metadata_line_limit: usize,
    required_type: Option<(&'static [&'static str], &'static str)>,
    cwd_path: &'static [&'static str],
    session_id_path: Option<&'static [&'static str]>,
    session_id_from_file_stem: bool,
}

#[derive(Clone, Copy)]
enum SessionStoreScope {
    ExactWorkspaceDir {
        workspace_dir_name: fn(&str) -> String,
    },
    Recursive,
}

const CLAUDE_HARNESS: HarnessAdapter = HarnessAdapter {
    name: "claude",
    display_name: "Claude",
    program: "claude",
    new_session_args: &[],
    resume_args: claude_resume_args,
    session_store: Some(SessionStoreConfig {
        root_subdir: ".claude/projects",
        scope: SessionStoreScope::ExactWorkspaceDir {
            workspace_dir_name: claude_project_directory_name,
        },
        metadata_line_limit: 10,
        required_type: None,
        cwd_path: &["cwd"],
        session_id_path: Some(&["sessionId"]),
        session_id_from_file_stem: true,
    }),
    parse_prompt_submission: parse_claude_prompt_submission,
    parse_turn_completion: parse_claude_turn_completion,
};

const CODEX_HARNESS: HarnessAdapter = HarnessAdapter {
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
    parse_prompt_submission: parse_codex_prompt_submission,
    parse_turn_completion: parse_codex_turn_completion,
};

const HARNESS_ADAPTERS: &[HarnessAdapter] = &[CLAUDE_HARNESS, CODEX_HARNESS];

pub(crate) fn resolve_harness_adapter(provider: Option<&str>) -> Option<HarnessAdapter> {
    let provider = provider?;
    HARNESS_ADAPTERS
        .iter()
        .copied()
        .find(|adapter| adapter.name == provider)
}

pub(crate) fn default_harness_terminal_label(
    harness_provider: Option<&str>,
    sequence: i64,
) -> String {
    match resolve_harness_adapter(harness_provider) {
        Some(adapter) => format!("{} · Session {sequence}", adapter.display_name),
        None => format!("Harness · Session {sequence}"),
    }
}

pub(crate) fn normalize_prompt_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut lines = Vec::new();
    for line in trimmed.lines() {
        let next = line.trim();
        if lines.is_empty() && next.eq_ignore_ascii_case("## My request for Codex:") {
            continue;
        }
        if next.is_empty() {
            continue;
        }
        lines.push(next);
    }

    let collapsed = lines.join(" ");
    let normalized = collapsed.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() || is_scaffolding_prompt(&normalized) {
        return None;
    }

    Some(normalized)
}

pub(crate) fn line_is_within_launched_session(value: &Value, launched_after: SystemTime) -> bool {
    let launch_boundary = launched_after
        .checked_sub(HARNESS_SESSION_CAPTURE_GRACE)
        .unwrap_or(SystemTime::UNIX_EPOCH);
    let launch_boundary_nanos = match launch_boundary.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(duration) => duration.as_nanos() as i128,
        Err(_) => return true,
    };
    let Some(timestamp) = json_string_at_path(value, &["timestamp"]) else {
        return true;
    };
    let Ok(parsed) = OffsetDateTime::parse(timestamp, &Rfc3339) else {
        return true;
    };

    parsed.unix_timestamp_nanos() >= launch_boundary_nanos
}

pub(crate) fn discover_harness_session_id(
    provider: HarnessAdapter,
    worktree_path: &str,
    launched_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let modified_after = launched_after
        .checked_sub(HARNESS_SESSION_CAPTURE_GRACE)
        .unwrap_or(SystemTime::UNIX_EPOCH);

    let store = provider.session_store?;
    discover_session_id_from_store(&store, worktree_path, modified_after, claimed_session_ids)
}

pub(crate) fn resolve_harness_session_log_path(
    provider: HarnessAdapter,
    worktree_path: &str,
    session_id: &str,
) -> Option<PathBuf> {
    let store = provider.session_store?;
    let root = harness_home_subdir(store.root_subdir)?;

    match store.scope {
        SessionStoreScope::ExactWorkspaceDir { workspace_dir_name } => {
            let path = root
                .join(workspace_dir_name(worktree_path))
                .join(format!("{session_id}.jsonl"));
            path.exists().then_some(path)
        }
        SessionStoreScope::Recursive => {
            resolve_harness_session_log_path_from_tree(&root, &store, worktree_path, session_id)
        }
    }
}

impl HarnessAdapter {
    pub(crate) fn supports_session_observer(self) -> bool {
        self.session_store.is_some()
    }

    pub(crate) fn parse_prompt_submission(
        self,
        value: &Value,
        line: &str,
    ) -> Option<HarnessPromptSubmission> {
        (self.parse_prompt_submission)(value, line)
    }

    pub(crate) fn parse_turn_completion(
        self,
        value: &Value,
        line: &str,
    ) -> Option<HarnessTurnCompletion> {
        (self.parse_turn_completion)(value, line)
    }
}

fn claude_resume_args(session_id: &str) -> Vec<String> {
    vec!["--resume".to_string(), session_id.to_string()]
}

fn codex_resume_args(session_id: &str) -> Vec<String> {
    vec!["resume".to_string(), session_id.to_string()]
}

fn parse_claude_prompt_submission(value: &Value, line: &str) -> Option<HarnessPromptSubmission> {
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

fn parse_codex_prompt_submission(value: &Value, line: &str) -> Option<HarnessPromptSubmission> {
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

fn parse_claude_turn_completion(value: &Value, line: &str) -> Option<HarnessTurnCompletion> {
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

fn parse_codex_turn_completion(value: &Value, line: &str) -> Option<HarnessTurnCompletion> {
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

fn is_scaffolding_prompt(value: &str) -> bool {
    let lowercase = value.to_ascii_lowercase();
    lowercase.starts_with("<environment_context>")
        || lowercase.starts_with("<local-command-caveat>")
        || lowercase.starts_with("<command-name>")
        || lowercase.starts_with("<command-message>")
        || lowercase.starts_with("<command-args>")
        || lowercase.starts_with("<local-command-stdout>")
        || lowercase.starts_with("[request interrupted by user]")
        || lowercase.starts_with("[image:")
}

fn extract_text_from_message_content(message: &Value) -> Option<String> {
    let content = message.get("content")?;

    if let Some(text) = content.as_str() {
        return Some(text.to_string());
    }

    let items = content.as_array()?;
    let mut fragments = Vec::new();

    for item in items {
        match item.get("type").and_then(Value::as_str) {
            Some("text") | Some("input_text") => {
                if let Some(text) = item.get("text").and_then(Value::as_str) {
                    fragments.push(text.to_string());
                }
            }
            _ => {}
        }
    }

    if fragments.is_empty() {
        None
    } else {
        Some(fragments.join("\n"))
    }
}

fn resolve_harness_session_log_path_from_tree(
    root: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    session_id: &str,
) -> Option<PathBuf> {
    let mut pending = vec![root.to_path_buf()];

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };

            if file_type.is_dir() {
                pending.push(path);
                continue;
            }

            if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
                continue;
            }

            let Some((cwd, candidate_session_id)) = read_session_metadata(&path, store) else {
                continue;
            };
            if cwd == worktree_path && candidate_session_id == session_id {
                return Some(path);
            }
        }
    }

    None
}

fn harness_home_subdir(subdir: &str) -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join(subdir))
}

fn claude_project_directory_name(worktree_path: &str) -> String {
    worktree_path
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect()
}

fn discover_session_id_from_store(
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let root = harness_home_subdir(store.root_subdir)?;
    match store.scope {
        SessionStoreScope::ExactWorkspaceDir { workspace_dir_name } => {
            discover_session_id_from_directory(
                &root.join(workspace_dir_name(worktree_path)),
                store,
                worktree_path,
                modified_after,
                claimed_session_ids,
            )
        }
        SessionStoreScope::Recursive => discover_session_id_from_tree(
            &root,
            store,
            worktree_path,
            modified_after,
            claimed_session_ids,
        ),
    }
}

fn discover_session_id_from_directory(
    dir: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let entries = fs::read_dir(dir).ok()?;
    let mut candidates = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
            continue;
        }

        let Some(modified_at) = entry
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
        else {
            continue;
        };
        if modified_at < modified_after {
            continue;
        }

        let Some((cwd, session_id)) = read_session_metadata(&path, store) else {
            continue;
        };
        if cwd != worktree_path || claimed_session_ids.contains(&session_id) {
            continue;
        }

        candidates.push(HarnessSessionCandidate {
            modified_at,
            session_id,
        });
    }

    candidates.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.session_id)
}

fn discover_session_id_from_tree(
    root: &Path,
    store: &SessionStoreConfig,
    worktree_path: &str,
    modified_after: SystemTime,
    claimed_session_ids: &HashSet<String>,
) -> Option<String> {
    let mut pending = vec![root.to_path_buf()];
    let mut candidates = Vec::new();

    while let Some(dir) = pending.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                pending.push(path);
                continue;
            }
            if path.extension().and_then(|extension| extension.to_str()) != Some("jsonl") {
                continue;
            }

            let Some(modified_at) = entry
                .metadata()
                .ok()
                .and_then(|metadata| metadata.modified().ok())
            else {
                continue;
            };
            if modified_at < modified_after {
                continue;
            }

            let Some((cwd, session_id)) = read_session_metadata(&path, store) else {
                continue;
            };
            if cwd != worktree_path || claimed_session_ids.contains(&session_id) {
                continue;
            }

            candidates.push(HarnessSessionCandidate {
                modified_at,
                session_id,
            });
        }
    }

    candidates.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    candidates
        .into_iter()
        .next()
        .map(|candidate| candidate.session_id)
}

fn read_session_metadata(path: &Path, store: &SessionStoreConfig) -> Option<(String, String)> {
    let file = File::open(path).ok()?;
    for line in BufReader::new(file).lines().take(store.metadata_line_limit) {
        let Ok(line) = line else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some((type_path, expected_type)) = store.required_type {
            if json_string_at_path(&value, type_path) != Some(expected_type) {
                continue;
            }
        }

        let Some(cwd) = json_string_at_path(&value, store.cwd_path) else {
            continue;
        };
        let Some(session_id) = store
            .session_id_path
            .and_then(|path| json_string_at_path(&value, path))
            .or_else(|| {
                if store.session_id_from_file_stem {
                    path.file_stem().and_then(|stem| stem.to_str())
                } else {
                    None
                }
            })
        else {
            continue;
        };

        return Some((cwd.to_string(), session_id.to_string()));
    }

    None
}

fn build_harness_event_key(
    provider_name: &str,
    kind: &str,
    line: &str,
    identifiers: &[Option<&str>],
) -> String {
    if let Some(identifier) = identifiers.iter().flatten().find(|value| !value.is_empty()) {
        return format!("{provider_name}:{kind}:{identifier}");
    }

    let mut hasher = DefaultHasher::new();
    provider_name.hash(&mut hasher);
    kind.hash(&mut hasher);
    line.hash(&mut hasher);
    format!("{provider_name}:{kind}:hash:{:016x}", hasher.finish())
}

fn json_string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_str()
}

#[cfg(test)]
pub(crate) fn read_first_prompt_from_session_reader<R: BufRead>(
    harness_provider: &str,
    reader: R,
) -> Option<String> {
    let adapter = resolve_harness_adapter(Some(harness_provider))?;
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if let Some(prompt) = adapter.parse_prompt_submission(&value, trimmed) {
            return Some(prompt.prompt_text);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use std::time::UNIX_EPOCH;

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

        let discovered = discover_session_id_from_directory(
            &project_dir,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &HashSet::new(),
        );

        assert_eq!(discovered.as_deref(), Some("session-a"));
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

        let discovered = discover_session_id_from_tree(
            &root,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &HashSet::new(),
        );

        assert_eq!(discovered.as_deref(), Some("session-a"));
    }

    #[test]
    fn skips_harness_session_ids_already_claimed_by_another_terminal() {
        let project_dir = create_test_temp_dir("claimed-session");
        let matching_path = project_dir.join("session-a.jsonl");
        let store = resolve_harness_adapter(Some("claude"))
            .and_then(|provider| provider.session_store)
            .expect("claude session store");
        write_test_file(
            &matching_path,
            "{\"cwd\":\"/tmp/worktree-a\",\"sessionId\":\"session-a\"}\n",
        );
        let claimed = HashSet::from([String::from("session-a")]);

        let discovered = discover_session_id_from_directory(
            &project_dir,
            &store,
            "/tmp/worktree-a",
            UNIX_EPOCH,
            &claimed,
        );

        assert_eq!(discovered, None);
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
        let launched_after = SystemTime::UNIX_EPOCH + Duration::from_secs(1_772_988_000);

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
