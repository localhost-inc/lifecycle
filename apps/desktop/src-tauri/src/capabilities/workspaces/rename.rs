use crate::platform::{db::open_db, git::worktree};
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use super::query::{self, TerminalRow, WorkspaceRow};
use super::terminal::load_terminal_row;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TitleOrigin {
    Default,
    Generated,
    Manual,
}

impl TitleOrigin {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Default => "default",
            Self::Generated => "generated",
            Self::Manual => "manual",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceRenamedEvent {
    workspace_id: String,
    name: String,
    worktree_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct TerminalRenamedEvent {
    terminal_id: String,
    workspace_id: String,
    label: String,
}

#[derive(Debug)]
struct WorkspaceRenameContext {
    current_name: String,
    name_origin: String,
    project_path: String,
    worktree_path: Option<String>,
}

#[derive(Debug)]
struct TerminalRenameContext {
    current_label: String,
    label_origin: String,
}

pub async fn rename_workspace(
    app: AppHandle,
    db_path: &str,
    workspace_id: &str,
    name: &str,
) -> Result<WorkspaceRow, LifecycleError> {
    update_workspace_name(app, db_path, workspace_id, name, TitleOrigin::Manual).await
}

pub fn rename_terminal(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
) -> Result<TerminalRow, LifecycleError> {
    update_terminal_label(app, db_path, terminal_id, label, TitleOrigin::Manual)
}

pub async fn maybe_apply_generated_workspace_name(
    app: AppHandle,
    db_path: &str,
    workspace_id: &str,
    name: &str,
) -> Result<Option<WorkspaceRow>, LifecycleError> {
    let context = load_workspace_rename_context(db_path, workspace_id)?;
    if context.name_origin == TitleOrigin::Manual.as_str() {
        return Ok(None);
    }

    drop(context);
    update_workspace_name(app, db_path, workspace_id, name, TitleOrigin::Generated)
        .await
        .map(Some)
}

pub fn maybe_apply_generated_terminal_label(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
) -> Result<Option<TerminalRow>, LifecycleError> {
    let context = load_terminal_rename_context(db_path, terminal_id)?;
    if context.label_origin == TitleOrigin::Manual.as_str() {
        return Ok(None);
    }

    drop(context);
    update_terminal_label(app, db_path, terminal_id, label, TitleOrigin::Generated).map(Some)
}

async fn update_workspace_name(
    app: AppHandle,
    db_path: &str,
    workspace_id: &str,
    name: &str,
    origin: TitleOrigin,
) -> Result<WorkspaceRow, LifecycleError> {
    let next_name = normalize_title_input("workspace name", name)?;
    let context = load_workspace_rename_context(db_path, workspace_id)?;

    let next_worktree_path = match context.worktree_path.as_deref() {
        Some(current_worktree_path) => Some(
            worktree::move_worktree(
                &context.project_path,
                current_worktree_path,
                &next_name,
                workspace_id,
            )
            .await?,
        ),
        None => None,
    };

    if context.current_name == next_name
        && context.name_origin == origin.as_str()
        && context.worktree_path == next_worktree_path
    {
        return query::get_workspace_by_id(db_path, workspace_id.to_string())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.to_string()));
    }

    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace
         SET name = ?1,
             name_origin = ?2,
             worktree_path = ?3,
             updated_at = datetime('now')
         WHERE id = ?4",
        params![next_name, origin.as_str(), next_worktree_path, workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let workspace = query::get_workspace_by_id(db_path, workspace_id.to_string())
        .await?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.to_string()))?;
    emit_workspace_renamed(&app, &workspace);
    Ok(workspace)
}

fn update_terminal_label(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
    origin: TitleOrigin,
) -> Result<TerminalRow, LifecycleError> {
    let next_label = normalize_title_input("session title", label)?;
    let context = load_terminal_rename_context(db_path, terminal_id)?;

    if context.current_label == next_label && context.label_origin == origin.as_str() {
        return load_terminal_row(db_path, terminal_id)?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()));
    }

    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET label = ?1,
             label_origin = ?2
         WHERE id = ?3",
        params![next_label, origin.as_str(), terminal_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let terminal = load_terminal_row(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    emit_terminal_renamed(app, &terminal);
    Ok(terminal)
}

fn load_workspace_rename_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceRenameContext, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT workspace.name, workspace.name_origin, workspace.worktree_path, project.path
         FROM workspace
         INNER JOIN project ON project.id = workspace.project_id
         WHERE workspace.id = ?1
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceRenameContext {
                current_name: row.get(0)?,
                name_origin: row.get(1)?,
                worktree_path: row.get(2)?,
                project_path: row.get(3)?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(workspace_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
}

fn load_terminal_rename_context(
    db_path: &str,
    terminal_id: &str,
) -> Result<TerminalRenameContext, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT label, label_origin
         FROM terminal
         WHERE id = ?1
         LIMIT 1",
        params![terminal_id],
        |row| {
            Ok(TerminalRenameContext {
                current_label: row.get(0)?,
                label_origin: row.get(1)?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => {
            LifecycleError::WorkspaceNotFound(terminal_id.to_string())
        }
        _ => LifecycleError::Database(error.to_string()),
    })
}

fn normalize_title_input(field: &str, value: &str) -> Result<String, LifecycleError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(LifecycleError::InvalidInput {
            field: field.to_string(),
            reason: "value cannot be empty".to_string(),
        });
    }

    let normalized = trimmed.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return Err(LifecycleError::InvalidInput {
            field: field.to_string(),
            reason: "value cannot be empty".to_string(),
        });
    }

    Ok(normalized.chars().take(64).collect())
}

fn emit_workspace_renamed(app: &AppHandle, workspace: &WorkspaceRow) {
    let _ = app.emit(
        "workspace:renamed",
        WorkspaceRenamedEvent {
            workspace_id: workspace.id.clone(),
            name: workspace.name.clone(),
            worktree_path: workspace.worktree_path.clone(),
        },
    );
}

fn emit_terminal_renamed(app: &AppHandle, terminal: &TerminalRow) {
    let _ = app.emit(
        "terminal:renamed",
        TerminalRenamedEvent {
            terminal_id: terminal.id.clone(),
            workspace_id: terminal.workspace_id.clone(),
            label: terminal.label.clone(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_title_input_rejects_blank_values() {
        let error = normalize_title_input("workspace name", "   ").expect_err("blank name fails");
        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "workspace name");
                assert_eq!(reason, "value cannot be empty");
            }
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn normalize_title_input_collapses_whitespace_and_limits_length() {
        assert_eq!(
            normalize_title_input("session title", "  Fix   terminal\tlabels  ")
                .expect("normalization succeeds"),
            "Fix terminal labels"
        );

        let long_value = "x".repeat(96);
        let normalized =
            normalize_title_input("session title", &long_value).expect("long title truncates");
        assert_eq!(normalized.len(), 64);
    }
}
