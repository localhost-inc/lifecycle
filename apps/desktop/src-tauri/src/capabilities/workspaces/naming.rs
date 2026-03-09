use crate::shared::errors::LifecycleError;
use serde_json::Value;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::time::timeout;

const TITLE_GENERATION_TIMEOUT: Duration = Duration::from_secs(8);
const TERMINAL_TITLE_SCHEMA: &str = r#"{"type":"object","properties":{"title":{"type":"string"}},"required":["title"],"additionalProperties":false}"#;
const WORKSPACE_IDENTITY_SCHEMA: &str = r#"{"type":"object","properties":{"workspace_title":{"type":"string"},"session_title":{"type":"string"}},"required":["workspace_title","session_title"],"additionalProperties":false}"#;

#[derive(Debug, Clone)]
pub(super) struct GeneratedTitle {
    pub(super) source: &'static str,
    pub(super) title: String,
}

#[derive(Debug, Clone)]
pub(super) struct GeneratedIdentityTitles {
    pub(super) source: &'static str,
    pub(super) workspace_title: String,
    pub(super) session_title: String,
}

pub(super) async fn generate_terminal_title(
    prompt: &str,
) -> Result<GeneratedTitle, LifecycleError> {
    if let Some((source, title)) = generate_with_fallback(
        &terminal_title_prompt(prompt),
        TERMINAL_TITLE_SCHEMA,
        parse_title_json,
    )
    .await?
    {
        return Ok(GeneratedTitle { source, title });
    }

    Ok(GeneratedTitle {
        source: "fallback",
        title: fallback_terminal_title(prompt),
    })
}

pub(super) async fn generate_identity_titles(
    prompt: &str,
) -> Result<Option<GeneratedIdentityTitles>, LifecycleError> {
    let Some((source, (workspace_title, session_title))) = generate_with_fallback(
        &workspace_identity_prompt(prompt),
        WORKSPACE_IDENTITY_SCHEMA,
        parse_identity_titles_json,
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(Some(GeneratedIdentityTitles {
        source,
        workspace_title,
        session_title,
    }))
}

pub(super) fn fallback_terminal_title(prompt: &str) -> String {
    truncate_title(prompt, 48)
}

pub(super) fn prompt_preview(prompt: &str) -> String {
    truncate_title(prompt, 72)
}

async fn generate_with_fallback<T, F>(
    prompt_text: &str,
    schema_json: &str,
    parser: F,
) -> Result<Option<(&'static str, T)>, LifecycleError>
where
    F: Fn(&str) -> Option<T>,
{
    if let Some(output) = run_claude_json_generator(prompt_text, schema_json).await? {
        if let Some(parsed) = parser(&output) {
            return Ok(Some(("claude-sonnet", parsed)));
        }

        tracing::warn!("claude naming generator returned unparseable schema output");
    }

    if let Some(output) = run_codex_json_generator(prompt_text, schema_json).await? {
        if let Some(parsed) = parser(&output) {
            return Ok(Some(("codex", parsed)));
        }

        tracing::warn!("codex naming generator returned unparseable schema output");
    }

    Ok(None)
}

async fn run_claude_json_generator(
    prompt_text: &str,
    schema_json: &str,
) -> Result<Option<String>, LifecycleError> {
    let started_at = Instant::now();
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
                schema_json,
                prompt_text,
            ])
            .output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "claude naming generator unavailable; falling back"
            );
            return Ok(None);
        }
        Ok(Err(error)) => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "claude naming generator failed to launch: {error}"
            );
            return Ok(None);
        }
        Err(_) => {
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                timeout_ms = TITLE_GENERATION_TIMEOUT.as_millis() as u64,
                "claude naming generator timed out"
            );
            return Ok(None);
        }
    };

    if !output.status.success() {
        tracing::info!(
            elapsed_ms = started_at.elapsed().as_millis() as u64,
            "claude naming generator exited with status {}",
            output.status
        );
        return Ok(None);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    tracing::info!(
        elapsed_ms = started_at.elapsed().as_millis() as u64,
        "claude naming generator completed"
    );
    Ok(Some(stdout))
}

