use crate::capabilities::workspaces::controller::WorkspaceControllerToken;
use crate::capabilities::workspaces::manifest::{SetupStep, SetupWriteFile};
use crate::platform::runtime::templates::expand_reserved_runtime_templates;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone, Copy)]
pub enum StepProgressTarget {
    WorkspaceSetup,
    EnvironmentTask,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StepRunOutcome {
    Cancelled,
    Completed,
}

pub async fn run_steps(
    app: &AppHandle,
    workspace_id: &str,
    worktree_path: &str,
    steps: &[SetupStep],
    runtime_env: &HashMap<String, String>,
    step_field_prefix: &str,
    progress_target: StepProgressTarget,
    cancellation_token: Option<WorkspaceControllerToken>,
) -> Result<StepRunOutcome, LifecycleError> {
    for step in steps {
        if cancellation_token
            .as_ref()
            .map(WorkspaceControllerToken::is_cancelled)
            .unwrap_or(false)
        {
            return Ok(StepRunOutcome::Cancelled);
        }

        let cwd = step_cwd(worktree_path, step.cwd.as_deref());
        let step_field = format!("{step_field_prefix}.{}", step.name);
        let step_env = build_step_env(step, runtime_env, &step_field)?;

        publish_step_progress_event(
            app,
            workspace_id,
            &step.name,
            progress_target,
            "started",
            None,
        );

        match (step.command.as_deref(), step.write_files.as_deref()) {
            (Some(command), None) => {
                run_command_step(
                    app,
                    workspace_id,
                    step,
                    progress_target,
                    &cwd,
                    command,
                    &step_env,
                    cancellation_token.clone(),
                )
                .await?;
            }
            (None, Some(write_files)) => {
                run_write_files_step(
                    app,
                    workspace_id,
                    step,
                    progress_target,
                    worktree_path,
                    &cwd,
                    write_files,
                    &step_env,
                    &step_field,
                    cancellation_token.clone(),
                )
                .await?;
            }
            _ => {
                publish_step_progress_event(
                    app,
                    workspace_id,
                    &step.name,
                    progress_target,
                    "failed",
                    Some("setup step requires exactly one of command or write_files".to_string()),
                );
                return Err(LifecycleError::InvalidInput {
                    field: step_field,
                    reason: "setup step requires exactly one of command or write_files".to_string(),
                });
            }
        }

        publish_step_progress_event(
            app,
            workspace_id,
            &step.name,
            progress_target,
            "completed",
            None,
        );
    }

    Ok(StepRunOutcome::Completed)
}

fn build_step_env(
    step: &SetupStep,
    runtime_env: &HashMap<String, String>,
    step_field: &str,
) -> Result<HashMap<String, String>, LifecycleError> {
    let mut env = runtime_env.clone();
    if let Some(step_env) = step.env.as_ref() {
        for (key, value) in step_env {
            let expanded = expand_reserved_runtime_templates(
                value,
                runtime_env,
                &format!("{step_field}.env.{key}"),
            )?;
            env.insert(key.clone(), expanded);
        }
    }
    Ok(env)
}

fn step_cwd(worktree_path: &str, step_cwd: Option<&str>) -> PathBuf {
    match step_cwd {
        Some(step_cwd) => Path::new(worktree_path).join(step_cwd),
        None => PathBuf::from(worktree_path),
    }
}

fn publish_step_progress_event(
    app: &AppHandle,
    workspace_id: &str,
    step_name: &str,
    progress_target: StepProgressTarget,
    event_kind: &str,
    data: Option<String>,
) {
    let event = match progress_target {
        StepProgressTarget::WorkspaceSetup => LifecycleEvent::WorkspaceSetupProgress {
            workspace_id: workspace_id.to_string(),
            step_name: step_name.to_string(),
            event_kind: event_kind.to_string(),
            data,
        },
        StepProgressTarget::EnvironmentTask => LifecycleEvent::EnvironmentTaskProgress {
            workspace_id: workspace_id.to_string(),
            step_name: step_name.to_string(),
            event_kind: event_kind.to_string(),
            data,
        },
    };
    publish_lifecycle_event(app, event);
}

async fn run_command_step(
    app: &AppHandle,
    workspace_id: &str,
    step: &SetupStep,
    progress_target: StepProgressTarget,
    cwd: &Path,
    command: &str,
    step_env: &HashMap<String, String>,
    cancellation_token: Option<WorkspaceControllerToken>,
) -> Result<StepRunOutcome, LifecycleError> {
    let mut cmd = Command::new("sh");
    cmd.args(["-c", command]).current_dir(cwd);

    for (key, value) in step_env {
        cmd.env(key, value);
    }

    // Force color output even though stdout/stderr are piped, not a TTY.
    cmd.env("FORCE_COLOR", "1");
    cmd.env("CLICOLOR_FORCE", "1");

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|_| LifecycleError::SetupStepFailed {
        step: step.name.clone(),
        exit_code: -1,
    })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let ws_id = workspace_id.to_string();
    let step_name = step.name.clone();

