use super::query::{
    get_agent_session_by_id, list_agent_session_messages as query_list_agent_session_messages,
    list_agent_sessions, AgentMessageRecord, AgentSessionRecord,
};
use crate::platform::db::{open_db, DbPath};
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::Deserialize;
use tauri::State;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentSessionInput {
    pub workspace_id: String,
    pub backend: String,
    pub runtime_kind: Option<String>,
    pub runtime_name: Option<String>,
    pub title: Option<String>,
    pub runtime_session_id: Option<String>,
}

fn normalize_backend(backend: &str) -> Result<&'static str, LifecycleError> {
    match backend.trim() {
        "claude" => Ok("claude"),
        "codex" => Ok("codex"),
        _ => Err(LifecycleError::InvalidInput {
            field: "backend".to_string(),
            reason: "expected 'claude' or 'codex'".to_string(),
        }),
    }
}

fn default_title_for_backend(backend: &str) -> &'static str {
    match backend {
        "claude" => "Claude Session",
        "codex" => "Codex Session",
        _ => "Agent Session",
    }
}

fn normalize_title(title: Option<String>, backend: &str) -> String {
    let normalized = title
        .unwrap_or_else(|| default_title_for_backend(backend).to_string())
        .trim()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        default_title_for_backend(backend).to_string()
    } else {
        normalized
    }
}

fn normalize_runtime_kind(runtime_kind: Option<String>) -> Result<&'static str, LifecycleError> {
    match runtime_kind.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        None => Ok("adapter"),
        Some("adapter") => Ok("adapter"),
        Some("native") => Ok("native"),
        Some(_) => Err(LifecycleError::InvalidInput {
            field: "runtimeKind".to_string(),
            reason: "expected 'native' or 'adapter'".to_string(),
        }),
    }
}

#[tauri::command]
pub async fn create_agent_session(
    db_path: State<'_, DbPath>,
    input: CreateAgentSessionInput,
) -> Result<AgentSessionRecord, LifecycleError> {
    let backend = normalize_backend(&input.backend)?;
    let workspace_id = input.workspace_id.trim().to_string();
    if workspace_id.is_empty() {
        return Err(LifecycleError::InvalidInput {
            field: "workspaceId".to_string(),
            reason: "workspace id is required".to_string(),
        });
    }

    let title = normalize_title(input.title, backend);
    let runtime_kind = normalize_runtime_kind(input.runtime_kind)?;
    let runtime_name = input
        .runtime_name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let runtime_session_id = input
        .runtime_session_id
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let agent_session_id = uuid::Uuid::new_v4().to_string();

    {
        let conn = open_db(&db_path.0)?;
        let workspace_exists: i64 = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspace WHERE id = ?1)",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;

        if workspace_exists == 0 {
            return Err(LifecycleError::WorkspaceNotFound(input.workspace_id));
        }

        conn.execute(
            "INSERT INTO agent_session (
                id, workspace_id, runtime_kind, runtime_name, backend, runtime_session_id, title, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                agent_session_id,
                workspace_id,
                runtime_kind,
                runtime_name,
                backend,
                runtime_session_id,
                title,
                "idle"
            ],
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    }

    get_agent_session_by_id(&db_path.0, agent_session_id)
        .await?
        .ok_or_else(|| {
            LifecycleError::Database(
                "agent session insert succeeded but row was missing".to_string(),
            )
        })
}

#[tauri::command]
pub async fn list_agent_sessions_for_workspace(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<AgentSessionRecord>, LifecycleError> {
    list_agent_sessions(&db_path.0, workspace_id).await
}

#[tauri::command]
pub async fn get_agent_session(
    db_path: State<'_, DbPath>,
    agent_session_id: String,
) -> Result<Option<AgentSessionRecord>, LifecycleError> {
    get_agent_session_by_id(&db_path.0, agent_session_id).await
}

#[tauri::command]
pub async fn list_agent_session_messages(
    db_path: State<'_, DbPath>,
    agent_session_id: String,
) -> Result<Vec<AgentMessageRecord>, LifecycleError> {
    query_list_agent_session_messages(&db_path.0, agent_session_id).await
}
