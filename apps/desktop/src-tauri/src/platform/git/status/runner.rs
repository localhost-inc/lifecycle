use crate::shared::errors::LifecycleError;
use tokio::process::Command;

pub(super) struct GitCommandOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub status: std::process::ExitStatus,
}

pub(super) fn git_failure(operation: &str, stderr: &[u8]) -> LifecycleError {
    let reason = {
        let stderr = String::from_utf8_lossy(stderr).trim().to_string();
        if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        }
    };

    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason,
    }
}

pub(super) async fn git_command(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<GitCommandOutput, LifecycleError> {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: operation.to_string(),
            reason: error.to_string(),
        })?;

    Ok(GitCommandOutput {
        stdout: output.stdout,
        stderr: output.stderr,
        status: output.status,
    })
}

pub(super) async fn git_output(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<Vec<u8>, LifecycleError> {
    let output = git_command(repo_path, operation, args).await?;
    if !output.status.success() {
        return Err(git_failure(operation, &output.stderr));
    }

    Ok(output.stdout)
}

pub(super) async fn git_output_allow_exit(
    repo_path: &str,
    operation: &str,
    args: &[&str],
    allowed_exit_codes: &[i32],
) -> Result<GitCommandOutput, LifecycleError> {
    let output = git_command(repo_path, operation, args).await?;
    if output.status.success() {
        return Ok(output);
    }

    let exit_code = output.status.code();
    if exit_code.is_some_and(|code| allowed_exit_codes.contains(&code)) {
        return Ok(output);
    }

    Err(git_failure(operation, &output.stderr))
}

pub(super) async fn git_output_optional(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<Option<Vec<u8>>, LifecycleError> {
    let output = git_command(repo_path, operation, args).await?;
    if output.status.success() {
        Ok(Some(output.stdout))
    } else {
        Ok(None)
    }
}
