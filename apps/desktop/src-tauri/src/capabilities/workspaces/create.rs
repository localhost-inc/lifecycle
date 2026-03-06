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
    project_path: String,
    workspace_name: Option<String>,
    base_ref: Option<String>,
    worktree_root: Option<String>,
) -> Result<String, LifecycleError> {
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let workspace_name = workspace_name
        .and_then(normalize_optional_string)
        .unwrap_or_else(|| auto_workspace_name(&workspace_id));
    let source_ref = workspace_branch_name(&workspace_name, &workspace_id);
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

    run_workspace_creation(
        &app,
        &db,
        &workspace_id,
        &source_ref,
        &workspace_name,
        &project_path,
        base_ref.as_deref(),
        worktree_root.as_deref(),
    )
    .await?;

    Ok(workspace_id)
}

async fn run_workspace_creation(
    app: &AppHandle,
    db_path: &str,
    workspace_id: &str,
    source_ref: &str,
    workspace_name: &str,
    project_path: &str,
    base_ref: Option<&str>,
    worktree_root: Option<&str>,
) -> Result<(), LifecycleError> {
    let resolved_base_ref = match base_ref.and_then(normalize_optional_ref) {
        Some(value) => value.to_string(),
        None => match worktree::get_current_branch(project_path).await {
            Ok(value) => value,
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
        },
    };

    // Create git worktree
    let worktree_path = match worktree::create_worktree(
        project_path,
        &resolved_base_ref,
        source_ref,
        workspace_name,
        workspace_id,
        worktree_root,
    )
    .await
    {
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

fn normalize_optional_string(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_optional_ref(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn short_workspace_id(workspace_id: &str) -> String {
    let short: String = workspace_id
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .take(8)
        .collect();

    if short.is_empty() {
        "workspace".to_string()
    } else {
        short
    }
}

fn workspace_branch_name(workspace_name: &str, workspace_id: &str) -> String {
    let name_slug = worktree::slugify_workspace_name(workspace_name);
    let short_id = short_workspace_id(workspace_id);
    format!("lifecycle/{}-{}", name_slug, short_id)
}

fn auto_workspace_name(workspace_id: &str) -> String {
    const ADJECTIVES: [&str; 12] = [
        "amber", "brisk", "clear", "delta", "ember", "frost", "glint", "hollow", "ion", "lunar",
        "north", "swift",
    ];
    const NOUNS: [&str; 12] = [
        "atlas", "beacon", "canal", "drift", "echo", "forge", "grove", "harbor", "junction",
        "keystone", "meridian", "orbit",
    ];

    let bytes = workspace_id.as_bytes();
    let adjective_index = bytes.first().copied().unwrap_or(0) as usize % ADJECTIVES.len();
    let noun_index = bytes.get(1).copied().unwrap_or(0) as usize % NOUNS.len();

    format!("{}-{}", ADJECTIVES[adjective_index], NOUNS[noun_index])
}
