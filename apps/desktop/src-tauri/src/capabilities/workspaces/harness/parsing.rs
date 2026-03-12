use serde_json::Value;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
#[cfg(test)]
use std::io::BufRead;
use std::time::SystemTime;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use super::HARNESS_SESSION_CAPTURE_GRACE;

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

pub(in crate::capabilities::workspaces::harness) fn extract_text_from_message_content(
    message: &Value,
) -> Option<String> {
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

pub(in crate::capabilities::workspaces::harness) fn build_harness_event_key(
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

pub(in crate::capabilities::workspaces::harness) fn json_string_at_path<'a>(
    value: &'a Value,
    path: &[&str],
) -> Option<&'a str> {
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
    let adapter = super::providers::resolve_harness_adapter(Some(harness_provider))?;
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
