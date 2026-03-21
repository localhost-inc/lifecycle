use crate::capabilities::workspaces::manifest::parse_lifecycle_config;
use crate::platform::db::{map_database_result, open_db, optional_database_result, DbPath};
use crate::platform::diagnostics;
use crate::platform::git::worktree;
use crate::shared::errors::{LifecycleError, WorkspaceFailureReason, WorkspaceStatus};
use rusqlite::params;
use std::time::Instant;
use tauri::{AppHandle, State};

use super::checkout_type::{normalize_workspace_checkout_type, ROOT_WORKSPACE_CHECKOUT_TYPE};
use super::shared::{
    emit_workspace_status, reconcile_workspace_services_db, update_workspace_status_db,
};

#[derive(Debug, Clone)]
pub(crate) struct CreateWorkspaceRequest {
    pub(crate) project_id: String,
    pub(crate) project_path: String,
    pub(crate) workspace_name: Option<String>,
    pub(crate) base_ref: Option<String>,
    pub(crate) worktree_root: Option<String>,
    pub(crate) checkout_type: Option<String>,
    pub(crate) manifest_json: Option<String>,
    pub(crate) manifest_fingerprint: Option<String>,
}

struct RootWorkspaceBootstrap<'a> {
    db_path: &'a str,
    workspace_id: &'a str,
    project_path: &'a str,
    source_ref: &'a str,
}

struct WorktreeWorkspaceCreation<'a> {
    app: &'a AppHandle,
    db_path: &'a str,
    workspace_id: &'a str,
    source_ref: &'a str,
    workspace_name: &'a str,
    project_path: &'a str,
    base_ref: Option<&'a str>,
    worktree_root: Option<&'a str>,
}

pub async fn create_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    request: CreateWorkspaceRequest,
) -> Result<String, LifecycleError> {
    let total_started_at = Instant::now();
    let workspace_checkout_type =
        normalize_workspace_checkout_type(request.checkout_type.as_deref());
    if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
        if let Some(existing_workspace_id) =
            find_existing_root_workspace_id(&db_path.0, &request.project_id)?
        {
            return Ok(existing_workspace_id);
        }
    }

    let manifest = request
        .manifest_json
        .as_deref()
        .map(parse_lifecycle_config)
        .transpose()?;
    let root_source_ref = if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
        Some(resolve_base_ref(&request.project_path, request.base_ref.as_deref()).await?)
    } else {
        None
    };
    let workspace_id = uuid::Uuid::new_v4().to_string();
    let workspace_name = request
        .workspace_name
        .and_then(normalize_optional_string)
        .unwrap_or_else(|| {
            if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
                "Root".to_string()
            } else {
                auto_workspace_name(&workspace_id)
            }
        });
    let source_ref = root_source_ref
        .unwrap_or_else(|| worktree::workspace_branch_name(&workspace_name, &workspace_id));
    let (name_origin, source_ref_origin) =
        if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
        ("manual", "manual")
    } else {
        ("default", "default")
    };
    let db = db_path.0.clone();

    // Insert workspace row
    {
        let conn = open_db(&db)?;
        map_database_result(conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, name_origin, source_ref, source_ref_origin, checkout_type, target, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'host', 'active')",
            params![
                workspace_id,
                request.project_id,
                workspace_name,
                name_origin,
                source_ref,
                source_ref_origin,
                workspace_checkout_type,
            ],
        ))?;
    }

    emit_workspace_status(&app, &workspace_id, "active", None);

    let provision_started_at = Instant::now();
    if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
        run_root_workspace_creation(RootWorkspaceBootstrap {
            db_path: &db,
            workspace_id: &workspace_id,
            project_path: &request.project_path,
            source_ref: &source_ref,
        })
        .await?;
    } else {
        run_worktree_workspace_creation(WorktreeWorkspaceCreation {
            app: &app,
            db_path: &db,
            workspace_id: &workspace_id,
            source_ref: &source_ref,
            workspace_name: &workspace_name,
            project_path: &request.project_path,
            base_ref: request.base_ref.as_deref(),
            worktree_root: request.worktree_root.as_deref(),
        })
        .await?;
    }
    diagnostics::append_timing(
        "workspace-create",
        &format!(
            "workspace {workspace_id} {}",
            if workspace_checkout_type == ROOT_WORKSPACE_CHECKOUT_TYPE {
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
        "workspace-create",
        &format!("workspace {workspace_id} manifest reconcile"),
        reconcile_started_at,
    );
    diagnostics::append_timing(
        "workspace-create",
        &format!("workspace {workspace_id} total"),
        total_started_at,
    );

    Ok(workspace_id)
}

fn find_existing_root_workspace_id(
    db_path: &str,
    project_id: &str,
) -> Result<Option<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    optional_database_result(conn.query_row(
        "SELECT id
         FROM workspace
         WHERE project_id = ?1 AND checkout_type = 'root'
         LIMIT 1",
        params![project_id],
        |row| row.get::<_, String>(0),
    ))
}

