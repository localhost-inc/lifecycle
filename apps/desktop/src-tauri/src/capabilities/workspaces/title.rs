use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::Instant;
use tauri::AppHandle;

use super::harness::normalize_prompt_text;
use super::naming::{self, GeneratedTitle};
use super::rename::{self, TitleOrigin};
#[cfg(test)]
use super::{harness::read_first_prompt_from_session_reader, naming::fallback_terminal_title};

fn auto_title_registry() -> &'static Mutex<HashSet<String>> {
    static REGISTRY: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(HashSet::new()))
}

struct AutoTitleGuard {
    terminal_id: String,
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
    let should_generate = match should_generate_terminal_title(db_path, terminal_id) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(
                "failed to determine terminal title eligibility for terminal {}: {error}",
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
    let fallback_title = naming::fallback_terminal_title(&prompt);

    let Some(guard) = AutoTitleGuard::acquire(terminal_id) else {
        return;
    };

    tracing::info!(
        terminal_id,
        workspace_id,
        prompt_preview = %naming::prompt_preview(&prompt),
        fallback_title = %fallback_title,
        "terminal auto title generation scheduled"
    );

    let app = app.clone();
    let db_path = db_path.to_string();
    let terminal_id = terminal_id.to_string();
    let workspace_id = workspace_id.to_string();

    tauri::async_runtime::spawn(async move {
        let _guard = guard;
        let generation_started_at = Instant::now();
        let generated_title = naming::generate_terminal_title(&prompt)
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(
                    terminal_id,
                    workspace_id,
                    fallback_title = %fallback_title,
                    "terminal auto title generation failed, falling back to prompt title: {error}"
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
            "terminal auto title generation completed"
        );

        match rename::maybe_apply_generated_terminal_label(
            &app,
            &db_path,
            &terminal_id,
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
    });
}

fn should_generate_terminal_title(
    db_path: &str,
    terminal_id: &str,
) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT label_origin
         FROM terminal
         WHERE id = ?1
         LIMIT 1",
        params![terminal_id],
        |row| {
            let terminal_origin: String = row.get(0)?;
            Ok(terminal_origin == TitleOrigin::Default.as_str())
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(terminal_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
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
        assert_eq!(fallback_terminal_title("what is this"), "What is this");
        let expected = "X".to_string() + &"x".repeat(44) + "...";
        assert_eq!(fallback_terminal_title(&"x".repeat(60)), expected);
        assert_eq!(fallback_terminal_title("   "), "Agent session");
    }
}
