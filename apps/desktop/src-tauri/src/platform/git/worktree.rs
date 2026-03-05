use crate::shared::errors::LifecycleError;
use tokio::process::Command;

const WORKTREE_DIR: &str = ".lifecycle/worktrees";

pub async fn create_worktree(
    repo_path: &str,
    source_ref: &str,
    workspace_id: &str,
) -> Result<String, LifecycleError> {
    let worktree_path = format!("{}/{}/{}", repo_path, WORKTREE_DIR, workspace_id);

    let output = Command::new("git")
        .args(["worktree", "add", &worktree_path, source_ref])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git worktree add failed: {stderr}"
        )));
    }

    Ok(worktree_path)
}

pub async fn remove_worktree(repo_path: &str, worktree_path: &str) -> Result<(), LifecycleError> {
    let _ = Command::new("git")
        .args(["worktree", "remove", "--force", worktree_path])
        .current_dir(repo_path)
        .output()
        .await;

    Ok(())
}

pub async fn get_sha(repo_path: &str, ref_name: &str) -> Result<String, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", ref_name])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git rev-parse failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub async fn get_current_branch(repo_path: &str) -> Result<String, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|e| LifecycleError::RepoCloneFailed(e.to_string()))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(LifecycleError::RepoCloneFailed(format!(
            "git rev-parse --abbrev-ref HEAD failed: {stderr}"
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
