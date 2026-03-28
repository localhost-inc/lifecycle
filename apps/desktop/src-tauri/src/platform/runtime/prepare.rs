use crate::platform::process_manager::{publish_process_event, ProcessEvent};
use crate::platform::runtime::templates::expand_templates;
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ShellStep {
    pub name: String,
    pub command: Option<String>,
    pub write_files: Option<Vec<WriteFile>>,
    pub timeout_seconds: u64,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WriteFile {
    pub path: String,
    pub content: Option<String>,
    pub lines: Option<Vec<String>>,
}

pub async fn run_steps(
    app: &AppHandle,
    process_id: &str,
    root_path: &str,
    steps: &[ShellStep],
    runtime_env: &HashMap<String, String>,
    step_field_prefix: &str,
) -> Result<(), LifecycleError> {
    for step in steps {
        let cwd = step_cwd(root_path, step.cwd.as_deref());
        let step_field = format!("{step_field_prefix}.{}", step.name);
        let step_env = build_step_env(step, runtime_env, &step_field)?;

        match (step.command.as_deref(), step.write_files.as_deref()) {
            (Some(command), None) => {
                run_command_step(app, process_id, step, &cwd, command, &step_env).await?;
            }
            (None, Some(write_files)) => {
                run_write_files_step(step, root_path, &cwd, write_files, &step_env, &step_field)
                    .await?;
            }
            _ => {
                return Err(LifecycleError::InvalidInput {
                    field: step_field,
                    reason: "step requires exactly one of command or write_files".to_string(),
                });
            }
        }
    }

    Ok(())
}

fn build_step_env(
    step: &ShellStep,
    runtime_env: &HashMap<String, String>,
    step_field: &str,
) -> Result<HashMap<String, String>, LifecycleError> {
    let mut env = runtime_env.clone();
    if let Some(step_env) = step.env.as_ref() {
        for (key, value) in step_env {
            let expanded = expand_templates(
                value,
                runtime_env,
                &format!("{step_field}.env.{key}"),
            )?;
            env.insert(key.clone(), expanded);
        }
    }
    Ok(env)
}

fn step_cwd(root_path: &str, step_cwd: Option<&str>) -> PathBuf {
    match step_cwd {
        Some(step_cwd) => Path::new(root_path).join(step_cwd),
        None => PathBuf::from(root_path),
    }
}

async fn run_command_step(
    app: &AppHandle,
    process_id: &str,
    step: &ShellStep,
    cwd: &Path,
    command: &str,
    step_env: &HashMap<String, String>,
) -> Result<(), LifecycleError> {
    let mut cmd = Command::new("sh");
    cmd.args(["-c", command]).current_dir(cwd);

    for (key, value) in step_env {
        cmd.env(key, value);
    }

    cmd.env("FORCE_COLOR", "1");
    cmd.env("CLICOLOR_FORCE", "1");
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|_| LifecycleError::PrepareStepFailed {
        step: step.name.clone(),
        exit_code: -1,
    })?;

    if let Some(stdout) = child.stdout.take() {
        let app_clone = app.clone();
        let pid = process_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                publish_process_event(
                    &app_clone,
                    ProcessEvent::LogLine {
                        process_id: pid.clone(),
                        stream: "stdout".to_string(),
                        line,
                    },
                );
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        let pid = process_id.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                publish_process_event(
                    &app_clone,
                    ProcessEvent::LogLine {
                        process_id: pid.clone(),
                        stream: "stderr".to_string(),
                        line,
                    },
                );
            }
        });
    }

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(step.timeout_seconds),
        child.wait(),
    )
    .await;

    match result {
        Ok(Ok(exit_status)) => {
            if exit_status.success() {
                Ok(())
            } else {
                Err(LifecycleError::PrepareStepFailed {
                    step: step.name.clone(),
                    exit_code: exit_status.code().unwrap_or(-1),
                })
            }
        }
        Ok(Err(_)) => Err(LifecycleError::PrepareStepFailed {
            step: step.name.clone(),
            exit_code: -1,
        }),
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            Err(LifecycleError::PrepareStepTimeout {
                step: step.name.clone(),
            })
        }
    }
}

