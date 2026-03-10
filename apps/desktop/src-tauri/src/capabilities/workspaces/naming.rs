use crate::shared::errors::LifecycleError;
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tokio::process::Command;
use tokio::time::timeout;

// Shared timeout for the structured Codex requests that generate terminal titles and
// first-prompt workspace identity.
const TITLE_GENERATION_TIMEOUT: Duration = Duration::from_secs(15);
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
    if let Some(title) = generate_with_codex(
        &terminal_title_prompt(prompt),
        TERMINAL_TITLE_SCHEMA,
        parse_title_json,
    )
    .await?
    {
        return Ok(GeneratedTitle {
            source: "codex",
            title,
        });
    }

    Ok(GeneratedTitle {
        source: "fallback",
        title: fallback_terminal_title(prompt),
    })
}

pub(super) async fn generate_identity_titles(
    prompt: &str,
) -> Result<Option<GeneratedIdentityTitles>, LifecycleError> {
    let Some((workspace_title, session_title)) = generate_with_codex(
        &workspace_identity_prompt(prompt),
        WORKSPACE_IDENTITY_SCHEMA,
        parse_identity_titles_json,
    )
    .await?
    else {
        return Ok(None);
    };

    Ok(Some(GeneratedIdentityTitles {
        source: "codex",
        workspace_title,
        session_title,
    }))
}

pub(super) fn fallback_terminal_title(prompt: &str) -> String {
    title_case_title(&truncate_title(prompt, 48))
}

pub(super) fn prompt_preview(prompt: &str) -> String {
    truncate_title(prompt, 72)
}

async fn generate_with_codex<T, F>(
    prompt_text: &str,
    schema_json: &str,
    parser: F,
) -> Result<Option<T>, LifecycleError>
where
    F: Fn(&str) -> Option<T>,
{
    if let Some(output) = run_codex_json_generator(prompt_text, schema_json).await? {
        if let Some(parsed) = parser(&output) {
            return Ok(Some(parsed));
        }

        tracing::warn!("codex naming generator returned unparseable schema output");
    }

    Ok(None)
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
    let codex_mcp_servers = read_codex_mcp_server_names();
    let mut args = vec![
        "exec".to_string(),
        "--skip-git-repo-check".to_string(),
        "--sandbox".to_string(),
        "read-only".to_string(),
        "--color".to_string(),
        "never".to_string(),
        "--ephemeral".to_string(),
        "-c".to_string(),
        r#"model_reasoning_effort="medium""#.to_string(),
    ];
    args.extend(build_codex_no_mcp_args(&codex_mcp_servers));
    args.push("--output-schema".to_string());
    args.push(schema_path_string.clone());
    args.push("--output-last-message".to_string());
    args.push(output_path_string.clone());
    args.push(prompt_text.to_string());

    let result = timeout(
        TITLE_GENERATION_TIMEOUT,
        Command::new("codex").args(&args).output(),
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
        disabled_mcp_servers = codex_mcp_servers.len(),
        "codex naming generator completed"
    );
    Ok(Some(output))
}

fn read_codex_mcp_server_names() -> Vec<String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Vec::new();
    };
    let config_path = PathBuf::from(home).join(".codex").join("config.toml");
    let Ok(config_contents) = std::fs::read_to_string(config_path) else {
        return Vec::new();
    };

    parse_codex_mcp_server_names(&config_contents)
}

fn parse_codex_mcp_server_names(config_contents: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut seen = HashSet::new();

    for line in config_contents.lines() {
        let trimmed = line.trim();
        let Some(remainder) = trimmed.strip_prefix("[mcp_servers.") else {
            continue;
        };
        let Some(name) = remainder.strip_suffix(']') else {
            continue;
        };
        let name = name.trim();
        if name.is_empty() {
            continue;
        }

        let name = name.to_string();
        if seen.insert(name.clone()) {
            names.push(name);
        }
    }

    names.sort();
    names
}

fn build_codex_no_mcp_args(server_names: &[String]) -> Vec<String> {
    let mut args = Vec::with_capacity((server_names.len() + 1) * 2);
    for server_name in server_names {
        args.push("-c".to_string());
        args.push(format!(
            "mcp_servers.{}.enabled=false",
            codex_config_key_segment(server_name)
        ));
    }

    args.push("-c".to_string());
    args.push("features.apps=false".to_string());
    args
}

fn codex_config_key_segment(server_name: &str) -> String {
    if server_name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '-')
    {
        return server_name.to_string();
    }

    format!("\"{}\"", server_name.replace('"', "\\\""))
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
        "Return JSON only.\nCreate a concise 2-4 word terminal session title for this coding task.\nUse plain title case text.\nTask: {prompt}"
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
    title_case_title(&collapsed).chars().take(48).collect()
}

fn title_case_title(value: &str) -> String {
    let mut titled = String::with_capacity(value.len());
    let mut segment = String::new();

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            segment.push(character);
            continue;
        }

        if !segment.is_empty() {
            titled.push_str(&title_case_segment(&segment));
            segment.clear();
        }

        titled.push(character);
    }

    if !segment.is_empty() {
        titled.push_str(&title_case_segment(&segment));
    }

    titled
}

fn title_case_segment(segment: &str) -> String {
    let uppercase_or_digit_count = segment
        .chars()
        .filter(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
        .count();

    if uppercase_or_digit_count == segment.len()
        && uppercase_or_digit_count > 0
        && segment.len() <= 5
    {
        return segment.to_string();
    }

    let mut characters = segment.chars();
    let Some(first) = characters.next() else {
        return String::new();
    };

    let mut titled = String::new();
    titled.extend(first.to_uppercase());
    for character in characters {
        titled.extend(character.to_lowercase());
    }
    titled
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
        assert_eq!(fallback_terminal_title("what is this"), "What Is This");
        let expected = "X".to_string() + &"x".repeat(44) + "...";
        assert_eq!(
            fallback_terminal_title(&"x".repeat(60)),
            expected
        );
        assert_eq!(fallback_terminal_title("   "), "Agent Session");
    }

    #[test]
    fn sanitize_generated_title_normalizes_to_title_case() {
        assert_eq!(
            sanitize_generated_title("  notification improvements  "),
            "Notification Improvements"
        );
        assert_eq!(sanitize_generated_title("API cleanup"), "API Cleanup");
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
                r#"{"workspace_title":"fix auth callback","session_title":"auth callback"}"#
            ),
            Some(("Fix Auth Callback".to_string(), "Auth Callback".to_string()))
        );
        assert!(parse_identity_titles_json(r#"{"workspace_title":"Only One"}"#).is_none());
    }

    #[test]
    fn parse_title_json_supports_structured_output_wrapper() {
        assert_eq!(
            parse_title_json(r#"{"type":"result","structured_output":{"title":"fix auth flow"}}"#),
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

    #[test]
    fn parse_codex_mcp_server_names_reads_unique_sorted_servers() {
        let config = r#"
model = "gpt-5.4"

[mcp_servers.paper]
url = "http://127.0.0.1:29979/mcp"

[mcp_servers.linear]
url = "https://mcp.linear.app/mcp"

[mcp_servers.paper]
url = "http://127.0.0.1:29979/mcp"
"#;

        assert_eq!(
            parse_codex_mcp_server_names(config),
            vec!["linear".to_string(), "paper".to_string()]
        );
    }
}