async fn run_codex_json_generator(
    prompt_text: &str,
    schema_json: &str,
) -> Result<Option<String>, LifecycleError> {
    let started_at = Instant::now();
    let schema_path = temp_file_path("lifecycle-title-schema", "json");
    let output_path = temp_file_path("lifecycle-title-output", "json");
    let schema_path_string = schema_path.to_string_lossy().to_string();
    let output_path_string = output_path.to_string_lossy().to_string();
    std::fs::write(&schema_path, schema_json)
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
                prompt_text,
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
                "codex naming generator unavailable; falling back"
            );
            return Ok(None);
        }
        Ok(Err(error)) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                "codex naming generator failed to launch: {error}"
            );
            return Ok(None);
        }
        Err(_) => {
            let _ = std::fs::remove_file(&schema_path);
            tracing::info!(
                elapsed_ms = started_at.elapsed().as_millis() as u64,
                timeout_ms = TITLE_GENERATION_TIMEOUT.as_millis() as u64,
                "codex naming generator timed out"
            );
            return Ok(None);
        }
    };

    let _ = std::fs::remove_file(&schema_path);

    if !command_output.status.success() {
        let _ = std::fs::remove_file(&output_path);
        tracing::info!(
            elapsed_ms = started_at.elapsed().as_millis() as u64,
            "codex naming generator exited with status {}",
            command_output.status
        );
        return Ok(None);
    }

    let output = match std::fs::read_to_string(&output_path) {
        Ok(output) => output,
        Err(_) => return Ok(None),
    };
    let _ = std::fs::remove_file(&output_path);

    tracing::info!(
        elapsed_ms = started_at.elapsed().as_millis() as u64,
        "codex naming generator completed"
    );
    Ok(Some(output))
}

fn parse_title_json(output: &str) -> Option<String> {
    let value = serde_json::from_str::<Value>(output).ok()?;
    let payload = schema_payload(&value);
    let title = payload.get("title")?.as_str()?;
    let sanitized = sanitize_generated_title(title);
    (!sanitized.is_empty()).then_some(sanitized)
}

fn parse_identity_titles_json(output: &str) -> Option<(String, String)> {
    let value = serde_json::from_str::<Value>(output).ok()?;
    let payload = schema_payload(&value);
    let workspace_title = sanitize_generated_title(payload.get("workspace_title")?.as_str()?);
    let session_title = sanitize_generated_title(payload.get("session_title")?.as_str()?);
    if workspace_title.is_empty() || session_title.is_empty() {
        return None;
    }

    Some((workspace_title, session_title))
}

fn schema_payload<'a>(value: &'a Value) -> &'a Value {
    value
        .get("structured_output")
        .filter(|payload| payload.is_object())
        .unwrap_or(value)
}

fn terminal_title_prompt(prompt: &str) -> String {
    format!(
        "Return JSON only.\nCreate a concise 2-4 word terminal session title for this coding task.\nTask: {prompt}"
    )
}

fn workspace_identity_prompt(prompt: &str) -> String {
    format!(
        "Return JSON only.\nCreate concise names for a coding workspace from the user's first task prompt.\n- workspace_title: 2-4 word durable workspace/worktree/branch identity.\n- session_title: 2-4 word terminal session tab title.\nUse plain title case text.\nTask: {prompt}"
    )
}

fn sanitize_generated_title(value: &str) -> String {
    let trimmed = value.trim().trim_matches('"').trim_matches('\'');
    let collapsed = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(48).collect()
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

    #[test]
    fn fallback_terminal_title_uses_prompt_truncation() {
        assert_eq!(fallback_terminal_title("what is this"), "what is this");
        assert_eq!(
            fallback_terminal_title(&"x".repeat(60)),
            format!("{}...", "x".repeat(45))
        );
        assert_eq!(fallback_terminal_title("   "), "Agent Session");
    }

    #[test]
    fn prompt_preview_truncates_long_prompts() {
        assert_eq!(prompt_preview("short prompt"), "short prompt");
        assert!(prompt_preview(&"x".repeat(100)).ends_with("..."));
    }

    #[test]
    fn parse_identity_titles_json_requires_both_titles() {
        assert_eq!(
            parse_identity_titles_json(
                r#"{"workspace_title":"Fix Auth Callback","session_title":"Auth Callback"}"#
            ),
            Some(("Fix Auth Callback".to_string(), "Auth Callback".to_string()))
        );
        assert!(parse_identity_titles_json(r#"{"workspace_title":"Only One"}"#).is_none());
    }

    #[test]
    fn parse_title_json_supports_structured_output_wrapper() {
        assert_eq!(
            parse_title_json(r#"{"type":"result","structured_output":{"title":"Fix Auth Flow"}}"#),
            Some("Fix Auth Flow".to_string())
        );
    }

    #[test]
    fn parse_identity_titles_json_supports_structured_output_wrapper() {
        assert_eq!(
            parse_identity_titles_json(
                r#"{"type":"result","structured_output":{"workspace_title":"Auth Callback","session_title":"Fix Callback"}}"#
            ),
            Some(("Auth Callback".to_string(), "Fix Callback".to_string()))
        );
    }
}