    let stdout_handle = stdout.map(|stdout| {
        let app_clone = app_clone.clone();
        let ws_id = ws_id.clone();
        let step_name = step_name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                publish_step_progress_event(
                    &app_clone,
                    &ws_id,
                    &step_name,
                    progress_target,
                    "stdout",
                    Some(line),
                );
            }
        })
    });

    let stderr_handle = stderr.map(|stderr| {
        let app_clone = app.clone();
        let ws_id = workspace_id.to_string();
        let step_name = step.name.clone();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                publish_step_progress_event(
                    &app_clone,
                    &ws_id,
                    &step_name,
                    progress_target,
                    "stderr",
                    Some(line),
                );
            }
        })
    });

    let result = wait_for_command_exit(
        &mut child,
        std::time::Duration::from_secs(step.timeout_seconds),
        cancellation_token,
    )
    .await;

    // Drain remaining output with a timeout. If a grandchild process
    // inherited our pipe file descriptors the readers will block
    // indefinitely even though the direct child has already exited.
    let drain_timeout = std::time::Duration::from_secs(2);
    if let Some(handle) = stdout_handle {
        let _ = tokio::time::timeout(drain_timeout, handle).await;
    }
    if let Some(handle) = stderr_handle {
        let _ = tokio::time::timeout(drain_timeout, handle).await;
    }

    match result {
        CommandStepWaitResult::Exited(Ok(exit_status)) => {
            if exit_status.success() {
                Ok(StepRunOutcome::Completed)
            } else {
                let exit_code = exit_status.code().unwrap_or(-1);
                publish_step_progress_event(
                    app,
                    workspace_id,
                    &step.name,
                    progress_target,
                    "failed",
                    Some(format!("Exit code: {exit_code}")),
                );
                Err(LifecycleError::SetupStepFailed {
                    step: step.name.clone(),
                    exit_code,
                })
            }
        }
        CommandStepWaitResult::Exited(Err(_)) => Err(LifecycleError::SetupStepFailed {
            step: step.name.clone(),
            exit_code: -1,
        }),
        CommandStepWaitResult::Cancelled => Ok(StepRunOutcome::Cancelled),
        CommandStepWaitResult::TimedOut => {
            publish_step_progress_event(
                app,
                workspace_id,
                &step.name,
                progress_target,
                "timeout",
                None,
            );
            Err(LifecycleError::SetupStepTimeout {
                step: step.name.clone(),
            })
        }
    }
}

async fn run_write_files_step(
    app: &AppHandle,
    workspace_id: &str,
    step: &SetupStep,
    progress_target: StepProgressTarget,
    worktree_path: &str,
    cwd: &Path,
    write_files: &[SetupWriteFile],
    step_env: &HashMap<String, String>,
    step_field: &str,
    cancellation_token: Option<WorkspaceControllerToken>,
) -> Result<StepRunOutcome, LifecycleError> {
    let write_future = async {
        let normalized_worktree = normalize_path(Path::new(worktree_path));
        for file in write_files {
            if cancellation_token
                .as_ref()
                .map(WorkspaceControllerToken::is_cancelled)
                .unwrap_or(false)
            {
                return Ok::<StepRunOutcome, LifecycleError>(StepRunOutcome::Cancelled);
            }
            let target_path =
                resolve_write_target_path(&normalized_worktree, cwd, &file.path, step_field)?;
            let rendered_path = target_path
                .strip_prefix(&normalized_worktree)
                .unwrap_or(&target_path)
                .display()
                .to_string();
            let content = render_write_file_content(file, step_env, step_field)?;

            if let Some(parent) = target_path.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|error| {
                    LifecycleError::Io(format!(
                        "failed to create setup file directory '{}': {error}",
                        parent.display()
                    ))
                })?;
            }
            tokio::fs::write(&target_path, content)
                .await
                .map_err(|error| {
                    LifecycleError::Io(format!(
                        "failed to write setup file '{}': {error}",
                        target_path.display()
                    ))
                })?;

            publish_step_progress_event(
                app,
                workspace_id,
                &step.name,
                progress_target,
                "stdout",
                Some(format!("wrote {}", rendered_path)),
            );
        }

        Ok::<StepRunOutcome, LifecycleError>(StepRunOutcome::Completed)
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(step.timeout_seconds),
        write_future,
    )
    .await
    {
        Ok(result) => {
            if let Err(error) = &result {
                publish_step_progress_event(
                    app,
                    workspace_id,
                    &step.name,
                    progress_target,
                    "failed",
                    Some(error.to_string()),
                );
            }
            result
        }
        Err(_) => {
            publish_step_progress_event(
                app,
                workspace_id,
                &step.name,
                progress_target,
                "timeout",
                None,
            );
            Err(LifecycleError::SetupStepTimeout {
                step: step.name.clone(),
            })
        }
    }
}

