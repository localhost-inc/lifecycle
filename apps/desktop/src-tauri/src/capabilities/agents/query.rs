use crate::capabilities::workspaces::harness::{
    resolve_harness_adapter, resolve_harness_session_log_path,
};
use crate::capabilities::workspaces::terminal::{
    load_terminal_record,
    load_terminal_workspace_context, resolve_harness_worktree_path,
};
use crate::platform::db::{open_db, run_blocking_db_read};
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

#[cfg(test)]
use crate::platform::db::run_migrations;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSessionRecord {
    pub id: String,
    pub workspace_id: String,
    pub runtime_kind: String,
    pub runtime_name: Option<String>,
    pub backend: String,
    pub runtime_session_id: Option<String>,
    pub title: String,
    pub status: String,
    pub created_by: Option<String>,
    pub forked_from_session_id: Option<String>,
    pub last_message_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessageRecord {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub text: String,
    pub turn_id: Option<String>,
}

fn map_agent_session_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentSessionRecord> {
    Ok(AgentSessionRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        runtime_kind: row.get(2)?,
        runtime_name: row.get(3)?,
        backend: row.get(4)?,
        runtime_session_id: row.get(5)?,
        title: row.get(6)?,
        status: row.get(7)?,
        created_by: row.get(8)?,
        forked_from_session_id: row.get(9)?,
        last_message_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        ended_at: row.get(13)?,
    })
}

fn json_string_at_path<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }

    current.as_str()
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

    (!fragments.is_empty()).then(|| fragments.join("\n"))
}

fn normalize_agent_message_text(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    Some(trimmed.to_string())
}

fn parse_claude_message(
    value: &Value,
    fallback_id: &str,
    session_id: &str,
) -> Option<AgentMessageRecord> {
    let event_type = json_string_at_path(value, &["type"])?;
    if value
        .get("isMeta")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return None;
    }

    let message = value.get("message")?;
    let role = json_string_at_path(message, &["role"])?;
    if !matches!((event_type, role), ("user", "user") | ("assistant", "assistant")) {
        return None;
    }

    let text = normalize_agent_message_text(&extract_text_from_message_content(message)?)?;
    let id = json_string_at_path(message, &["id"])
        .or_else(|| json_string_at_path(value, &["uuid"]))
        .unwrap_or(fallback_id)
        .to_string();

    Some(AgentMessageRecord {
        id,
        session_id: session_id.to_string(),
        role: role.to_string(),
        text,
        turn_id: json_string_at_path(message, &["id"])
            .or_else(|| json_string_at_path(value, &["uuid"]))
            .map(ToString::to_string),
    })
}

fn parse_codex_message(
    value: &Value,
    fallback_id: &str,
    session_id: &str,
) -> Option<AgentMessageRecord> {
    if json_string_at_path(value, &["type"]) == Some("event_msg")
        && json_string_at_path(value, &["payload", "type"]) == Some("user_message")
    {
        let text = normalize_agent_message_text(
            value.get("payload")?.get("message")?.as_str()?,
        )?;
        let id = json_string_at_path(value, &["payload", "turn_id"])
            .or_else(|| json_string_at_path(value, &["uuid"]))
            .unwrap_or(fallback_id)
            .to_string();

        return Some(AgentMessageRecord {
            id,
            session_id: session_id.to_string(),
            role: "user".to_string(),
            text,
            turn_id: json_string_at_path(value, &["payload", "turn_id"]).map(ToString::to_string),
        });
    }

    if json_string_at_path(value, &["type"]) != Some("message") {
        return None;
    }

    let role = json_string_at_path(value, &["role"])?;
    if !matches!(role, "user" | "assistant") {
        return None;
    }

    let text = normalize_agent_message_text(&extract_text_from_message_content(value)?)?;
    let id = json_string_at_path(value, &["id"])
        .or_else(|| json_string_at_path(value, &["uuid"]))
        .unwrap_or(fallback_id)
        .to_string();

    Some(AgentMessageRecord {
        id,
        session_id: session_id.to_string(),
        role: role.to_string(),
        text,
        turn_id: json_string_at_path(value, &["id"])
            .or_else(|| json_string_at_path(value, &["uuid"]))
            .map(ToString::to_string),
    })
}

