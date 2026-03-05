use crate::platform::db::{open_db, DbPath};
use crate::platform::git::worktree;
use crate::shared::errors::{LifecycleError, WorkspaceFailureReason, WorkspaceStatus};
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{emit_workspace_status, update_workspace_status_db};

pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    project_id: String,
    source_ref: String,
    project_path: String,
) -> Result<String, LifecycleError> {
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let db = db_path.0.clone();

    // Insert workspace row
    {
        let conn = open_db(&db)?;
        conn.execute(
            "INSERT INTO workspaces (id, project_id, source_ref, status, mode) VALUES (?1, ?2, ?3, 'creating', 'local')",
            params![workspace_id, project_id, source_ref],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    emit_workspace_status(&app, &workspace_id, "creating", None);

    // Spawn background worktree creation
    let ws_id = workspace_id.clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        if let Err(e) =
            run_workspace_creation(&app_handle, &db, &ws_id, &source_ref, &project_path).await
        {
            tracing::error!("Workspace creation failed for {}: {e}", ws_id);
        }
    });

    Ok(workspace_id)
}

async fn run_workspace_creation(
    app: &AppHandle,
    db_path: &str,
    workspace_id: &str,
    source_ref: &str,
    project_path: &str,
) -> Result<(), LifecycleError> {
    // Create git worktree
    let worktree_path =
        match worktree::create_worktree(project_path, source_ref, workspace_id).await {
            Ok(path) => path,
            Err(e) => {
                update_workspace_status_db(
                    db_path,
                    workspace_id,
                    &WorkspaceStatus::Failed,
                    Some(&WorkspaceFailureReason::RepoCloneFailed),
                )?;
                emit_workspace_status(app, workspace_id, "failed", Some("repo_clone_failed"));
                return Err(e);
            }
        };

    // Record worktree path + git SHA
    let git_sha = worktree::get_sha(project_path, source_ref)
        .await
        .unwrap_or_default();
    {
        let conn = open_db(db_path)?;
        conn.execute(
            "UPDATE workspaces SET worktree_path = ?1, git_sha = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![worktree_path, git_sha, workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    // Workspace created — transition to sleeping (services not yet started)
    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Sleeping, None)?;
    emit_workspace_status(app, workspace_id, "sleeping", None);

    Ok(())
}