enum CommandStepWaitResult {
    Cancelled,
    Exited(Result<std::process::ExitStatus, std::io::Error>),
    TimedOut,
}

async fn wait_for_command_exit(
    child: &mut tokio::process::Child,
    timeout_duration: std::time::Duration,
    mut cancellation_token: Option<WorkspaceControllerToken>,
) -> CommandStepWaitResult {
    if cancellation_token
        .as_ref()
        .map(WorkspaceControllerToken::is_cancelled)
        .unwrap_or(false)
    {
        let _ = child.kill().await;
        let _ = child.wait().await;
        return CommandStepWaitResult::Cancelled;
    }

    if let Some(cancellation_token) = cancellation_token.as_mut() {
        tokio::select! {
            result = tokio::time::timeout(timeout_duration, child.wait()) => {
                match result {
                    Ok(result) => CommandStepWaitResult::Exited(result),
                    Err(_) => {
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                        CommandStepWaitResult::TimedOut
                    }
                }
            }
            _ = cancellation_token.cancelled() => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                CommandStepWaitResult::Cancelled
            }
        }
    } else {
        match tokio::time::timeout(timeout_duration, child.wait()).await {
            Ok(result) => CommandStepWaitResult::Exited(result),
            Err(_) => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                CommandStepWaitResult::TimedOut
            }
        }
    }
}

fn resolve_write_target_path(
    normalized_worktree: &Path,
    cwd: &Path,
    raw_path: &str,
    step_field: &str,
) -> Result<PathBuf, LifecycleError> {
    let interpolated_path = Path::new(raw_path);
    let target_path = if interpolated_path.is_absolute() {
        interpolated_path.to_path_buf()
    } else {
        cwd.join(interpolated_path)
    };
    let normalized_target = normalize_path(&target_path);

    if !normalized_target.starts_with(normalized_worktree) {
        return Err(LifecycleError::InvalidInput {
            field: format!("{step_field}.write_files.path"),
            reason: format!(
                "path must stay inside workspace worktree: {}",
                normalized_target.display()
            ),
        });
    }

    Ok(normalized_target)
}

fn render_write_file_content(
    file: &SetupWriteFile,
    env: &HashMap<String, String>,
    step_field: &str,
) -> Result<String, LifecycleError> {
    match (&file.content, &file.lines) {
        (Some(content), None) => {
            expand_setup_template(content, env, &format!("{step_field}.write_files.content"))
        }
        (None, Some(lines)) => {
            let mut rendered_lines = Vec::with_capacity(lines.len());
            for line in lines {
                rendered_lines.push(expand_setup_template(
                    line,
                    env,
                    &format!("{step_field}.write_files.lines"),
                )?);
            }
            Ok(rendered_lines.join("\n") + "\n")
        }
        _ => Err(LifecycleError::InvalidInput {
            field: format!("{step_field}.write_files"),
            reason: "write_files entries require exactly one of content or lines".to_string(),
        }),
    }
}

