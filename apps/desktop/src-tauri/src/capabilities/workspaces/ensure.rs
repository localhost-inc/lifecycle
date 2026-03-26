use crate::capabilities::workspaces::manifest::parse_lifecycle_config;
use crate::platform::db::{map_database_result, open_db, DbPath};
use crate::platform::diagnostics;
use crate::platform::git::worktree;
use crate::shared::errors::{LifecycleError, WorkspaceFailureReason, WorkspaceStatus};
use rusqlite::params;
use std::time::Instant;
use tauri::{AppHandle, State};

use super::shared::{
    emit_workspace_status, reconcile_workspace_services_db, update_workspace_status_db,
};

/// All fields are pre-computed by TypeScript. Rust does not derive, validate,
/// or default any of these values — it only executes infrastructure operations
/// for an already-persisted provisioning workspace row.
#[derive(Debug, Clone)]
pub(crate) struct EnsureWorkspaceRequest {
    pub(crate) workspace_id: String,
    pub(crate) project_path: String,
    pub(crate) name: String,
    pub(crate) source_ref: String,
    pub(crate) checkout_type: String,
    pub(crate) base_ref: Option<String>,
    pub(crate) worktree_root: Option<String>,
    pub(crate) manifest_json: Option<String>,
    pub(crate) manifest_fingerprint: Option<String>,
}

struct RootWorkspaceBootstrap<'a> {
    db_path: &'a str,
    workspace_id: &'a str,
    project_path: &'a str,
    source_ref: &'a str,
}

struct WorktreeWorkspaceEnsure<'a> {
    app: &'a AppHandle,
    db_path: &'a str,
    workspace_id: &'a str,
    source_ref: &'a str,
    workspace_name: &'a str,
    project_path: &'a str,
    base_ref: Option<&'a str>,
    worktree_root: Option<&'a str>,
}

pub async fn ensure_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    request: EnsureWorkspaceRequest,
) -> Result<String, LifecycleError> {
    let total_started_at = Instant::now();
    let is_root = request.checkout_type == "root";
    let workspace_id = request.workspace_id.clone();

    let manifest = request
        .manifest_json
        .as_deref()
        .map(parse_lifecycle_config)
        .transpose()?;
    let db = db_path.0.clone();

    {
        let conn = open_db(&db)?;
        let exists: i64 = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspace WHERE id = ?1)",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
        if exists == 0 {
            return Err(LifecycleError::WorkspaceNotFound(workspace_id));
        }
    }

    update_workspace_status_db(&db, &workspace_id, &WorkspaceStatus::Provisioning, None)?;
    emit_workspace_status(&app, &workspace_id, "provisioning", None);

    let provision_started_at = Instant::now();
    if is_root {
        bootstrap_root_workspace(RootWorkspaceBootstrap {
            db_path: &db,
            workspace_id: &workspace_id,
            project_path: &request.project_path,
            source_ref: &request.source_ref,
        })
        .await?;
    } else {
        ensure_worktree_workspace(WorktreeWorkspaceEnsure {
            app: &app,
            db_path: &db,
            workspace_id: &workspace_id,
            source_ref: &request.source_ref,
            workspace_name: &request.name,
            project_path: &request.project_path,
            base_ref: request.base_ref.as_deref(),
            worktree_root: request.worktree_root.as_deref(),
        })
        .await?;
    }
    diagnostics::append_timing(
        "workspace-ensure",
        &format!(
            "workspace {workspace_id} {}",
            if is_root {
                "root bootstrap"
            } else {
                "worktree create"
            }
        ),
        provision_started_at,
    );

    let reconcile_started_at = Instant::now();
    reconcile_workspace_services_db(
        &db,
        &workspace_id,
        manifest.as_ref(),
        request.manifest_fingerprint.as_deref(),
        false,
    )?;
    diagnostics::append_timing(
        "workspace-ensure",
        &format!("workspace {workspace_id} manifest reconcile"),
        reconcile_started_at,
    );
    update_workspace_status_db(&db, &workspace_id, &WorkspaceStatus::Active, None)?;
    emit_workspace_status(&app, &workspace_id, "active", None);
    diagnostics::append_timing(
        "workspace-ensure",
        &format!("workspace {workspace_id} total"),
        total_started_at,
    );

    Ok(workspace_id)
}

async fn bootstrap_root_workspace(
    bootstrap: RootWorkspaceBootstrap<'_>,
) -> Result<(), LifecycleError> {
    let root_bootstrap_started_at = Instant::now();
    let git_sha = worktree::get_sha(bootstrap.project_path, bootstrap.source_ref)
        .await
        .unwrap_or_default();
    let conn = open_db(bootstrap.db_path)?;
    map_database_result(conn.execute(
        "UPDATE workspace
         SET worktree_path = ?1,
             git_sha = ?2,
             updated_at = datetime('now')
         WHERE id = ?3",
        params![bootstrap.project_path, git_sha, bootstrap.workspace_id],
    ))?;
    diagnostics::append_timing(
        "workspace-ensure",
        &format!(
            "workspace {} root bootstrap data sync",
            bootstrap.workspace_id
        ),
        root_bootstrap_started_at,
    );
    Ok(())
}

