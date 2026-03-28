use crate::shared::errors::LifecycleError;

// ---------------------------------------------------------------------------
// Branch / SHA queries
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_git_current_branch(repo_path: String) -> Result<String, LifecycleError> {
    crate::platform::git::worktree::get_current_branch(&repo_path).await
}

#[tauri::command]
pub async fn get_git_sha(
    repo_path: String,
    ref_name: String,
) -> Result<String, LifecycleError> {
    crate::platform::git::worktree::get_sha(&repo_path, &ref_name).await
}

#[tauri::command]
pub async fn git_branch_has_upstream(
    worktree_path: String,
    branch_name: String,
) -> Result<bool, LifecycleError> {
    crate::platform::git::worktree::branch_has_upstream(&worktree_path, &branch_name).await
}

// ---------------------------------------------------------------------------
// Status / diff / log
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_git_status(
    repo_path: String,
) -> Result<crate::platform::git::status::GitStatusResult, LifecycleError> {
    crate::platform::git::status::get_git_status(&repo_path).await
}

#[tauri::command]
pub async fn get_git_diff(
    repo_path: String,
    file_path: String,
    scope: String,
) -> Result<crate::platform::git::status::GitDiffResult, LifecycleError> {
    crate::platform::git::status::get_git_diff(&repo_path, &file_path, &scope).await
}

#[tauri::command]
pub async fn get_git_scope_patch(
    repo_path: String,
    scope: String,
) -> Result<String, LifecycleError> {
    crate::platform::git::status::get_git_scope_patch(&repo_path, &scope).await
}

#[tauri::command]
pub async fn get_git_changes_patch(
    repo_path: String,
) -> Result<String, LifecycleError> {
    crate::platform::git::status::get_git_changes_patch(&repo_path).await
}

#[tauri::command]
pub async fn list_git_log(
    repo_path: String,
    limit: u32,
) -> Result<Vec<crate::platform::git::status::GitLogEntry>, LifecycleError> {
    crate::platform::git::status::get_git_log(&repo_path, limit).await
}

#[tauri::command]
pub async fn get_git_base_ref(
    repo_path: String,
) -> Result<Option<String>, LifecycleError> {
    crate::platform::git::status::get_git_base_ref(&repo_path).await
}

#[tauri::command]
pub async fn get_git_ref_diff_patch(
    repo_path: String,
    base_ref: String,
    head_ref: String,
) -> Result<String, LifecycleError> {
    crate::platform::git::status::get_git_ref_diff_patch(&repo_path, &base_ref, &head_ref).await
}

#[tauri::command]
pub async fn get_git_commit_patch(
    repo_path: String,
    sha: String,
) -> Result<crate::platform::git::status::GitCommitDiffResult, LifecycleError> {
    crate::platform::git::status::get_git_commit_patch(&repo_path, &sha).await
}

// ---------------------------------------------------------------------------
// Staging / commit / push
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn stage_git_files(
    repo_path: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    crate::platform::git::status::stage_git_files(&repo_path, &file_paths).await
}

#[tauri::command]
pub async fn unstage_git_files(
    repo_path: String,
    file_paths: Vec<String>,
) -> Result<(), LifecycleError> {
    crate::platform::git::status::unstage_git_files(&repo_path, &file_paths).await
}

#[tauri::command]
pub async fn commit_git(
    repo_path: String,
    message: String,
) -> Result<crate::platform::git::status::GitCommitResult, LifecycleError> {
    crate::platform::git::status::commit_git(&repo_path, &message).await
}

#[tauri::command]
pub async fn push_git(
    repo_path: String,
) -> Result<crate::platform::git::status::GitPushResult, LifecycleError> {
    crate::platform::git::status::push_git(&repo_path).await
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_git_pull_requests(
    repo_path: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestListResult, LifecycleError> {
    crate::platform::git::pull_request::list_open_pull_requests(&repo_path).await
}

#[tauri::command]
pub async fn get_current_git_pull_request(
    repo_path: String,
) -> Result<crate::platform::git::pull_request::GitBranchPullRequestResult, LifecycleError> {
    crate::platform::git::pull_request::get_current_branch_pull_request(&repo_path).await
}

#[tauri::command]
pub async fn get_git_pull_request(
    repo_path: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestDetailResult, LifecycleError> {
    crate::platform::git::pull_request::get_pull_request_detail(&repo_path, pull_request_number)
        .await
}

#[tauri::command]
pub async fn get_git_pull_request_patch(
    repo_path: String,
    pull_request_number: u64,
) -> Result<String, LifecycleError> {
    crate::platform::git::pull_request::get_pull_request_patch(&repo_path, pull_request_number)
        .await
}

#[tauri::command]
pub async fn create_git_pull_request(
    repo_path: String,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    crate::platform::git::pull_request::create_pull_request(&repo_path).await
}

#[tauri::command]
pub async fn merge_git_pull_request(
    repo_path: String,
    pull_request_number: u64,
) -> Result<crate::platform::git::pull_request::GitPullRequestSummary, LifecycleError> {
    crate::platform::git::pull_request::merge_pull_request(&repo_path, pull_request_number).await
}

// ---------------------------------------------------------------------------
// Worktree management
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn create_git_worktree(
    repo_path: String,
    base_ref: String,
    branch: String,
    name: String,
    id: String,
    worktree_root: Option<String>,
    copy_config_files: bool,
) -> Result<String, LifecycleError> {
    let worktree_path = crate::platform::git::worktree::create_worktree(
        &repo_path,
        &base_ref,
        &branch,
        &name,
        &id,
        worktree_root.as_deref(),
    )
    .await?;

    if copy_config_files {
        if let Err(e) =
            crate::platform::git::worktree::copy_local_config_files(&repo_path, &worktree_path)
        {
            let _ =
                crate::platform::git::worktree::remove_worktree(&repo_path, &worktree_path).await;
            return Err(e);
        }
    }

    Ok(worktree_path)
}

#[tauri::command]
pub async fn remove_git_worktree(
    repo_path: String,
    worktree_path: String,
) -> Result<(), LifecycleError> {
    crate::platform::git::worktree::remove_worktree(&repo_path, &worktree_path).await
}

#[tauri::command]
pub async fn rename_git_worktree_branch(
    worktree_path: String,
    current_branch: String,
    new_branch: String,
    rename_branch: bool,
    move_worktree: bool,
    repo_path: String,
    name: String,
    id: String,
) -> Result<Option<String>, LifecycleError> {
    let mut new_worktree_path: Option<String> = None;

    if rename_branch {
        crate::platform::git::worktree::rename_branch(
            &worktree_path,
            &current_branch,
            &new_branch,
        )
        .await?;
    }

    if move_worktree {
        new_worktree_path = Some(
            crate::platform::git::worktree::move_worktree(
                &repo_path,
                &worktree_path,
                &name,
                &id,
            )
            .await?,
        );
    }

    Ok(new_worktree_path)
}