fn expand_setup_template(
    input: &str,
    env: &HashMap<String, String>,
    field: &str,
) -> Result<String, LifecycleError> {
    let mut output = String::new();
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        output.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find('}') else {
            return Err(LifecycleError::InvalidInput {
                field: field.to_string(),
                reason: format!("unterminated template in '{input}'"),
            });
        };
        let key = &after_start[..end];
        let value = env.get(key).ok_or_else(|| LifecycleError::InvalidInput {
            field: field.to_string(),
            reason: format!("unknown template variable '{key}'"),
        })?;
        output.push_str(value);
        rest = &after_start[end + 1..];
    }

    output.push_str(rest);
    Ok(output)
}

fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            Component::RootDir | Component::Prefix(_) | Component::Normal(_) => {
                normalized.push(component.as_os_str());
            }
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::controller::WorkspaceController;

    #[test]
    fn build_step_env_expands_reserved_runtime_templates() {
        let step = SetupStep {
            name: "write-env".to_string(),
            command: Some("printenv".to_string()),
            write_files: None,
            timeout_seconds: 10,
            cwd: None,
            env: Some(HashMap::from([(
                "API_ORIGIN".to_string(),
                "${LIFECYCLE_SERVICE_API_URL}".to_string(),
            )])),
            depends_on: None,
            run_on: None,
        };
        let runtime_env = HashMap::from([(
            "LIFECYCLE_SERVICE_API_URL".to_string(),
            "http://api.frost-beacon-57f59253.lifecycle.localhost:52300".to_string(),
        )]);

        let env = build_step_env(&step, &runtime_env, "workspace.setup.write-env")
            .expect("step env builds");

        assert_eq!(
            env.get("API_ORIGIN").map(String::as_str),
            Some("http://api.frost-beacon-57f59253.lifecycle.localhost:52300")
        );
    }

    #[test]
    fn expand_setup_template_substitutes_env() {
        let env = HashMap::from([
            (
                "LIFECYCLE_WORKSPACE_SLUG".to_string(),
                "kin-workspace".to_string(),
            ),
            ("LIFECYCLE_SERVICE_API_PORT".to_string(), "3001".to_string()),
        ]);

        let rendered = expand_setup_template(
            "NAMESPACE=${LIFECYCLE_WORKSPACE_SLUG}\nPORT=${LIFECYCLE_SERVICE_API_PORT}",
            &env,
            "workspace.setup.write-env.write_files.lines",
        )
        .expect("template expansion succeeds");

        assert_eq!(rendered, "NAMESPACE=kin-workspace\nPORT=3001");
    }

    #[test]
    fn expand_setup_template_rejects_unknown_vars() {
        let env = HashMap::new();
        let error = expand_setup_template(
            "PORT=${LIFECYCLE_SERVICE_API_PORT}",
            &env,
            "workspace.setup.write-env.write_files.lines",
        )
        .expect_err("missing vars should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "workspace.setup.write-env.write_files.lines");
                assert!(reason.contains("unknown template variable"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn render_write_file_content_joins_lines_with_trailing_newline() {
        let env = HashMap::from([("NAME".to_string(), "kin".to_string())]);
        let file = SetupWriteFile {
            path: "apps/api/.env.local".to_string(),
            content: None,
            lines: Some(vec!["NAME=${NAME}".to_string()]),
        };

        let rendered = render_write_file_content(&file, &env, "workspace.setup.write-env")
            .expect("line rendering succeeds");

        assert_eq!(rendered, "NAME=kin\n");
    }

    #[test]
    fn resolve_write_target_path_rejects_paths_outside_worktree() {
        let worktree = normalize_path(Path::new("/tmp/worktree"));
        let cwd = worktree.join("apps/api");
        let error = resolve_write_target_path(
            &worktree,
            &cwd,
            "../../../outside.env",
            "workspace.setup.write-env",
        )
        .expect_err("outside path should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "workspace.setup.write-env.write_files.path");
                assert!(reason.contains("path must stay inside workspace worktree"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[tokio::test]
    async fn wait_for_command_exit_returns_cancelled_when_controller_requests_stop() {
        let controller = WorkspaceController::new();
        let token = controller.begin_start().await.expect("start token");
        let mut child = Command::new("sh")
            .args(["-c", "sleep 30"])
            .spawn()
            .expect("spawn command");

        controller.request_stop().await;

        let result =
            wait_for_command_exit(&mut child, std::time::Duration::from_secs(30), Some(token))
                .await;

        assert!(matches!(result, CommandStepWaitResult::Cancelled));
    }
}