fn parse_agent_message_record(
    provider: &str,
    value: &Value,
    fallback_id: &str,
    session_id: &str,
) -> Option<AgentMessageRecord> {
    match provider {
        "claude" => parse_claude_message(value, fallback_id, session_id),
        "codex" => parse_codex_message(value, fallback_id, session_id),
        _ => None,
    }
}

fn read_agent_message_records(
    session_id: &str,
    provider: &str,
    session_log_path: &Path,
) -> Result<Vec<AgentMessageRecord>, LifecycleError> {
    let file =
        File::open(session_log_path).map_err(|error| LifecycleError::Database(error.to_string()))?;
    let reader = BufReader::new(file);
    let mut messages = Vec::new();

    for (index, line_result) in reader.lines().enumerate() {
        let line = line_result.map_err(|error| LifecycleError::Database(error.to_string()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(value) = serde_json::from_str::<Value>(trimmed) else {
            continue;
        };

        if let Some(message) = parse_agent_message_record(
            provider,
            &value,
            &format!("{provider}:message:{index}"),
            session_id,
        ) {
            messages.push(message);
        }
    }

    Ok(messages)
}

fn list_agent_sessions_sync(
    conn: &rusqlite::Connection,
    workspace_id: String,
) -> Result<Vec<AgentSessionRecord>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id, title, status, created_by, forked_from_session_id, last_message_at, created_at, updated_at, ended_at
             FROM agent_session
             WHERE workspace_id = ?1
             ORDER BY updated_at DESC, created_at DESC",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let rows = stmt
        .query_map(params![workspace_id], map_agent_session_record)
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }

    Ok(sessions)
}

pub async fn list_agent_sessions(
    db_path: &str,
    workspace_id: String,
) -> Result<Vec<AgentSessionRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "agent_session.list", move |conn| {
        list_agent_sessions_sync(conn, workspace_id)
    })
    .await
}

fn get_agent_session_by_id_sync(
    conn: &rusqlite::Connection,
    agent_session_id: String,
) -> Result<Option<AgentSessionRecord>, LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id, title, status, created_by, forked_from_session_id, last_message_at, created_at, updated_at, ended_at
             FROM agent_session
             WHERE id = ?1
             LIMIT 1",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    match stmt.query_row(params![agent_session_id], map_agent_session_record) {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub async fn get_agent_session_by_id(
    db_path: &str,
    agent_session_id: String,
) -> Result<Option<AgentSessionRecord>, LifecycleError> {
    run_blocking_db_read(
        db_path.to_string(),
        "agent_session.get_by_id",
        move |conn| get_agent_session_by_id_sync(conn, agent_session_id),
    )
    .await
}

fn list_agent_session_messages_sync(
    db_path: &str,
    agent_session_id: String,
) -> Result<Vec<AgentMessageRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
    let Some(session) = get_agent_session_by_id_sync(&conn, agent_session_id.clone())? else {
        return Ok(Vec::new());
    };

    let Some(terminal_id) = session.runtime_session_id.as_deref() else {
        return Ok(Vec::new());
    };
    let Some(terminal) = load_terminal_record(db_path, terminal_id)? else {
        return Ok(Vec::new());
    };
    let Some(provider_name) = terminal.harness_provider.as_deref() else {
        return Ok(Vec::new());
    };
    let Some(harness_session_id) = terminal.harness_session_id.as_deref() else {
        return Ok(Vec::new());
    };
    let Some(provider) = resolve_harness_adapter(Some(provider_name)) else {
        return Ok(Vec::new());
    };
    let workspace = load_terminal_workspace_context(db_path, &terminal.workspace_id)?;
    let worktree_path = resolve_harness_worktree_path(&workspace);
    let session_log_path = resolve_harness_session_log_path(
        provider,
        &worktree_path,
        harness_session_id,
        None,
    );

    let Some(session_log_path) = session_log_path else {
        return Ok(Vec::new());
    };

    read_agent_message_records(&session.id, provider_name, &session_log_path)
}

