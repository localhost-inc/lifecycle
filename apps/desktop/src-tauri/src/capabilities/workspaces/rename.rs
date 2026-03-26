use crate::platform::{db::open_db, git::worktree};
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use rusqlite::params;
use tauri::AppHandle;

use super::query::{self, WorkspaceRecord};

/// All policy decisions (name normalization, branch rename disposition,
/// worktree move decision) are pre-computed by TypeScript. Rust only
/// executes the infrastructure operations instructed by the flags.
#[derive(Debug, Clone)]
pub(crate) struct RenameWorkspaceRequest {
    pub(crate) workspace_id: String,
    pub(crate) name: String,
    pub(crate) source_ref: String,
    pub(crate) name_origin: String,
    pub(crate) source_ref_origin: String,
    pub(crate) rename_branch: bool,
    pub(crate) move_worktree: bool,
}

struct WorkspaceRenameContext {
    current_name: String,
    current_source_ref: String,
    project_path: String,
    worktree_path: Option<String>,
}

pub async fn rename_workspace(
    app: &AppHandle,
    db_path: &str,
    request: RenameWorkspaceRequest,
) -> Result<WorkspaceRecord, LifecycleError> {
    let context = load_workspace_rename_context(db_path, &request.workspace_id)?;

    // Move worktree directory if instructed
    let mut next_worktree_path = context.worktree_path.clone();
    if request.move_worktree {
        if let Some(current_worktree_path) = context.worktree_path.as_deref() {
            next_worktree_path = Some(
                worktree::move_worktree(
                    &context.project_path,
                    current_worktree_path,
                    &request.name,
                    &request.workspace_id,
                )
                .await?,
            );
        }
    }

    // Rename git branch if instructed
    if request.rename_branch {
        let active_worktree_path =
            next_worktree_path
                .as_deref()
                .ok_or_else(|| LifecycleError::GitOperationFailed {
                    operation: "rename workspace branch".to_string(),
                    reason: "workspace is missing worktree_path".to_string(),
                })?;

        if let Err(error) = worktree::rename_workspace_branch(
            active_worktree_path,
            &context.current_source_ref,
            &request.source_ref,
        )
        .await
        {
            // Roll back worktree move on branch rename failure
            if let (Some(original_worktree_path), Some(moved_worktree_path)) = (
                context.worktree_path.as_deref(),
                next_worktree_path.as_deref(),
            ) {
                if original_worktree_path != moved_worktree_path {
                    if let Err(rollback_error) = worktree::move_worktree(
                        &context.project_path,
                        moved_worktree_path,
                        &context.current_name,
                        &request.workspace_id,
                    )
                    .await
                    {
                        return Err(LifecycleError::GitOperationFailed {
                            operation: "rename workspace branch".to_string(),
                            reason: format!(
                                "{error}; failed to roll back worktree move: {rollback_error}"
                            ),
                        });
                    }
                }
            }

            return Err(error);
        }
    }

    // Persist to DB
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace
         SET name = ?1,
             name_origin = ?2,
             source_ref = ?3,
             source_ref_origin = ?4,
             worktree_path = ?5,
             updated_at = datetime('now')
         WHERE id = ?6",
        params![
            request.name,
            request.name_origin,
            request.source_ref,
            request.source_ref_origin,
            next_worktree_path,
            request.workspace_id
        ],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let workspace = query::get_workspace_by_id(db_path, request.workspace_id.clone())
        .await?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(request.workspace_id))?;

    emit_workspace_renamed(app, &workspace);
    Ok(workspace)
}

fn load_workspace_rename_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceRenameContext, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT workspace.name, workspace.source_ref, workspace.worktree_path, project.path
         FROM workspace
         INNER JOIN project ON project.id = workspace.project_id
         WHERE workspace.id = ?1
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceRenameContext {
                current_name: row.get(0)?,
                current_source_ref: row.get(1)?,
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

fn emit_workspace_renamed(app: &AppHandle, workspace: &WorkspaceRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::WorkspaceRenamed {
            workspace_id: workspace.id.clone(),
            name: workspace.name.clone(),
            source_ref: workspace.source_ref.clone(),
            worktree_path: workspace.worktree_path.clone(),
        },
    );
}

// Policy tests (name normalization, branch rename disposition) now live in TypeScript.
// Infrastructure tests for the git operations remain in the worktree module.
