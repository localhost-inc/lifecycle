use crate::shared::errors::{LifecycleError, TerminalType};
use std::path::Path;

use super::persistence::TerminalWorkspaceContext;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct TerminalLaunchSpec {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
    pub(crate) treat_nonzero_as_failure: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct DockerExecLaunchSpec<'a> {
    pub(crate) container_name: &'a str,
    pub(crate) launch: &'a TerminalLaunchSpec,
    pub(crate) container_working_directory: &'a str,
    pub(crate) environment: &'a [(String, String)],
    pub(crate) home_directory: Option<String>,
    pub(crate) user: Option<(u32, u32)>,
}

fn shell_command_line(launch: &TerminalLaunchSpec) -> String {
    let mut parts = Vec::with_capacity(1 + launch.args.len());
    parts.push(shell_quote(&launch.program));
    parts.extend(launch.args.iter().map(|arg| shell_quote(arg)));
    parts.join(" ")
}

pub(crate) fn resolved_login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

pub(crate) fn login_shell_command(command: &str) -> String {
    let shell = resolved_login_shell();
    format!("{} -l -c {}", shell_quote(&shell), shell_quote(command))
}

pub(crate) fn resolve_terminal_working_directory(
    workspace: &TerminalWorkspaceContext,
) -> Result<String, LifecycleError> {
    if !workspace.worktree_path.is_empty() && Path::new(&workspace.worktree_path).is_dir() {
        return Ok(workspace.worktree_path.clone());
    }

    if !workspace.project_path.is_empty() && Path::new(&workspace.project_path).is_dir() {
        return Ok(workspace.project_path.clone());
    }

    Err(LifecycleError::AttachFailed(
        "workspace does not have a valid shell working directory".to_string(),
    ))
}

pub(crate) fn native_terminal_command(
    launch_type: &TerminalType,
    launch: &TerminalLaunchSpec,
    environment: &[(String, String)],
) -> String {
    match launch_type {
        // Embedded Ghostty treats `command` as a shell-expanded string and
        // force-enables wait-after-command. Plain shell tabs should use the
        // runtime's default-shell startup path instead of command mode.
        TerminalType::Shell => String::new(),
        _ => {
            let mut command_parts = environment
                .iter()
                .map(|(key, value)| format!("export {key}={}", shell_quote(value)))
                .collect::<Vec<String>>();
            command_parts.push(format!("exec {}", shell_command_line(launch)));
            login_shell_command(&command_parts.join("; "))
        }
    }
}

pub(crate) fn docker_terminal_command(spec: &DockerExecLaunchSpec<'_>) -> String {
    let mut parts = vec!["docker".to_string(), "exec".to_string(), "-it".to_string()];

    if let Some((uid, gid)) = spec.user {
        parts.push("--user".to_string());
        parts.push(format!("{uid}:{gid}"));
    }

    if let Some(home_directory) = spec.home_directory.as_deref() {
        parts.push("--env".to_string());
        parts.push(format!("HOME={home_directory}"));
    }

    for (key, value) in spec.environment {
        parts.push("--env".to_string());
        parts.push(format!("{key}={value}"));
    }

    parts.push("--workdir".to_string());
    parts.push(spec.container_working_directory.to_string());
    parts.push(spec.container_name.to_string());
    parts.push(spec.launch.program.clone());
    parts.extend(spec.launch.args.clone());

    parts
        .iter()
        .map(|part| shell_quote(part))
        .collect::<Vec<String>>()
        .join(" ")
}

pub(crate) fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }

    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.' | ':'))
    {
        return value.to_string();
    }

    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

pub(crate) fn resolve_terminal_launch(
    launch_type: &TerminalType,
) -> Result<TerminalLaunchSpec, LifecycleError> {
    match launch_type {
        TerminalType::Shell => Ok(TerminalLaunchSpec {
            program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        }),
        other => Err(LifecycleError::AttachFailed(format!(
            "unsupported terminal type: {}",
            other.as_str()
        ))),
    }
}

#[cfg(test)]
mod tests {
    use crate::shared::errors::{LifecycleError, TerminalType};

    use super::{
        docker_terminal_command, native_terminal_command, resolve_terminal_launch,
        DockerExecLaunchSpec, TerminalLaunchSpec,
    };

    #[test]
    fn resolve_terminal_launch_supports_shell_tabs() {
        let shell = resolve_terminal_launch(&TerminalType::Shell).expect("shell launch");

        assert!(shell.args.is_empty());
        assert!(!shell.program.is_empty());
        assert!(!shell.treat_nonzero_as_failure);
    }

    #[test]
    fn resolve_terminal_launch_rejects_non_shell_terminals() {
        let error = resolve_terminal_launch(&TerminalType::Preset).expect_err("preset must fail");
        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("unsupported terminal type"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn native_terminal_command_uses_default_shell_startup_for_shell_tabs() {
        let launch = TerminalLaunchSpec {
            program: "/bin/zsh".to_string(),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        };

        assert_eq!(
            native_terminal_command(&TerminalType::Shell, &launch, &[]),
            ""
        );
    }

    #[test]
    fn native_terminal_command_quotes_non_shell_commands() {
        let launch = TerminalLaunchSpec {
            program: "lifecycle".to_string(),
            args: vec!["agent".to_string(), "worker".to_string(), "codex worker".to_string()],
            treat_nonzero_as_failure: false,
        };

        assert_eq!(
            native_terminal_command(
                &TerminalType::Command,
                &launch,
                &[("LIFECYCLE_WORKSPACE_ID".to_string(), "ws_1".to_string())],
            ),
            "/bin/zsh -l -c 'export LIFECYCLE_WORKSPACE_ID=ws_1; exec lifecycle agent worker '\"'\"'codex worker'\"'\"''"
        );
    }

    #[test]
    fn docker_terminal_command_wraps_exec_with_container_context() {
        let launch = TerminalLaunchSpec {
            program: "lifecycle".to_string(),
            args: vec!["agent".to_string(), "worker".to_string()],
            treat_nonzero_as_failure: false,
        };

        assert_eq!(
            docker_terminal_command(&DockerExecLaunchSpec {
                container_name: "lifecycle-workspace-demo-sandbox",
                launch: &launch,
                container_working_directory: "/workspace/project",
                environment: &[("LIFECYCLE_WORKSPACE_ID".to_string(), "ws_1".to_string())],
                home_directory: Some("/root".to_string()),
                user: Some((501, 20)),
            }),
            "docker exec -it --user 501:20 --env 'HOME=/root' --env 'LIFECYCLE_WORKSPACE_ID=ws_1' --workdir /workspace/project lifecycle-workspace-demo-sandbox lifecycle agent worker"
        );
    }
}