pub async fn list_agent_session_messages(
    db_path: &str,
    agent_session_id: String,
) -> Result<Vec<AgentMessageRecord>, LifecycleError> {
    let db_path = db_path.to_string();
    run_blocking_db_read(
        db_path.clone(),
        "agent_session.list_messages",
        move |_conn| list_agent_session_messages_sync(&db_path, agent_session_id),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn claude_workspace_dir_name(worktree_path: &str) -> String {
        worktree_path
            .chars()
            .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
            .collect()
    }

    fn temp_db_path() -> String {
        let path = std::env::temp_dir().join(format!(
            "lifecycle-agent-session-query-{}.db",
            uuid::Uuid::new_v4()
        ));
        path.to_string_lossy().into_owned()
    }

    fn seed_workspace(db_path: &str, workspace_id: &str) {
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path)
             VALUES (?1, ?2, ?3, ?4)",
            params![workspace_id, "project_1", "main", "/tmp/project_1/worktree"],
        )
        .expect("insert workspace");
    }

    #[tokio::test]
    async fn list_agent_sessions_returns_workspace_sessions() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO agent_session (
                id, workspace_id, runtime_kind, runtime_name, backend, title, status, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))",
            params![
                "agent_session_1",
                "workspace_1",
                "adapter",
                "claude",
                "claude",
                "Claude Session",
                "idle"
            ],
        )
        .expect("insert agent session");
        drop(conn);

        let sessions = list_agent_sessions(&db_path, "workspace_1".to_string())
            .await
            .expect("list sessions");

        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].backend, "claude");
        assert_eq!(sessions[0].title, "Claude Session");

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn get_agent_session_by_id_returns_inserted_session() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO agent_session (
                id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id, title, status, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                "agent_session_1",
                "workspace_1",
                "adapter",
                "codex",
                "codex",
                "thread_123",
                "Codex Session",
                "running"
            ],
        )
        .expect("insert agent session");
        drop(conn);

        let session = get_agent_session_by_id(&db_path, "agent_session_1".to_string())
            .await
            .expect("get session")
            .expect("session exists");

        assert_eq!(session.backend, "codex");
        assert_eq!(session.runtime_session_id.as_deref(), Some("thread_123"));

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn list_agent_session_messages_reads_claude_messages_from_harness_log() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");

        let temp_home = std::env::temp_dir().join(format!(
            "lifecycle-agent-session-home-{}",
            uuid::Uuid::new_v4()
        ));
        let previous_home = std::env::var_os("HOME");
        fs::create_dir_all(&temp_home).expect("create temp home");
        // SAFETY: tests run this in a narrow scope and restore HOME before returning.
        unsafe {
            std::env::set_var("HOME", &temp_home);
        }

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO terminal (
                id, workspace_id, launch_type, harness_provider, harness_session_id, label, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "terminal_1",
                "workspace_1",
                "harness",
                "claude",
                "claude-session-1",
                "Claude",
                "active"
            ],
        )
        .expect("insert terminal");
        conn.execute(
            "INSERT INTO agent_session (
                id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id, title, status, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                "agent_session_1",
                "workspace_1",
                "native",
                "harness_terminal",
                "claude",
                "terminal_1",
                "Claude Session",
                "idle"
            ],
        )
        .expect("insert agent session");
        drop(conn);

        let session_log_dir = temp_home
            .join(".claude/projects")
            .join(claude_workspace_dir_name("/tmp/project_1/worktree"));
        let session_log_path = session_log_dir.join("claude-session-1.jsonl");
        fs::create_dir_all(session_log_dir).expect("create session log dir");
        fs::write(
            &session_log_path,
            concat!(
                "{\"type\":\"user\",\"message\":{\"id\":\"turn-1-user\",\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Inspect src/main.ts\"}]}}\n",
                "{\"type\":\"assistant\",\"message\":{\"id\":\"turn-1-assistant\",\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"I am checking src/main.ts now.\"}]}}\n"
            ),
        )
        .expect("write session log");

        let messages = list_agent_session_messages(&db_path, "agent_session_1".to_string())
            .await
            .expect("list messages");

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[0].text, "Inspect src/main.ts");
        assert_eq!(messages[1].role, "assistant");
        assert_eq!(messages[1].text, "I am checking src/main.ts now.");

        if let Some(home) = previous_home {
            // SAFETY: restoring the previous process HOME value after this test scope.
            unsafe {
                std::env::set_var("HOME", home);
            }
        } else {
            // SAFETY: removing the temporary HOME override after this test scope.
            unsafe {
                std::env::remove_var("HOME");
            }
        }

        let _ = fs::remove_file(db_path);
        let _ = fs::remove_dir_all(temp_home);
    }
}
