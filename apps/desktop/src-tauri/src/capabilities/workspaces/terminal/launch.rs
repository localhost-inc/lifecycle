use crate::shared::errors::{LifecycleError, TerminalType};
use std::path::Path;

use super::super::harness;
use super::persistence::WorkspaceRuntime;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct TerminalLaunchSpec {
    pub(crate) program: String,
    pub(crate) args: Vec<String>,
    pub(crate) treat_nonzero_as_failure: bool,
}

fn shell_command_line(launch: &TerminalLaunchSpec) -> String {
    let mut parts = Vec::with_capacity(1 + launch.args.len());
    parts.push(shell_quote(&launch.program));
    parts.extend(launch.args.iter().map(|arg| shell_quote(arg)));
    parts.join(" ")
}

fn resolved_login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

pub(crate) fn resolve_terminal_working_directory(
    workspace: &WorkspaceRuntime,
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
) -> String {
    match launch_type {
        // Embedded Ghostty treats `command` as a shell-expanded string and
        // force-enables wait-after-command. Plain terminal tabs should use the
        // runtime's default-shell startup path instead of that command mode.
        TerminalType::Shell => String::new(),
        TerminalType::Harness => {
            let shell = resolved_login_shell();
            let command = format!("exec {}", shell_command_line(launch));
            format!("{} -l -c {}", shell_quote(&shell), shell_quote(&command))
        }
        _ => shell_command_line(launch),
    }
}

fn shell_quote(value: &str) -> String {
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
    harness_provider: Option<&str>,
    harness_session_id: Option<&str>,
) -> Result<TerminalLaunchSpec, LifecycleError> {
    match (launch_type, harness_provider, harness_session_id) {
        (TerminalType::Shell, Some(_), _) => Err(LifecycleError::AttachFailed(
            "shell terminals do not accept harness providers".to_string(),
        )),
        (TerminalType::Shell, None, Some(_)) => Err(LifecycleError::AttachFailed(
            "shell terminals do not support harness session ids".to_string(),
        )),
        (TerminalType::Shell, None, None) => Ok(TerminalLaunchSpec {
            program: std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string()),
            args: Vec::new(),
            treat_nonzero_as_failure: false,
        }),
        (TerminalType::Harness, None, _) => Err(LifecycleError::AttachFailed(
            "harness terminals require a harness provider".to_string(),
        )),
        (TerminalType::Harness, Some(provider), harness_session_id) => {
            let provider = harness::resolve_harness_adapter(Some(provider)).ok_or_else(|| {
                LifecycleError::AttachFailed(format!("unsupported harness provider: {provider}"))
            })?;
            Ok(TerminalLaunchSpec {
                program: provider.program.to_string(),
                args: match harness_session_id {
                    Some(session_id) => (provider.resume_args)(session_id),
                    None => provider
                        .new_session_args
                        .iter()
                        .map(|value| (*value).to_string())
                        .collect(),
                },
                treat_nonzero_as_failure: true,
            })
        }
        (other, _, _) => Err(LifecycleError::AttachFailed(format!(
            "unsupported terminal type: {}",
            other.as_str()
        ))),
    }
}

#[cfg(test)]
mod tests {
    use crate::shared::errors::{LifecycleError, TerminalType};

    use super::{native_terminal_command, resolve_terminal_launch, TerminalLaunchSpec};

    #[test]
    fn resolve_terminal_launch_rejects_unsupported_harness() {
        let error = resolve_terminal_launch(&TerminalType::Harness, Some("unsupported"), None)
            .expect_err("must fail");
        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("unsupported harness"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn resolve_terminal_launch_supports_documented_resume_flags() {
        let claude =
            resolve_terminal_launch(&TerminalType::Harness, Some("claude"), Some("session-123"))
                .expect("claude resume launch");
        assert_eq!(claude.program, "claude");
        assert_eq!(claude.args, vec!["--resume", "session-123"]);

        let codex =
            resolve_terminal_launch(&TerminalType::Harness, Some("codex"), Some("session-456"))
                .expect("codex resume");
        assert_eq!(codex.program, "codex");
        assert_eq!(codex.args, vec!["resume", "session-456"]);
    }

    #[test]
    fn resolve_terminal_launch_rejects_resume_for_plain_shell() {
        let error = resolve_terminal_launch(&TerminalType::Shell, None, Some("session-123"))
            .expect_err("shell resume fails");
        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("do not support harness session ids"));
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

        assert_eq!(native_terminal_command(&TerminalType::Shell, &launch), "");
    }

    #[test]
    fn native_terminal_command_keeps_harness_commands_quoted() {
        let launch = TerminalLaunchSpec {
            program: "claude".to_string(),
            args: vec!["--resume".to_string(), "session value".to_string()],
            treat_nonzero_as_failure: true,
        };

        assert_eq!(
            native_terminal_command(&TerminalType::Harness, &launch),
            "/bin/zsh -l -c 'exec claude --resume '\"'\"'session value'\"'\"''"
        );
    }
}
