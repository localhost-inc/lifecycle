use super::paths::{require_local_worktree, resolve_workspace_git_context};
use crate::platform::db::open_db;
use crate::platform::git::pull_request::{
    self, GitBranchPullRequestResult, GitPullRequestListResult, GitPullRequestSummary,
};
use crate::platform::git::status::{
    self, GitCommitDiffResult, GitCommitResult, GitDiffResult, GitLogEntry, GitPushResult,
    GitStatusResult,
};
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use rusqlite::params;
use tauri::AppHandle;

fn update_workspace_git_sha(
    db_path: &str,
    workspace_id: &str,
    sha: &str,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace SET git_sha = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![sha, workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

fn emit_git_repository_events(
    app: &AppHandle,
    workspace_id: &str,
    status: Option<&GitStatusResult>,
    include_head_changed: bool,
    include_log_changed: bool,
    include_status_changed: bool,
    fallback_head_sha: Option<&str>,
) {
    let branch = status.and_then(|value| value.branch.clone());
    let head_sha = status
        .and_then(|value| value.head_sha.clone())
        .or_else(|| fallback_head_sha.map(|value| value.to_string()));
    let upstream = status.and_then(|value| value.upstream.clone());
    let ahead = status.map(|value| value.ahead);
    let behind = status.map(|value| value.behind);

    if include_head_changed {
        publish_lifecycle_event(
            app,
            LifecycleEvent::GitHeadChanged {
                workspace_id: workspace_id.to_string(),
                branch: branch.clone(),
                head_sha: head_sha.clone(),
                upstream: upstream.clone(),
                ahead,
                behind,
            },
        );
    }

    if include_log_changed {
        publish_lifecycle_event(
            app,
            LifecycleEvent::GitLogChanged {
                workspace_id: workspace_id.to_string(),
                branch: branch.clone(),
                head_sha: head_sha.clone(),
            },
        );
    }

    if include_status_changed {
        publish_lifecycle_event(
            app,
            LifecycleEvent::GitStatusChanged {
                workspace_id: workspace_id.to_string(),
                branch,
                head_sha,
                upstream,
            },
        );
    }
}

pub async fn get_workspace_git_status(
    db_path: &str,
    workspace_id: String,
) -> Result<GitStatusResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "get workspace git status")?;
    status::get_git_status(&worktree_path).await
}

pub async fn get_workspace_git_diff(
    db_path: &str,
    workspace_id: String,
    file_path: String,
    scope: String,
) -> Result<GitDiffResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "get workspace git diff")?;
    status::get_git_diff(&worktree_path, &file_path, &scope).await
}

pub async fn get_workspace_git_scope_patch(
    db_path: &str,
    workspace_id: String,
    scope: String,
) -> Result<String, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "get workspace git scope patch")?;
    status::get_git_scope_patch(&worktree_path, &scope).await
}

pub async fn get_workspace_git_changes_patch(
    db_path: &str,
    workspace_id: String,
) -> Result<String, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "get workspace git changes patch")?;
    status::get_git_changes_patch(&worktree_path).await
}

pub async fn list_workspace_git_log(
    db_path: &str,
    workspace_id: String,
    limit: u32,
) -> Result<Vec<GitLogEntry>, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "list workspace git log")?;
    status::get_git_log(&worktree_path, limit).await
}

pub async fn list_workspace_git_pull_requests(
    db_path: &str,
    workspace_id: String,
) -> Result<GitPullRequestListResult, LifecycleError> {
    let (mode, worktree_path) = resolve_workspace_git_context(db_path, &workspace_id)?;
    if mode != "local" {
        return Ok(GitPullRequestListResult {
            support: pull_request::mode_not_supported(
                "Cloud workspace pull requests will use the cloud provider once it exists.",
            ),
            pull_requests: Vec::new(),
        });
    }

    let worktree_path = worktree_path.ok_or_else(|| LifecycleError::GitOperationFailed {
        operation: "list GitHub pull requests".to_string(),
        reason: format!("workspace {workspace_id} has no local worktree path"),
    })?;

    pull_request::list_open_pull_requests(&worktree_path).await
}

