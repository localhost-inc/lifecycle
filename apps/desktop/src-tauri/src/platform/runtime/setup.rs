use crate::capabilities::workspaces::manifest::{SetupStep, SetupWriteFile};
use crate::platform::runtime::templates::expand_reserved_runtime_templates;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub async fn run_setup_steps(
    app: &AppHandle,
    workspace_id: &str,
    worktree_path: &str,
    steps: &[SetupStep],
    runtime_env: &HashMap<String, String>,
) -> Result<(), LifecycleError> {
    for step in steps {
        let cwd = step_cwd(worktree_path, step.cwd.as_deref());
        let step_env = build_step_env(step, runtime_env)?;

        publish_setup_step_event(app, workspace_id, &step.name, "started", None);

        match (step.command.as_deref(), step.write_files.as_deref()) {
            (Some(command), None) => {
                run_command_step(app, workspace_id, step, &cwd, command, &step_env).await?;
            }
            (None, Some(write_files)) => {
                run_write_files_step(
                    app,
                    workspace_id,
                    step,
                    worktree_path,
                    &cwd,
                    write_files,
                    &step_env,
                )
                .await?;
            }
            _ => {
                publish_setup_step_event(
                    app,
                    workspace_id,
                    &step.name,
                    "failed",
                    Some("setup step requires exactly one of command or write_files".to_string()),
                );
                return Err(LifecycleError::InvalidInput {
                    field: format!("setup.steps.{}", step.name),
                    reason: "setup step requires exactly one of command or write_files".to_string(),
                });
            }
        }

        publish_setup_step_event(app, workspace_id, &step.name, "completed", None);
    }

    Ok(())
}

