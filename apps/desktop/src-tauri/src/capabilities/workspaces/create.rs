use crate::capabilities::workspaces::manifest::LifecycleConfig;
use crate::platform::db::{open_db, DbPath};
use crate::platform::git::worktree;
use crate::shared::errors::{LifecycleError, WorkspaceFailureReason, WorkspaceStatus};
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{
    emit_workspace_status, reconcile_workspace_services_db, update_workspace_status_db,
};

pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    project_id: String,
    project_path: String,
    workspace_name: Option<String>,
    base_ref: Option<String>,
    worktree_root: Option<String>,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
) -> Result<String, LifecycleError> {
    let manifest = manifest_json
        .as_deref()
        .map(|json| {
            serde_json::from_str::<LifecycleConfig>(json)
                .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))
        })
        .transpose()?;
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let workspace_name = workspace_name
        .and_then(normalize_optional_string)
        .unwrap_or_else(|| auto_workspace_name(&workspace_id));
    let source_ref = worktree::workspace_branch_name(&workspace_name, &workspace_id);
    let db = db_path.0.clone();

    // Insert workspace row
    {
        let conn = open_db(&db)?;
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref, source_ref_origin, status, mode) VALUES (?1, ?2, ?3, 'default', ?4, 'default', 'idle', 'local')",
            params![workspace_id, project_id, workspace_name, source_ref],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    emit_workspace_status(&app, &workspace_id, "idle", None);

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

    reconcile_workspace_services_db(
        &db,
        &workspace_id,
        manifest.as_ref(),
        manifest_fingerprint.as_deref(),
    )?;

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
                    &WorkspaceStatus::Idle,
                    Some(&WorkspaceFailureReason::RepoCloneFailed),
                )?;
                emit_workspace_status(app, workspace_id, "idle", Some("repo_clone_failed"));
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
                &WorkspaceStatus::Idle,
                Some(&WorkspaceFailureReason::RepoCloneFailed),
            )?;
            emit_workspace_status(app, workspace_id, "idle", Some("repo_clone_failed"));
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
            "UPDATE workspace SET worktree_path = ?1, git_sha = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![worktree_path, git_sha, workspace_id],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    // Workspace creation completes in the resting idle state.
    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Idle, None)?;
    emit_workspace_status(app, workspace_id, "idle", None);

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