pub async fn get_workspace_current_git_pull_request(
    db_path: &str,
    workspace_id: String,
) -> Result<GitBranchPullRequestResult, LifecycleError> {
    let (mode, worktree_path) = resolve_workspace_git_context(db_path, &workspace_id)?;
    if mode != "local" {
        return Ok(GitBranchPullRequestResult {
            support: pull_request::mode_not_supported(
                "Cloud workspace pull requests will use the cloud provider once it exists.",
            ),
            branch: None,
            upstream: None,
            suggested_base_ref: None,
            pull_request: None,
        });
    }

    let worktree_path = worktree_path.ok_or_else(|| LifecycleError::GitOperationFailed {
        operation: "read current branch GitHub pull request".to_string(),
        reason: format!("workspace {workspace_id} has no local worktree path"),
    })?;

    pull_request::get_current_branch_pull_request(&worktree_path).await
}

pub async fn get_workspace_git_base_ref(
    db_path: &str,
    workspace_id: String,
) -> Result<Option<String>, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "get workspace git base ref")?;
    status::get_git_base_ref(&worktree_path).await
}

pub async fn get_workspace_git_commit_patch(
    db_path: &str,
    workspace_id: String,
    sha: String,
) -> Result<GitCommitDiffResult, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "get workspace git commit patch")?;
    status::get_git_commit_patch(&worktree_path, &sha).await
}

pub async fn stage_workspace_git_files(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "stage workspace git files")?;
    status::stage_git_files(&worktree_path, &file_paths).await?;

    let next_status = status::get_git_status(&worktree_path).await.ok();
    emit_git_repository_events(
        app,
        &workspace_id,
        next_status.as_ref(),
        false,
        false,
        true,
        None,
    );

    Ok(())
}

pub async fn unstage_workspace_git_files(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "unstage workspace git files")?;
    status::unstage_git_files(&worktree_path, &file_paths).await?;

    let next_status = status::get_git_status(&worktree_path).await.ok();
    emit_git_repository_events(
        app,
        &workspace_id,
        next_status.as_ref(),
        false,
        false,
        true,
        None,
    );

    Ok(())
}

pub async fn commit_workspace_git(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
    message: String,
) -> Result<GitCommitResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "commit workspace git")?;
    let result = status::commit_git(&worktree_path, &message).await?;
    update_workspace_git_sha(db_path, &workspace_id, &result.sha)?;

    let next_status = status::get_git_status(&worktree_path).await.ok();
    emit_git_repository_events(
        app,
        &workspace_id,
        next_status.as_ref(),
        true,
        true,
        true,
        Some(result.sha.as_str()),
    );

    Ok(result)
}

pub async fn push_workspace_git(
    app: &AppHandle,
    db_path: &str,
    workspace_id: String,
) -> Result<GitPushResult, LifecycleError> {
    let worktree_path = require_local_worktree(db_path, &workspace_id, "push workspace git")?;
    let result = status::push_git(&worktree_path).await?;

    let next_status = status::get_git_status(&worktree_path).await.ok();
    emit_git_repository_events(
        app,
        &workspace_id,
        next_status.as_ref(),
        true,
        false,
        true,
        None,
    );

    Ok(result)
}

pub async fn create_workspace_git_pull_request(
    db_path: &str,
    workspace_id: String,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "create workspace git pull request")?;
    pull_request::create_pull_request(&worktree_path).await
}

pub async fn merge_workspace_git_pull_request(
    db_path: &str,
    workspace_id: String,
    pull_request_number: u64,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let worktree_path =
        require_local_worktree(db_path, &workspace_id, "merge workspace git pull request")?;
    pull_request::merge_pull_request(&worktree_path, pull_request_number).await
}