fn build_step_env(
    step: &SetupStep,
    runtime_env: &HashMap<String, String>,
) -> Result<HashMap<String, String>, LifecycleError> {
    let mut env = runtime_env.clone();
    if let Some(step_env_vars) = step.env_vars.as_ref() {
        for (key, value) in step_env_vars {
            let expanded = expand_reserved_runtime_templates(
                value,
                runtime_env,
                &format!("setup.steps.{}.env_vars.{key}", step.name),
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

fn publish_setup_step_event(
    app: &AppHandle,
    workspace_id: &str,
    step_name: &str,
    event_kind: &str,
    data: Option<String>,
) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::SetupStepProgress {
            workspace_id: workspace_id.to_string(),
            step_name: step_name.to_string(),
            event_kind: event_kind.to_string(),
            data,
        },
    );
}

async fn run_command_step(
    app: &AppHandle,
    workspace_id: &str,
    step: &SetupStep,
    cwd: &Path,
    command: &str,
    step_env: &HashMap<String, String>,
) -> Result<(), LifecycleError> {
    let mut cmd = Command::new("sh");
    cmd.args(["-c", command]).current_dir(cwd);

    for (key, value) in step_env {
        cmd.env(key, value);
    }

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
                publish_setup_step_event(&app_clone, &ws_id, &step_name, "stdout", Some(line));
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
                publish_setup_step_event(&app_clone, &ws_id, &step_name, "stderr", Some(line));
            }
        })
    });

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(step.timeout_seconds),
        child.wait(),
    )
    .await;

    if let Some(handle) = stdout_handle {
        let _ = handle.await;
    }
    if let Some(handle) = stderr_handle {
        let _ = handle.await;
    }

    match result {
        Ok(Ok(exit_status)) => {
            if exit_status.success() {
                Ok(())
            } else {
                let exit_code = exit_status.code().unwrap_or(-1);
                publish_setup_step_event(
                    app,
                    workspace_id,
                    &step.name,
                    "failed",
                    Some(format!("Exit code: {exit_code}")),
                );
                Err(LifecycleError::SetupStepFailed {
                    step: step.name.clone(),
                    exit_code,
                })
            }
        }
        Ok(Err(_)) => Err(LifecycleError::SetupStepFailed {
            step: step.name.clone(),
            exit_code: -1,
        }),
        Err(_) => {
            let _ = child.kill().await;
            publish_setup_step_event(app, workspace_id, &step.name, "timeout", None);
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
    worktree_path: &str,
    cwd: &Path,
    write_files: &[SetupWriteFile],
    step_env: &HashMap<String, String>,
) -> Result<(), LifecycleError> {
    let write_future = async {
        let normalized_worktree = normalize_path(Path::new(worktree_path));
        for file in write_files {
            let target_path =
                resolve_write_target_path(&normalized_worktree, cwd, &file.path, &step.name)?;
            let rendered_path = target_path
                .strip_prefix(&normalized_worktree)
                .unwrap_or(&target_path)
                .display()
                .to_string();
            let content = render_write_file_content(file, step_env, &step.name)?;

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

            publish_setup_step_event(
                app,
                workspace_id,
                &step.name,
                "stdout",
                Some(format!("wrote {}", rendered_path)),
            );
        }

        Ok::<(), LifecycleError>(())
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(step.timeout_seconds),
        write_future,
    )
    .await
    {
        Ok(result) => {
            if let Err(error) = &result {
                publish_setup_step_event(
                    app,
                    workspace_id,
                    &step.name,
                    "failed",
                    Some(error.to_string()),
                );
            }
            result
        }
        Err(_) => {
            publish_setup_step_event(app, workspace_id, &step.name, "timeout", None);
            Err(LifecycleError::SetupStepTimeout {
                step: step.name.clone(),
            })
        }
    }
}

fn resolve_write_target_path(
    normalized_worktree: &Path,
    cwd: &Path,
    raw_path: &str,
    step_name: &str,
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
            field: format!("setup.steps.{step_name}.write_files.path"),
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
    step_name: &str,
) -> Result<String, LifecycleError> {
    match (&file.content, &file.lines) {
        (Some(content), None) => expand_setup_template(
            content,
            env,
            &format!("setup.steps.{step_name}.write_files.content"),
        ),
        (None, Some(lines)) => {
            let mut rendered_lines = Vec::with_capacity(lines.len());
            for line in lines {
                rendered_lines.push(expand_setup_template(
                    line,
                    env,
                    &format!("setup.steps.{step_name}.write_files.lines"),
                )?);
            }
            Ok(rendered_lines.join("\n") + "\n")
        }
        _ => Err(LifecycleError::InvalidInput {
            field: format!("setup.steps.{step_name}.write_files"),
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

    #[test]
    fn build_step_env_expands_reserved_runtime_templates() {
        let step = SetupStep {
            name: "write-env".to_string(),
            command: Some("printenv".to_string()),
            write_files: None,
            timeout_seconds: 10,
            cwd: None,
            env_vars: Some(HashMap::from([(
                "API_ORIGIN".to_string(),
                "http://${LIFECYCLE_SERVICE_API_ADDRESS}".to_string(),
            )])),
            run_on: None,
        };
        let runtime_env = HashMap::from([(
            "LIFECYCLE_SERVICE_API_ADDRESS".to_string(),
            "127.0.0.1:3001".to_string(),
        )]);

        let env = build_step_env(&step, &runtime_env).expect("step env builds");

        assert_eq!(
            env.get("API_ORIGIN").map(String::as_str),
            Some("http://127.0.0.1:3001")
        );
    }

    #[test]
    fn expand_setup_template_substitutes_env_vars() {
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
            "setup.steps.write-env.write_files.lines",
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
            "setup.steps.write-env.write_files.lines",
        )
        .expect_err("missing vars should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "setup.steps.write-env.write_files.lines");
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

        let rendered =
            render_write_file_content(&file, &env, "write-env").expect("line rendering succeeds");

        assert_eq!(rendered, "NAME=kin\n");
    }

    #[test]
    fn resolve_write_target_path_rejects_paths_outside_worktree() {
        let worktree = normalize_path(Path::new("/tmp/worktree"));
        let cwd = worktree.join("apps/api");
        let error = resolve_write_target_path(&worktree, &cwd, "../../../outside.env", "write-env")
            .expect_err("outside path should fail");

        match error {
            LifecycleError::InvalidInput { field, reason } => {
                assert_eq!(field, "setup.steps.write-env.write_files.path");
                assert!(reason.contains("path must stay inside workspace worktree"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
