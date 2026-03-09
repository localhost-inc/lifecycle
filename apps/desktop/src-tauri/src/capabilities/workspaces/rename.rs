use crate::platform::{db::open_db, git::worktree};
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use rusqlite::params;
use tauri::AppHandle;

use super::query::{self, TerminalRecord, WorkspaceRecord};
use super::terminal::load_terminal_record;

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

#[derive(Debug)]
struct WorkspaceIdentityContext {
    current_name: String,
    name_origin: String,
    current_source_ref: String,
    source_ref_origin: String,
    project_path: String,
    worktree_path: Option<String>,
}

#[derive(Debug)]
struct TerminalRenameContext {
    current_label: String,
    label_origin: String,
}

#[derive(Clone, Copy, Debug)]
enum WorkspaceBranchRenameDisposition {
    Rename,
    Skip(&'static str),
}

pub async fn rename_workspace(
    app: AppHandle,
    db_path: &str,
    workspace_id: &str,
    name: &str,
) -> Result<WorkspaceRecord, LifecycleError> {
    let workspace =
        update_workspace_identity(db_path, workspace_id, name, TitleOrigin::Manual).await?;
    emit_workspace_renamed(&app, &workspace);
    Ok(workspace)
}

pub fn rename_terminal(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
) -> Result<TerminalRecord, LifecycleError> {
    update_terminal_label(app, db_path, terminal_id, label, TitleOrigin::Manual)
}

pub async fn maybe_apply_generated_workspace_identity(
    app: AppHandle,
    db_path: &str,
    workspace_id: &str,
    name: &str,
) -> Result<Option<WorkspaceRecord>, LifecycleError> {
    let context = load_workspace_identity_context(db_path, workspace_id)?;
    if context.name_origin != TitleOrigin::Default.as_str()
        || context.source_ref_origin != TitleOrigin::Default.as_str()
    {
        return Ok(None);
    }

    drop(context);
    let workspace =
        update_workspace_identity(db_path, workspace_id, name, TitleOrigin::Generated).await?;
    emit_workspace_renamed(&app, &workspace);
    Ok(Some(workspace))
}

pub fn maybe_apply_generated_terminal_label(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
) -> Result<Option<TerminalRecord>, LifecycleError> {
    let context = load_terminal_rename_context(db_path, terminal_id)?;
    if context.label_origin == TitleOrigin::Manual.as_str() {
        return Ok(None);
    }

    drop(context);
    update_terminal_label(app, db_path, terminal_id, label, TitleOrigin::Generated).map(Some)
}

async fn update_workspace_identity(
    db_path: &str,
    workspace_id: &str,
    name: &str,
    origin: TitleOrigin,
) -> Result<WorkspaceRecord, LifecycleError> {
    let next_name = normalize_title_input("workspace name", name)?;
    let context = load_workspace_identity_context(db_path, workspace_id)?;
    let next_source_ref = worktree::workspace_branch_name(&next_name, workspace_id);
    let branch_disposition =
        determine_workspace_branch_rename_disposition(&context, workspace_id, &next_source_ref)
            .await?;
    let expected_source_ref = match branch_disposition {
        WorkspaceBranchRenameDisposition::Rename => next_source_ref.as_str(),
        WorkspaceBranchRenameDisposition::Skip(_) => context.current_source_ref.as_str(),
    };

    if context.current_name == next_name
        && context.name_origin == origin.as_str()
        && context.current_source_ref == expected_source_ref
        && context.source_ref_origin == origin.as_str()
    {
        return query::get_workspace_by_id(db_path, workspace_id.to_string())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.to_string()));
    }

    let mut next_worktree_path = context.worktree_path.clone();
    if context.current_name != next_name {
        if let Some(current_worktree_path) = context.worktree_path.as_deref() {
            next_worktree_path = Some(
                worktree::move_worktree(
                    &context.project_path,
                    current_worktree_path,
                    &next_name,
                    workspace_id,
                )
                .await?,
            );
        }
    }

    let mut persisted_source_ref = context.current_source_ref.clone();
    if let WorkspaceBranchRenameDisposition::Rename = branch_disposition {
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
            &next_source_ref,
        )
        .await
        {
            if let (Some(original_worktree_path), Some(moved_worktree_path)) = (
                context.worktree_path.as_deref(),
                next_worktree_path.as_deref(),
            ) {
                if original_worktree_path != moved_worktree_path {
                    if let Err(rollback_error) = worktree::move_worktree(
                        &context.project_path,
                        moved_worktree_path,
                        &context.current_name,
                        workspace_id,
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

        persisted_source_ref = next_source_ref;
    } else if let WorkspaceBranchRenameDisposition::Skip(reason) = branch_disposition {
        tracing::info!(
            workspace_id,
            current_source_ref = %context.current_source_ref,
            next_source_ref = %next_source_ref,
            reason,
            "skipping workspace branch rename"
        );
    }

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
            next_name,
            origin.as_str(),
            persisted_source_ref,
            origin.as_str(),
            next_worktree_path,
            workspace_id
        ],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    query::get_workspace_by_id(db_path, workspace_id.to_string())
        .await?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.to_string()))
}