async fn ensure_worktree_workspace(
    request: WorktreeWorkspaceEnsure<'_>,
) -> Result<(), LifecycleError> {
    // base_ref is pre-resolved by TypeScript; fall back to current branch if absent.
    let base_ref = match request.base_ref {
        Some(value) if !value.trim().is_empty() => value.to_string(),
        _ => match worktree::get_current_branch(request.project_path).await {
            Ok(branch) => branch,
            Err(error) => {
                update_workspace_status_db(
                    request.db_path,
                    request.workspace_id,
                    &WorkspaceStatus::Failed,
                    Some(&WorkspaceFailureReason::RepoCloneFailed),
                )?;
                emit_workspace_status(
                    request.app,
                    request.workspace_id,
                    "failed",
                    Some("repo_clone_failed"),
                );
                return Err(error);
            }
        },
    };

    // Ensure the git worktree exists for this workspace.
    let create_worktree_started_at = Instant::now();
    let worktree_path = match worktree::create_worktree(
        request.project_path,
        &base_ref,
        request.source_ref,
        request.workspace_name,
        request.workspace_id,
        request.worktree_root,
    )
    .await
    {
        Ok(path) => path,
        Err(e) => {
            update_workspace_status_db(
                request.db_path,
                request.workspace_id,
                &WorkspaceStatus::Failed,
                Some(&WorkspaceFailureReason::RepoCloneFailed),
            )?;
            emit_workspace_status(
                request.app,
                request.workspace_id,
                "failed",
                Some("repo_clone_failed"),
            );
            return Err(e);
        }
    };
    diagnostics::append_timing(
        "workspace-ensure",
        &format!("workspace {} git worktree create", request.workspace_id),
        create_worktree_started_at,
    );

    if let Err(e) = worktree::copy_local_config_files(request.project_path, &worktree_path) {
        let _ = worktree::remove_worktree(request.project_path, &worktree_path).await;
        update_workspace_status_db(
            request.db_path,
            request.workspace_id,
            &WorkspaceStatus::Failed,
            Some(&WorkspaceFailureReason::RepoCloneFailed),
        )?;
        emit_workspace_status(
            request.app,
            request.workspace_id,
            "failed",
            Some("repo_clone_failed"),
        );
        return Err(e);
    }

    // Record worktree path + git SHA
    let git_sha = worktree::get_sha(request.project_path, request.source_ref)
        .await
        .unwrap_or_default();
    {
        let conn = open_db(request.db_path)?;
        map_database_result(conn.execute(
            "UPDATE workspace SET worktree_path = ?1, git_sha = ?2, updated_at = datetime('now') WHERE id = ?3",
            params![worktree_path, git_sha, request.workspace_id],
        ))?;
    }

    update_workspace_status_db(
        request.db_path,
        request.workspace_id,
        &WorkspaceStatus::Active,
        None,
    )?;
    emit_workspace_status(request.app, request.workspace_id, "active", None);

    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::apply_test_schema;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command as StdCommand;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!("lifecycle-ensure-workspace-{}.db", uuid::Uuid::new_v4()))
            .to_string_lossy()
            .into_owned()
    }

    fn temp_repo_path() -> PathBuf {
        std::env::temp_dir().join(format!("lifecycle-ensure-repo-{}", uuid::Uuid::new_v4()))
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }
    }

    fn init_repo(repo_path: &Path) {
        fs::create_dir_all(repo_path).expect("create temp repo path");
        run_git(repo_path, &["init"]);
        run_git(repo_path, &["config", "user.email", "test@example.com"]);
        run_git(repo_path, &["config", "user.name", "Lifecycle Test"]);
        fs::write(repo_path.join("README.md"), "seed\n").expect("write seed file");
        run_git(repo_path, &["add", "README.md"]);
        run_git(repo_path, &["commit", "-m", "init"]);
    }

    #[tokio::test]
    async fn bootstrap_root_workspace_records_project_path_and_git_sha() {
        let db_path = temp_db_path();
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        apply_test_schema(&db_path);

        let repo_path_str = repo_path.to_str().expect("repo path is utf8");
        let source_ref = worktree::get_current_branch(repo_path_str)
            .await
            .expect("get current branch");
        let expected_sha = worktree::get_sha(repo_path_str, &source_ref)
            .await
            .expect("get current sha");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", repo_path_str, "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, name_origin, checkout_type, source_ref, source_ref_origin, host, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                "workspace_root",
                "project_1",
                "Root",
                "manual",
                "root",
                source_ref,
                "manual",
                "local",
                "active"
            ],
        )
        .expect("insert workspace");
        drop(conn);

        bootstrap_root_workspace(RootWorkspaceBootstrap {
            db_path: &db_path,
            workspace_id: "workspace_root",
            project_path: repo_path_str,
            source_ref: &source_ref,
        })
        .await
        .expect("record root workspace state");

        let conn = open_db(&db_path).expect("re-open db");
        let (worktree_path, git_sha): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT worktree_path, git_sha
                 FROM workspace
                 WHERE id = ?1",
                rusqlite::params!["workspace_root"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("load workspace");

        assert_eq!(worktree_path.as_deref(), Some(repo_path_str));
        assert_eq!(git_sha.as_deref(), Some(expected_sha.as_str()));

        let _ = fs::remove_dir_all(repo_path);
        let _ = fs::remove_file(db_path);
    }
}
