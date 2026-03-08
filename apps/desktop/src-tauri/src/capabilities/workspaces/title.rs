use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde_json::Value;
use std::collections::HashSet;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use super::rename::{self, TitleOrigin};

const TITLE_GENERATION_TIMEOUT: Duration = Duration::from_secs(8);

fn auto_title_registry() -> &'static Mutex<HashSet<String>> {
    static REGISTRY: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashSet::new()))
}

pub fn maybe_schedule_terminal_auto_title_from_harness_completion(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    harness_provider: &str,
    session_log_path: &Path,
) {
    let should_generate = match should_generate_title(db_path, terminal_id, workspace_id) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                "failed to determine title generation eligibility for terminal {}: {error}",
                terminal_id
            );
            return;
        }
    };
    if !should_generate {
        return;
    }

    let Some(prompt) = read_first_prompt_from_session_log(harness_provider, session_log_path)
    else {
        return;
    };

    {
        let mut registry = auto_title_registry().lock().unwrap();
        if !registry.insert(terminal_id.to_string()) {
            return;
        }
    }

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal_id.to_string();
    let workspace_id = workspace_id.to_string();

    tauri::async_runtime::spawn(async move {
        let title = generate_title(&prompt)
            .await
            .unwrap_or_else(|_| fallback_title(&prompt));
        if !title.is_empty() {
            if let Err(error) =
                rename::maybe_apply_generated_terminal_label(&app, &db_path, &terminal_id, &title)
            {
                tracing::warn!(
                    "failed to apply generated terminal label {}: {error}",
                    terminal_id
                );
            }

            if let Err(error) = rename::maybe_apply_generated_workspace_name(
                app.clone(),
                &db_path,
                &workspace_id,
                &title,
            )
            .await
            {
                tracing::warn!(
                    "failed to apply generated workspace name {}: {error}",
                    workspace_id
                );
            }
        }

        let mut registry = auto_title_registry().lock().unwrap();
        registry.remove(&terminal_id);
    });
}

fn should_generate_title(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT terminal.label_origin, workspace.name_origin
         FROM terminal
         INNER JOIN workspace ON workspace.id = terminal.workspace_id
         WHERE terminal.id = ?1
           AND workspace.id = ?2
         LIMIT 1",
        params![terminal_id, workspace_id],
        |row| {
            let terminal_origin: String = row.get(0)?;
            let workspace_origin: String = row.get(1)?;
            Ok(terminal_origin == TitleOrigin::Default.as_str()
                || workspace_origin == TitleOrigin::Default.as_str())
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(terminal_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
}

fn read_first_prompt_from_session_log(
    harness_provider: &str,
    session_log_path: &Path,
) -> Option<String> {
    let file = File::open(session_log_path).ok()?;
    read_first_prompt_from_session_reader(harness_provider, BufReader::new(file))
}

fn read_first_prompt_from_session_reader<R: BufRead>(
    harness_provider: &str,
    reader: R,
) -> Option<String> {
    for line in reader.lines().map_while(Result::ok) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        let prompt = match harness_provider {
            "claude" => extract_claude_prompt(&value),
            "codex" => extract_codex_prompt(&value),
            _ => None,
        };

        if let Some(normalized_prompt) = prompt.and_then(|prompt| normalize_prompt_text(&prompt)) {
            return Some(normalized_prompt);
        }
    }

    None
}

fn extract_claude_prompt(value: &Value) -> Option<String> {
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

    extract_text_from_message_content(message)
}

fn extract_codex_prompt(value: &Value) -> Option<String> {
    if json_string_at_path(value, &["type"]) == Some("event_msg")
        && json_string_at_path(value, &["payload", "type"]) == Some("user_message")
    {
        return value
            .get("payload")
            .and_then(|payload| payload.get("message"))
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    if json_string_at_path(value, &["type"]) == Some("response_item")
        && json_string_at_path(value, &["payload", "type"]) == Some("message")
        && json_string_at_path(value, &["payload", "role"]) == Some("user")
    {
        return value
            .get("payload")
            .and_then(extract_text_from_message_content);
    }

    if json_string_at_path(value, &["type"]) == Some("message")
        && json_string_at_path(value, &["role"]) == Some("user")
    {
        return extract_text_from_message_content(value);
    }

    None
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

fn normalize_prompt_text(value: &str) -> Option<String> {
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

fn json_string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_str()
}

async fn generate_title(prompt: &str) -> Result<String, LifecycleError> {
    if let Some(title) = run_claude_title_generator(prompt).await? {
        return Ok(title);
    }

    if let Some(title) = run_codex_title_generator(prompt).await? {
        return Ok(title);
    }

    Ok(fallback_title(prompt))
}

async fn run_claude_title_generator(prompt: &str) -> Result<Option<String>, LifecycleError> {
    let prompt_text = title_prompt(prompt);
    let output = match timeout(
        TITLE_GENERATION_TIMEOUT,
        Command::new("claude")
            .args([
                "-p",
                "--tools",
                "",
                "--permission-mode",
                "bypassPermissions",
                "--no-session-persistence",
                "--model",
                "sonnet",
                "--output-format",
                "json",
                "--json-schema",
                r#"{"type":"object","properties":{"title":{"type":"string"}},"required":["title"],"additionalProperties":false}"#,
                &prompt_text,
            ])
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(Err(error)) => {
            tracing::debug!("claude title generator failed to launch: {error}");
            return Ok(None);
        }
        Err(_) => {
            tracing::debug!("claude title generator timed out");
            return Ok(None);
        }
    };

    if !output.status.success() {
        tracing::debug!(
            "claude title generator exited with status {}",
            output.status
        );
        return Ok(None);
    }

    Ok(parse_title_json(&String::from_utf8_lossy(&output.stdout)))
}

async fn run_codex_title_generator(prompt: &str) -> Result<Option<String>, LifecycleError> {
    let schema_path = temp_file_path("lifecycle-title-schema", "json");
    let output_path = temp_file_path("lifecycle-title-output", "json");
    let schema_path_string = schema_path.to_string_lossy().to_string();
    let output_path_string = output_path.to_string_lossy().to_string();
    let prompt_text = title_prompt(prompt);
    std::fs::write(
        &schema_path,
        r#"{"type":"object","properties":{"title":{"type":"string"}},"required":["title"],"additionalProperties":false}"#,
    )
    .map_err(|error| LifecycleError::Io(error.to_string()))?;

    let result = timeout(
        TITLE_GENERATION_TIMEOUT,
        Command::new("codex")
            .args([
                "exec",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "--color",
                "never",
                "--output-schema",
                &schema_path_string,
                "--output-last-message",
                &output_path_string,
                &prompt_text,
            ])
            .output(),
    )
    .await;

    let command_output = match result {
        Ok(Ok(output)) => output,
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            let _ = std::fs::remove_file(&schema_path);
            return Ok(None);
        }
        Ok(Err(error)) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::debug!("codex title generator failed to launch: {error}");
            return Ok(None);
        }
        Err(_) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::debug!("codex title generator timed out");
            return Ok(None);
        }
    };

    let _ = std::fs::remove_file(&schema_path);

    if !command_output.status.success() {
        let _ = std::fs::remove_file(&output_path);
        tracing::debug!(
            "codex title generator exited with status {}",
            command_output.status
        );
        return Ok(None);
    }

    let output = match std::fs::read_to_string(&output_path) {
        Ok(output) => output,
        Err(_) => return Ok(None),
    };
    let _ = std::fs::remove_file(&output_path);

    Ok(parse_title_json(&output))
}