async fn determine_workspace_branch_rename_disposition(
    context: &WorkspaceIdentityContext,
    workspace_id: &str,
    next_source_ref: &str,
) -> Result<WorkspaceBranchRenameDisposition, LifecycleError> {
    if context.current_source_ref == next_source_ref {
        return Ok(WorkspaceBranchRenameDisposition::Skip(
            "branch already matches identity",
        ));
    }

    let Some(worktree_path) = context.worktree_path.as_deref() else {
        return Ok(WorkspaceBranchRenameDisposition::Skip(
            "workspace has no worktree path",
        ));
    };

    if !worktree::is_managed_workspace_branch(&context.current_source_ref, workspace_id) {
        return Ok(WorkspaceBranchRenameDisposition::Skip(
            "current branch is not lifecycle-managed",
        ));
    }

    let current_branch = worktree::get_current_branch(worktree_path).await?;
    if current_branch != context.current_source_ref {
        return Ok(WorkspaceBranchRenameDisposition::Skip(
            "current worktree branch no longer matches workspace source_ref",
        ));
    }

    if worktree::branch_has_upstream(worktree_path, &context.current_source_ref).await? {
        return Ok(WorkspaceBranchRenameDisposition::Skip(
            "current branch already has an upstream",
        ));
    }

    Ok(WorkspaceBranchRenameDisposition::Rename)
}

fn update_terminal_label(
    app: &AppHandle,
    db_path: &str,
    terminal_id: &str,
    label: &str,
    origin: TitleOrigin,
) -> Result<TerminalRecord, LifecycleError> {
    let next_label = normalize_title_input("session title", label)?;
    let context = load_terminal_rename_context(db_path, terminal_id)?;

    if context.current_label == next_label && context.label_origin == origin.as_str() {
        return load_terminal_record(db_path, terminal_id)?
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

    let terminal = load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))?;
    emit_terminal_renamed(app, &terminal);
    Ok(terminal)
}

