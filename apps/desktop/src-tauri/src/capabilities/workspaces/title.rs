use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tokio::process::Command;
use tokio::time::timeout;

use super::harness::normalize_prompt_text;
#[cfg(test)]
use super::harness::read_first_prompt_from_session_reader;
use super::rename::{self, TitleOrigin};

const TITLE_GENERATION_TIMEOUT: Duration = Duration::from_secs(8);

fn auto_title_registry() -> &'static Mutex<HashSet<String>> {
    static REGISTRY: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashSet::new()))
}

struct AutoTitleGuard {
    terminal_id: String,
}

struct GeneratedTitle {
    source: &'static str,
    title: String,
}

impl AutoTitleGuard {
    fn acquire(terminal_id: &str) -> Option<Self> {
        let mut registry = auto_title_registry().lock().unwrap();
        if !registry.insert(terminal_id.to_string()) {
            return None;
        }

        Some(Self {
            terminal_id: terminal_id.to_string(),
        })
    }
}

impl Drop for AutoTitleGuard {
    fn drop(&mut self) {
        let mut registry = auto_title_registry().lock().unwrap();
        registry.remove(&self.terminal_id);
    }
}

pub fn maybe_schedule_terminal_auto_title_from_prompt(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    prompt: &str,
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

    let Some(prompt) = normalize_prompt_text(prompt) else {
        return;
    };
    let fallback_title = fallback_title(&prompt);

    let Some(guard) = AutoTitleGuard::acquire(terminal_id) else {
        return;
    };

    tracing::info!(
        terminal_id,
        workspace_id,
        prompt_preview = %prompt_preview(&prompt),
        fallback_title = %fallback_title,
        "auto title generation scheduled"
    );

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal_id.to_string();
    let workspace_id = workspace_id.to_string();

    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let generation_started_at = Instant::now();
        let generated_title = generate_title(&prompt).await.unwrap_or_else(|error| {
            tracing::warn!(
                terminal_id,
                workspace_id,
                fallback_title = %fallback_title,
                "auto title generation failed, falling back to prompt title: {error}"
            );
            GeneratedTitle {
                source: "fallback",
                title: fallback_title.clone(),
            }
        });
        let elapsed_ms = generation_started_at.elapsed().as_millis() as u64;

        tracing::info!(
            terminal_id,
            workspace_id,
            source = generated_title.source,
            elapsed_ms,
            title = %generated_title.title,
            "auto title generation completed"
        );

        match rename::maybe_apply_generated_terminal_label(
            &app,
            &db_path,
            &terminal_id,
            &generated_title.title,
        ) {
            Ok(Some(_)) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    source = generated_title.source,
                    elapsed_ms,
                    "applied generated terminal title"
                );
            }
            Ok(None) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    "skipped generated terminal title because the user already renamed it"
                );
            }
            Err(error) => {
                tracing::warn!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    "failed to apply generated terminal label: {error}"
                );
            }
        }

        match rename::maybe_apply_generated_workspace_name(
            app.clone(),
            &db_path,
            &workspace_id,
            &generated_title.title,
        )
        .await
        {
            Ok(Some(_)) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    source = generated_title.source,
                    elapsed_ms,
                    "applied generated workspace title"
                );
            }
            Ok(None) => {
                tracing::info!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    "skipped generated workspace title because the user already renamed it"
                );
            }
            Err(error) => {
                tracing::warn!(
                    terminal_id,
                    workspace_id,
                    title = %generated_title.title,
                    "failed to apply generated workspace name: {error}"
                );
            }
        }
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

async fn generate_title(prompt: &str) -> Result<GeneratedTitle, LifecycleError> {
    if let Some(title) = run_claude_title_generator(prompt).await? {
        return Ok(GeneratedTitle {
            source: "claude-sonnet",
            title,
        });
    }

    if let Some(title) = run_codex_title_generator(prompt).await? {
        return Ok(GeneratedTitle {
            source: "codex",
            title,
        });
    }

    Ok(GeneratedTitle {
        source: "fallback",
        title: fallback_title(prompt),
    })
}

async fn run_claude_title_generator(prompt: &str) -> Result<Option<String>, LifecycleError> {
    let started_at = Instant::now();
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
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "claude title generator unavailable; falling back"
            );
            return Ok(None);
        }
        Ok(Err(error)) => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "claude title generator failed to launch: {error}"
            );
            return Ok(None);
        }
        Err(_) => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                timeout_ms = TITLE_GENERATION_TIMEOUT.as_millis() as u64,
                "claude title generator timed out"
            );
            return Ok(None);
        }
    };

    if !output.status.success() {
        tracing::info!(
            elapsed_ms = started_at.elapsed().as_millis() as u64,
            "claude title generator exited with status {}",
            output.status
        );
        return Ok(None);
    }

    let title = parse_title_json(&String::from_utf8_lossy(&output.stdout));
    tracing::info!(
        elapsed_ms = started_at.elapsed().as_millis() as u64,
        has_title = title.is_some(),
        "claude title generator completed"
    );
    Ok(title)
}

async fn run_codex_title_generator(prompt: &str) -> Result<Option<String>, LifecycleError> {
    let started_at = Instant::now();
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
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "codex title generator unavailable; falling back"
            );
            return Ok(None);
        }
        Ok(Err(error)) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "codex title generator failed to launch: {error}"
            );
            return Ok(None);
        }
        Err(_) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                timeout_ms = TITLE_GENERATION_TIMEOUT.as_millis() as u64,
                "codex title generator timed out"
            );
            return Ok(None);
        }
    };

    let _ = std::fs::remove_file(&schema_path);

    if !command_output.status.success() {
        let _ = std::fs::remove_file(&output_path);
        tracing::info!(
            elapsed_ms = started_at.elapsed().as_millis() as u64,
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

    let title = parse_title_json(&output);
    tracing::info!(
        elapsed_ms = started_at.elapsed().as_millis() as u64,
        has_title = title.is_some(),
        "codex title generator completed"
    );
    Ok(title)
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
    truncate_title(prompt, 48)
}

fn prompt_preview(prompt: &str) -> String {
    truncate_title(prompt, 72)
}

fn truncate_title(value: &str, limit: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return "Agent Session".to_string();
    }

    let chars = trimmed.chars().collect::<Vec<_>>();
    if chars.len() <= limit {
        return trimmed.to_string();
    }

    let truncated = chars
        .into_iter()
        .take(limit.saturating_sub(3))
        .collect::<String>();
    format!("{truncated}...")
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
    fn fallback_title_uses_truncated_prompt_text() {
        assert_eq!(fallback_title("what is this"), "what is this");
        assert_eq!(
            fallback_title(&"x".repeat(60)),
            format!("{}...", "x".repeat(45))
        );
        assert_eq!(fallback_title("   "), "Agent Session");
    }

    #[test]
    fn prompt_preview_truncates_long_prompts() {
        assert_eq!(prompt_preview("short prompt"), "short prompt");
        assert!(prompt_preview(&"x".repeat(100)).ends_with("..."));
    }
}