async fn run_write_files_step(
    step: &ShellStep,
    root_path: &str,
    cwd: &Path,
    write_files: &[WriteFile],
    step_env: &HashMap<String, String>,
    step_field: &str,
) -> Result<(), LifecycleError> {
    let write_future = async {
        let normalized_root = normalize_path(Path::new(root_path));
        for file in write_files {
            let target_path =
                resolve_write_target_path(&normalized_root, cwd, &file.path, step_field)?;
            let content = render_write_file_content(file, step_env, step_field)?;

            if let Some(parent) = target_path.parent() {
                tokio::fs::create_dir_all(parent).await.map_err(|error| {
                    LifecycleError::Io(format!(
                        "failed to create directory '{}': {error}",
                        parent.display()
                    ))
                })?;
            }
            tokio::fs::write(&target_path, content)
                .await
                .map_err(|error| {
                    LifecycleError::Io(format!(
                        "failed to write file '{}': {error}",
                        target_path.display()
                    ))
                })?;
        }

        Ok::<(), LifecycleError>(())
    };

    match tokio::time::timeout(
        std::time::Duration::from_secs(step.timeout_seconds),
        write_future,
    )
    .await
    {
        Ok(result) => result,
        Err(_) => Err(LifecycleError::PrepareStepTimeout {
            step: step.name.clone(),
        }),
    }
}

fn resolve_write_target_path(
    normalized_root: &Path,
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

    if !normalized_target.starts_with(normalized_root) {
        return Err(LifecycleError::InvalidInput {
            field: format!("{step_field}.write_files.path"),
            reason: format!(
                "path must stay inside root directory: {}",
                normalized_target.display()
            ),
        });
    }

    Ok(normalized_target)
}

fn render_write_file_content(
    file: &WriteFile,
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

    #[test]
    fn build_step_env_expands_reserved_runtime_templates() {
        let step = ShellStep {
            name: "write-env".to_string(),
            command: Some("printenv".to_string()),
            write_files: None,
            timeout_seconds: 10,
            cwd: None,
            env: Some(HashMap::from([(
                "API_ORIGIN".to_string(),
                "${API_URL}".to_string(),
            )])),
        };
        let runtime_env = HashMap::from([(
            "API_URL".to_string(),
            "http://api.example.localhost:3000".to_string(),
        )]);

        let env =
            build_step_env(&step, &runtime_env, "step.write-env").expect("step env builds");

        assert_eq!(
            env.get("API_ORIGIN").map(String::as_str),
            Some("http://api.example.localhost:3000")
        );
    }

    #[test]
    fn expand_setup_template_substitutes_env() {
        let env = HashMap::from([
            ("APP_SLUG".to_string(), "my-app".to_string()),
            ("API_PORT".to_string(), "3001".to_string()),
        ]);

        let rendered = expand_setup_template(
            "NAMESPACE=${APP_SLUG}\nPORT=${API_PORT}",
            &env,
            "step.write-env.write_files.lines",
        )
        .expect("template expansion succeeds");

        assert_eq!(rendered, "NAMESPACE=my-app\nPORT=3001");
    }

    #[test]
    fn expand_setup_template_rejects_unknown_vars() {
        let env = HashMap::new();
        let error = expand_setup_template(
            "PORT=${API_PORT}",
            &env,
            "step.write-env.write_files.lines",
        )
        .expect_err("missing vars should fail");

        match error {
            LifecycleError::InvalidInput { reason, .. } => {
                assert!(reason.contains("unknown template variable"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn render_write_file_content_joins_lines_with_trailing_newline() {
        let env = HashMap::from([("NAME".to_string(), "kin".to_string())]);
        let file = WriteFile {
            path: "apps/api/.env.local".to_string(),
            content: None,
            lines: Some(vec!["NAME=${NAME}".to_string()]),
        };

        let rendered =
            render_write_file_content(&file, &env, "step.write-env").expect("line rendering");

        assert_eq!(rendered, "NAME=kin\n");
    }

    #[test]
    fn resolve_write_target_path_rejects_paths_outside_root() {
        let root = normalize_path(Path::new("/tmp/worktree"));
        let cwd = root.join("apps/api");
        let error = resolve_write_target_path(&root, &cwd, "../../../outside.env", "step.write-env")
            .expect_err("outside path should fail");

        match error {
            LifecycleError::InvalidInput { reason, .. } => {
                assert!(reason.contains("path must stay inside root directory"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
