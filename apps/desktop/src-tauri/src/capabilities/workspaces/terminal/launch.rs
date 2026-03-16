use crate::shared::errors::{LifecycleError, TerminalType};
use std::path::Path;

use super::super::harness;
use super::persistence::WorkspaceRuntime;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum HarnessLaunchMode {
    New,
    Resume,
}

impl HarnessLaunchMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::New => "new",
            Self::Resume => "resume",
        }
    }

    pub(crate) fn from_str(value: &str) -> Result<Self, LifecycleError> {
        match value {
            "new" => Ok(Self::New),
            "resume" => Ok(Self::Resume),
            other => Err(LifecycleError::AttachFailed(format!(
                "unsupported harness launch mode: {other}"
            ))),
        }
    }
}

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

pub(crate) fn resolved_login_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

pub(crate) fn login_shell_command(command: &str) -> String {
    let shell = resolved_login_shell();
    format!("{} -l -c {}", shell_quote(&shell), shell_quote(command))
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
    environment: &[(String, String)],
) -> String {
    match launch_type {
        // Embedded Ghostty treats `command` as a shell-expanded string and
        // force-enables wait-after-command. Plain terminal tabs should use the
        // runtime's default-shell startup path instead of that command mode.
        TerminalType::Shell => String::new(),
        TerminalType::Harness => {
            let mut command_parts = environment
                .iter()
                .map(|(key, value)| format!("export {key}={}", shell_quote(value)))
                .collect::<Vec<String>>();
            command_parts.push(format!("exec {}", shell_command_line(launch)));
            let command = command_parts.join("; ");
            login_shell_command(&command)
        }
        _ => shell_command_line(launch),
    }
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
    harness_provider: Option<&str>,
    harness_session_id: Option<&str>,
    harness_launch_mode: HarnessLaunchMode,
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
                args: match harness_launch_mode {
                    HarnessLaunchMode::New => (provider.new_session_args)(harness_session_id),
                    HarnessLaunchMode::Resume => {
                        let session_id = harness_session_id.ok_or_else(|| {
                            LifecycleError::AttachFailed(
                                "harness resume requires a harness session id".to_string(),
                            )
                        })?;
                        (provider.resume_args)(session_id)
                    }
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

    use super::{
        native_terminal_command, resolve_terminal_launch, HarnessLaunchMode, TerminalLaunchSpec,
    };

    #[test]
    fn resolve_terminal_launch_rejects_unsupported_harness() {
        let error = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("unsupported"),
            None,
            HarnessLaunchMode::New,
        )
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
        let claude = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("claude"),
            Some("session-123"),
            HarnessLaunchMode::Resume,
        )
        .expect("claude resume launch");
        assert_eq!(claude.program, "claude");
        assert_eq!(claude.args, vec!["--resume", "session-123"]);

        let codex = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("codex"),
            Some("session-456"),
            HarnessLaunchMode::Resume,
        )
        .expect("codex resume");
        assert_eq!(codex.program, "codex");
        assert_eq!(codex.args, vec!["resume", "session-456"]);
    }

    #[test]
    fn resolve_terminal_launch_supports_provider_specific_new_session_flags() {
        let claude = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("claude"),
            Some("session-123"),
            HarnessLaunchMode::New,
        )
        .expect("claude new launch");
        assert_eq!(claude.program, "claude");
        assert_eq!(claude.args, vec!["--session-id", "session-123"]);

        let codex = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("codex"),
            None,
            HarnessLaunchMode::New,
        )
        .expect("codex new launch");
        assert_eq!(codex.program, "codex");
        assert!(codex.args.is_empty());
    }

    #[test]
    fn resolve_terminal_launch_rejects_resume_without_session_id() {
        let error = resolve_terminal_launch(
            &TerminalType::Harness,
            Some("claude"),
            None,
            HarnessLaunchMode::Resume,
        )
        .expect_err("resume requires session id");
        match error {
            LifecycleError::AttachFailed(message) => {
                assert!(message.contains("requires a harness session id"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn resolve_terminal_launch_rejects_resume_for_plain_shell() {
        let error = resolve_terminal_launch(
            &TerminalType::Shell,
            None,
            Some("session-123"),
            HarnessLaunchMode::Resume,
        )
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

        assert_eq!(native_terminal_command(&TerminalType::Shell, &launch, &[]), "");
    }

    #[test]
    fn native_terminal_command_keeps_harness_commands_quoted() {
        let launch = TerminalLaunchSpec {
            program: "claude".to_string(),
            args: vec!["--resume".to_string(), "session value".to_string()],
            treat_nonzero_as_failure: true,
        };

        assert_eq!(
            native_terminal_command(&TerminalType::Harness, &launch, &[]),
            "/bin/zsh -l -c 'exec claude --resume '\"'\"'session value'\"'\"''"
        );
    }

    #[test]
    fn native_terminal_command_exports_harness_environment() {
        let launch = TerminalLaunchSpec {
            program: "codex".to_string(),
            args: Vec::new(),
            treat_nonzero_as_failure: true,
        };

        assert_eq!(
            native_terminal_command(
                &TerminalType::Harness,
                &launch,
                &[("CODEX_HOME".to_string(), "/tmp/codex-home".to_string())]
            ),
            "/bin/zsh -l -c 'export CODEX_HOME=/tmp/codex-home; exec codex'"
        );
    }
}