fn parse_title_json(output: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(output).ok()?;
    let title = value.get("title")?.as_str()?;
    let sanitized = sanitize_generated_title(title);
    (!sanitized.is_empty()).then_some(sanitized)
}

fn title_prompt(prompt: &str) -> String {
    format!(
        "Return a concise 2-4 word workspace title for this coding task. Output JSON only.\nTask: {prompt}"
    )
}

fn sanitize_generated_title(value: &str) -> String {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'');
    let collapsed = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(48).collect()
}

fn fallback_title(prompt: &str) -> String {
    const STOP_WORDS: &[&str] = &[
        "a", "an", "and", "for", "from", "in", "into", "of", "on", "or", "the", "to", "with",
    ];

    let words = prompt
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter_map(|word| {
            let normalized = word.trim().to_ascii_lowercase();
            if normalized.is_empty() || STOP_WORDS.contains(&normalized.as_str()) {
                return None;
            }
            Some(capitalize(&normalized))
        })
        .take(4)
        .collect::<Vec<_>>();

    if words.is_empty() {
        "Agent Session".to_string()
    } else {
        words.join(" ")
    }
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str()),
        None => String::new(),
    }
}

fn temp_file_path(prefix: &str, extension: &str) -> PathBuf {
    std::env::temp_dir().join(format!("{prefix}-{}.{extension}", uuid::Uuid::new_v4()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn codex_prompt_extraction_prefers_submitted_user_message() {
        let log = concat!(
            r#"{"timestamp":"2025-11-07T17:57:22.109Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"<environment_context>\n  <cwd>/Users/kyle/dev/lifecycle</cwd>\n</environment_context>"}]}}"#,
            "\n",
            r#"{"timestamp":"2025-11-07T17:57:22.118Z","type":"event_msg","payload":{"type":"user_message","message":"\n## My request for Codex:\nfix workspace rename flow\n","images":[]}}"#
        );

        assert_eq!(
            read_first_prompt_from_session_reader("codex", Cursor::new(log)),
            Some("fix workspace rename flow".to_string())
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

    #[test]
    fn fallback_title_keeps_key_words() {
        assert_eq!(
            fallback_title("fix the auth callback in settings"),
            "Fix Auth Callback Settings"
        );
        assert_eq!(fallback_title("   "), "Agent Session");
    }
}
