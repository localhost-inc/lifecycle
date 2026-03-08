use crate::shared::errors::LifecycleError;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use super::query::TerminalRow;
use super::rename;

const TITLE_GENERATION_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Default)]
struct PromptCaptureState {
    buffer: String,
    captured: bool,
    in_escape_sequence: bool,
}

fn prompt_capture_registry() -> &'static Mutex<HashMap<String, PromptCaptureState>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, PromptCaptureState>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn maybe_schedule_terminal_auto_title(
    app: &AppHandle,
    db_path: &str,
    terminal: &TerminalRow,
    data: &str,
) {
    if terminal.launch_type != "harness" {
        clear_prompt_capture(&terminal.id);
        return;
    }

    let Some(prompt) = capture_first_prompt(&terminal.id, data) else {
        return;
    };

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal.id.clone();
    let workspace_id = terminal.workspace_id.clone();
    tauri::async_runtime::spawn(async move {
        let title = generate_title(&prompt)
            .await
            .unwrap_or_else(|_| fallback_title(&prompt));
        if title.is_empty() {
            return;
        }

        if let Err(error) =
            rename::maybe_apply_generated_terminal_label(&app, &db_path, &terminal_id, &title)
        {
            tracing::warn!("failed to apply generated terminal label {}: {error}", terminal_id);
        }

        if let Err(error) =
            rename::maybe_apply_generated_workspace_name(app.clone(), &db_path, &workspace_id, &title)
                .await
        {
            tracing::warn!(
                "failed to apply generated workspace name {}: {error}",
                workspace_id
            );
        }
    });
}

fn clear_prompt_capture(terminal_id: &str) {
    let mut registry = prompt_capture_registry().lock().unwrap();
    registry.remove(terminal_id);
}

fn capture_first_prompt(terminal_id: &str, data: &str) -> Option<String> {
    let mut registry = prompt_capture_registry().lock().unwrap();
    let state = registry.entry(terminal_id.to_string()).or_default();
    if state.captured {
        return None;
    }

    for ch in data.chars() {
        if state.in_escape_sequence {
            if ('@'..='~').contains(&ch) {
                state.in_escape_sequence = false;
            }
            continue;
        }

        match ch {
            '\u{1b}' => {
                state.in_escape_sequence = true;
            }
            '\u{3}' => {
                state.buffer.clear();
            }
            '\u{8}' | '\u{7f}' => {
                state.buffer.pop();
            }
            '\r' | '\n' => {
                let prompt = state.buffer.trim().to_string();
                state.buffer.clear();
                if prompt.is_empty() {
                    continue;
                }
                state.captured = true;
                return Some(prompt);
            }
            _ if ch.is_control() => {}
            _ => state.buffer.push(ch),
        }
    }

    None
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
    std::env::temp_dir().join(format!(
        "{prefix}-{}.{extension}",
        uuid::Uuid::new_v4()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_first_prompt_accumulates_until_submit() {
        let terminal_id = format!("title-test-{}", uuid::Uuid::new_v4());
        clear_prompt_capture(&terminal_id);

        assert_eq!(capture_first_prompt(&terminal_id, "fix workspace "), None);
        assert_eq!(
            capture_first_prompt(&terminal_id, "rename flow\r"),
            Some("fix workspace rename flow".to_string())
        );
        assert_eq!(capture_first_prompt(&terminal_id, "ignored\r"), None);
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
