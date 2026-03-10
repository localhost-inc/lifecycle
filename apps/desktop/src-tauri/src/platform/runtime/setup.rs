use crate::capabilities::workspaces::manifest::SetupStep;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub async fn run_setup_steps(
    app: &AppHandle,
    workspace_id: &str,
    worktree_path: &str,
    steps: &[SetupStep],
    runtime_env: &std::collections::HashMap<String, String>,
) -> Result<(), LifecycleError> {
    for step in steps {
        let cwd = if let Some(ref step_cwd) = step.cwd {
            format!("{}/{}", worktree_path, step_cwd)
        } else {
            worktree_path.to_string()
        };

        publish_lifecycle_event(
            app,
            LifecycleEvent::SetupStepProgress {
                workspace_id: workspace_id.to_string(),
                step_name: step.name.clone(),
                event_kind: "started".to_string(),
                data: None,
            },
        );

        // Parse command into shell execution
        let mut cmd = Command::new("sh");
        cmd.args(["-c", &step.command]).current_dir(&cwd);

        if let Some(ref env_vars) = step.env_vars {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }
        for (key, value) in runtime_env {
            cmd.env(key, value);
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|_| LifecycleError::SetupStepFailed {
            step: step.name.clone(),
            exit_code: -1,
        })?;

        // Stream stdout
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let app_clone = app.clone();
        let ws_id = workspace_id.to_string();
        let step_name = step.name.clone();

        let stdout_handle = if let Some(stdout) = stdout {
            let app_c = app_clone.clone();
            let ws = ws_id.clone();
            let sn = step_name.clone();
            Some(tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    publish_lifecycle_event(
                        &app_c,
                        LifecycleEvent::SetupStepProgress {
                            workspace_id: ws.clone(),
                            step_name: sn.clone(),
                            event_kind: "stdout".to_string(),
                            data: Some(line),
                        },
                    );
                }
            }))
        } else {
            None
        };

        let stderr_handle = if let Some(stderr) = stderr {
            let app_c = app_clone.clone();
            let ws = ws_id.clone();
            let sn = step_name.clone();
            Some(tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    publish_lifecycle_event(
                        &app_c,
                        LifecycleEvent::SetupStepProgress {
                            workspace_id: ws.clone(),
                            step_name: sn.clone(),
                            event_kind: "stderr".to_string(),
                            data: Some(line),
                        },
                    );
                }
            }))
        } else {
            None
        };

        // Wait with timeout
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(step.timeout_seconds),
            child.wait(),
        )
        .await;

        // Wait for stream handles to finish
        if let Some(h) = stdout_handle {
            let _ = h.await;
        }
        if let Some(h) = stderr_handle {
            let _ = h.await;
        }

        match result {
            Ok(Ok(exit_status)) => {
                if !exit_status.success() {
                    let exit_code = exit_status.code().unwrap_or(-1);
                    publish_lifecycle_event(
                        app,
                        LifecycleEvent::SetupStepProgress {
                            workspace_id: workspace_id.to_string(),
                            step_name: step.name.clone(),
                            event_kind: "failed".to_string(),
                            data: Some(format!("Exit code: {exit_code}")),
                        },
                    );
                    return Err(LifecycleError::SetupStepFailed {
                        step: step.name.clone(),
                        exit_code,
                    });
                }
            }
            Ok(Err(_)) => {
                return Err(LifecycleError::SetupStepFailed {
                    step: step.name.clone(),
                    exit_code: -1,
                });
            }
            Err(_) => {
                // Timeout — kill the child
                let _ = child.kill().await;
                publish_lifecycle_event(
                    app,
                    LifecycleEvent::SetupStepProgress {
                        workspace_id: workspace_id.to_string(),
                        step_name: step.name.clone(),
                        event_kind: "timeout".to_string(),
                        data: None,
                    },
                );
                return Err(LifecycleError::SetupStepTimeout {
                    step: step.name.clone(),
                });
            }
        }

        publish_lifecycle_event(
            app,
            LifecycleEvent::SetupStepProgress {
                workspace_id: workspace_id.to_string(),
                step_name: step.name.clone(),
                event_kind: "completed".to_string(),
                data: None,
            },
        );
    }

    Ok(())
}