fn load_workspace_identity_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceIdentityContext, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT workspace.name, workspace.name_origin, workspace.source_ref, workspace.source_ref_origin, workspace.worktree_path, project.path
         FROM workspace
         INNER JOIN project ON project.id = workspace.project_id
         WHERE workspace.id = ?1
         LIMIT 1",
        params![workspace_id],
        |row| {
            Ok(WorkspaceIdentityContext {
                current_name: row.get(0)?,
                name_origin: row.get(1)?,
                current_source_ref: row.get(2)?,
                source_ref_origin: row.get(3)?,
                worktree_path: row.get(4)?,
                project_path: row.get(5)?,
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

fn emit_terminal_renamed(app: &AppHandle, terminal: &TerminalRecord) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::TerminalRenamed {
            terminal_id: terminal.id.clone(),
            workspace_id: terminal.workspace_id.clone(),
            label: terminal.label.clone(),
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::{open_db, run_migrations};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command as StdCommand;

    fn temp_repo_path() -> PathBuf {
        std::env::temp_dir().join(format!("lifecycle-rename-{}", uuid::Uuid::new_v4()))
    }

    fn temp_db_path() -> String {
        let path =
            std::env::temp_dir().join(format!("lifecycle-rename-{}.db", uuid::Uuid::new_v4()));
        path.to_string_lossy().into_owned()
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

    fn git_output(repo_path: &Path, args: &[&str]) -> String {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }

        String::from_utf8_lossy(&output.stdout).trim().to_string()
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

    fn init_remote(remote_path: &Path) {
        fs::create_dir_all(remote_path).expect("create remote root");
        let output = StdCommand::new("git")
            .args(["init", "--bare"])
            .current_dir(remote_path)
            .output()
            .expect("git init --bare should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git init --bare failed: {stderr}");
        }
    }

    async fn seed_workspace(
        db_path: &str,
        repo_path: &Path,
        workspace_name: &str,
        workspace_id: &str,
        name_origin: &str,
        source_ref_origin: &str,
    ) -> (String, String) {
        run_migrations(db_path).expect("run migrations");
        let repo_path_str = repo_path.to_str().expect("repo path is utf8");
        let base_ref = worktree::get_current_branch(repo_path_str)
            .await
            .expect("get current branch");
        let configured_root =
            std::env::temp_dir().join(format!("lifecycle-rename-root-{}", uuid::Uuid::new_v4()));
        let configured_root_str = configured_root
            .to_str()
            .expect("configured root path is utf8");
        let source_ref = worktree::workspace_branch_name(workspace_name, workspace_id);
        let worktree_path = worktree::create_worktree(
            repo_path_str,
            &base_ref,
            &source_ref,
            workspace_name,
            workspace_id,
            Some(configured_root_str),
        )
        .await
        .expect("create worktree");

        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", repo_path_str, "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, name_origin, source_ref, source_ref_origin, worktree_path, status, mode)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sleeping', 'local')",
            rusqlite::params![
                workspace_id,
                "project_1",
                workspace_name,
                name_origin,
                source_ref,
                source_ref_origin,
                worktree_path
            ],
        )
        .expect("insert workspace");

        (source_ref, configured_root.to_string_lossy().to_string())
    }

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

    #[tokio::test]
    async fn maybe_apply_generated_workspace_identity_renames_branch_and_worktree_once() {
        let repo_path = temp_repo_path();
        let db_path = temp_db_path();
        let workspace_id = "ws_identity_lock";
        init_repo(&repo_path);
        let (initial_source_ref, configured_root) = seed_workspace(
            &db_path,
            &repo_path,
            "amber-atlas",
            workspace_id,
            "default",
            "default",
        )
        .await;

        let workspace =
            maybe_update_generated_workspace_identity(&db_path, workspace_id, "Fix Auth Callback")
                .await
                .expect("generated identity applies")
                .expect("workspace identity should update");

        assert_eq!(workspace.name, "Fix Auth Callback");
        assert_eq!(
            workspace.source_ref,
            worktree::workspace_branch_name("Fix Auth Callback", workspace_id)
        );
        assert_ne!(workspace.source_ref, initial_source_ref);
        assert!(workspace
            .worktree_path
            .as_deref()
            .expect("worktree path should exist")
            .contains("fix-auth-callback"));

        let current_branch = git_output(
            Path::new(
                workspace
                    .worktree_path
                    .as_deref()
                    .expect("worktree path should exist"),
            ),
            &["rev-parse", "--abbrev-ref", "HEAD"],
        );
        assert_eq!(current_branch, workspace.source_ref);

        let skipped =
            maybe_update_generated_workspace_identity(&db_path, workspace_id, "Another Name")
                .await
                .expect("second generated identity attempt succeeds");
        assert!(skipped.is_none(), "identity should lock after first apply");

        worktree::remove_worktree(
            repo_path.to_str().expect("repo path is utf8"),
            workspace
                .worktree_path
                .as_deref()
                .expect("worktree path should exist"),
        )
        .await
        .expect("cleanup worktree");
        let _ = fs::remove_dir_all(repo_path);
        let _ = fs::remove_dir_all(configured_root);
        let _ = fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn manual_workspace_rename_skips_branch_rename_after_upstream_exists() {
        let repo_path = temp_repo_path();
        let remote_path = temp_repo_path();
        let db_path = temp_db_path();
        let workspace_id = "ws_manual_lock";
        init_repo(&repo_path);
        init_remote(&remote_path);
        run_git(
            &repo_path,
            &[
                "remote",
                "add",
                "origin",
                remote_path.to_str().expect("utf8"),
            ],
        );

        let (initial_source_ref, configured_root) = seed_workspace(
            &db_path,
            &repo_path,
            "amber-atlas",
            workspace_id,
            "manual",
            "manual",
        )
        .await;

        let initial_worktree_path = {
            let workspace = query::get_workspace_by_id(&db_path, workspace_id.to_string())
                .await
                .expect("load workspace")
                .expect("workspace exists");
            workspace.worktree_path.expect("worktree path exists")
        };

        run_git(
            Path::new(&initial_worktree_path),
            &["push", "--set-upstream", "origin", &initial_source_ref],
        );

        let workspace = update_workspace_identity(
            &db_path,
            workspace_id,
            "Investigate Session Naming",
            TitleOrigin::Manual,
        )
        .await
        .expect("manual rename succeeds");

        assert_eq!(workspace.name, "Investigate Session Naming");
        assert_eq!(workspace.source_ref, initial_source_ref);
        assert!(workspace
            .worktree_path
            .as_deref()
            .expect("worktree path should exist")
            .contains("investigate-session-naming"));

        let current_branch = git_output(
            Path::new(
                workspace
                    .worktree_path
                    .as_deref()
                    .expect("worktree path should exist"),
            ),
            &["rev-parse", "--abbrev-ref", "HEAD"],
        );
        assert_eq!(current_branch, initial_source_ref);

        worktree::remove_worktree(
            repo_path.to_str().expect("repo path is utf8"),
            workspace
                .worktree_path
                .as_deref()
                .expect("worktree path should exist"),
        )
        .await
        .expect("cleanup worktree");
        let _ = fs::remove_dir_all(repo_path);
        let _ = fs::remove_dir_all(remote_path);
        let _ = fs::remove_dir_all(configured_root);
        let _ = fs::remove_file(db_path);
    }

    async fn maybe_update_generated_workspace_identity(
        db_path: &str,
        workspace_id: &str,
        name: &str,
    ) -> Result<Option<WorkspaceRecord>, LifecycleError> {
        let context = load_workspace_identity_context(db_path, workspace_id)?;
        if context.name_origin != TitleOrigin::Default.as_str()
            || context.source_ref_origin != TitleOrigin::Default.as_str()
        {
            return Ok(None);
        }

        update_workspace_identity(db_path, workspace_id, name, TitleOrigin::Generated)
            .await
            .map(Some)
    }
}