async fn resolve_base_ref(
    project_path: &str,
    base_ref: Option<&str>,
) -> Result<String, LifecycleError> {
    match base_ref.and_then(normalize_optional_ref) {
        Some(value) => Ok(value.to_string()),
        None => worktree::get_current_branch(project_path).await,
    }
}

async fn run_root_workspace_creation(
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
        "workspace-create",
        &format!(
            "workspace {} root bootstrap data sync",
            bootstrap.workspace_id
        ),
        root_bootstrap_started_at,
    );
    Ok(())
}

async fn run_worktree_workspace_creation(
    request: WorktreeWorkspaceCreation<'_>,
) -> Result<(), LifecycleError> {
    let resolved_base_ref = match resolve_base_ref(request.project_path, request.base_ref).await {
        Ok(value) => value,
        Err(error) => {
            update_workspace_status_db(
                request.db_path,
                request.workspace_id,
                &WorkspaceStatus::Active,
                Some(&WorkspaceFailureReason::RepoCloneFailed),
            )?;
            emit_workspace_status(
                request.app,
                request.workspace_id,
                "active",
                Some("repo_clone_failed"),
            );
            return Err(error);
        }
    };

    // Create git worktree
    let create_worktree_started_at = Instant::now();
    let worktree_path = match worktree::create_worktree(
        request.project_path,
        &resolved_base_ref,
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
                &WorkspaceStatus::Active,
                Some(&WorkspaceFailureReason::RepoCloneFailed),
            )?;
            emit_workspace_status(
                request.app,
                request.workspace_id,
                "active",
                Some("repo_clone_failed"),
            );
            return Err(e);
        }
    };
    diagnostics::append_timing(
        "workspace-create",
        &format!("workspace {} git worktree create", request.workspace_id),
        create_worktree_started_at,
    );

    if let Err(e) = worktree::copy_local_config_files(request.project_path, &worktree_path) {
        let _ = worktree::remove_worktree(request.project_path, &worktree_path).await;
        update_workspace_status_db(
            request.db_path,
            request.workspace_id,
            &WorkspaceStatus::Active,
            Some(&WorkspaceFailureReason::RepoCloneFailed),
        )?;
        emit_workspace_status(
            request.app,
            request.workspace_id,
            "active",
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::run_migrations;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command as StdCommand;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-create-workspace-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn temp_repo_path() -> PathBuf {
        std::env::temp_dir().join(format!("lifecycle-create-repo-{}", uuid::Uuid::new_v4()))
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

    #[test]
    fn find_existing_root_workspace_id_returns_only_root_workspace() {
        let db_path = temp_db_path();
        run_migrations(&db_path).expect("run migrations");

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, checkout_type, source_ref, target, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7), (?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            rusqlite::params![
                "workspace_worktree",
                "project_1",
                "Worktree",
                "worktree",
                "lifecycle/worktree-fixture",
                "host",
                "active",
                "workspace_root",
                "project_1",
                "Root",
                "root",
                "main",
                "host",
                "active"
            ],
        )
        .expect("insert workspaces");
        drop(conn);

        let existing =
            find_existing_root_workspace_id(&db_path, "project_1").expect("find root workspace");
        assert_eq!(existing.as_deref(), Some("workspace_root"));

        let missing =
            find_existing_root_workspace_id(&db_path, "project_missing").expect("missing project");
        assert!(missing.is_none());

        let _ = fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn run_root_workspace_creation_records_project_path_and_git_sha() {
        let db_path = temp_db_path();
        let repo_path = temp_repo_path();
        init_repo(&repo_path);
        run_migrations(&db_path).expect("run migrations");

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
                id, project_id, name, name_origin, checkout_type, source_ref, source_ref_origin, target, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                "workspace_root",
                "project_1",
                "Root",
                "manual",
                "root",
                source_ref,
                "manual",
                "host",
                "active"
            ],
        )
        .expect("insert workspace");
        drop(conn);

        run_root_workspace_creation(RootWorkspaceBootstrap {
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
