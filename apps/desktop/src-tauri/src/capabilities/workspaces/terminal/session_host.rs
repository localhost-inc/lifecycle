use crate::shared::errors::{LifecycleError, TerminalType};
use std::process::{Command, Output};

use super::launch::{
    login_shell_command, native_terminal_command, shell_quote, TerminalLaunchSpec,
};

const TMUX_EXECUTABLE: &str = "tmux";
const TMUX_SESSION_PREFIX: &str = "lifecycle-";

pub(crate) fn ensure_terminal_session_host_available() -> Result<(), LifecycleError> {
    let args = vec!["-V".to_string()];
    let output = tmux_command(&args)?;
    if output.status.success() {
        return Ok(());
    }

    Err(tmux_command_error(&args, &output))
}

pub(crate) fn provision_terminal_session(
    terminal_id: &str,
    working_directory: &str,
    launch_type: &TerminalType,
    launch: &TerminalLaunchSpec,
) -> Result<(), LifecycleError> {
    ensure_terminal_session_host_available()?;

    let command = native_terminal_command(launch_type, launch);
    let args = build_tmux_new_session_args(
        terminal_id,
        working_directory,
        (!command.is_empty()).then_some(command.as_str()),
    );
    let output = tmux_command(&args)?;
    if output.status.success() {
        return Ok(());
    }

    Err(tmux_command_error(&args, &output))
}

pub(crate) fn destroy_terminal_session(terminal_id: &str) -> Result<(), LifecycleError> {
    if !terminal_session_exists(terminal_id)? {
        return Ok(());
    }

    let args = build_tmux_kill_session_args(terminal_id);
    let output = tmux_command(&args)?;
    if output.status.success() {
        return Ok(());
    }

    Err(tmux_command_error(&args, &output))
}

pub(crate) fn terminal_session_exists(terminal_id: &str) -> Result<bool, LifecycleError> {
    let args = build_tmux_has_session_args(terminal_id);
    let output = tmux_command(&args)?;
    if output.status.success() {
        return Ok(true);
    }

    match output.status.code() {
        Some(1) => Ok(false),
        _ => Err(tmux_command_error(&args, &output)),
    }
}

pub(crate) fn terminal_attach_command(terminal_id: &str) -> String {
    let command = format!(
        "exec tmux attach-session -t {}",
        shell_quote(&terminal_session_name(terminal_id))
    );
    login_shell_command(&command)
}

fn tmux_command(args: &[String]) -> Result<Output, LifecycleError> {
    Command::new(TMUX_EXECUTABLE)
        .args(args)
        .output()
        .map_err(|error| {
            LifecycleError::AttachFailed(format!("failed to execute {TMUX_EXECUTABLE}: {error}"))
        })
}

fn tmux_command_error(args: &[String], output: &Output) -> LifecycleError {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let message = if stderr.is_empty() {
        format!(
            "{TMUX_EXECUTABLE} {} exited with status {}",
            format_tmux_args(args),
            output
                .status
                .code()
                .map_or_else(|| "unknown".to_string(), |code| code.to_string())
        )
    } else {
        stderr
    };

    LifecycleError::AttachFailed(format!(
        "{TMUX_EXECUTABLE} {} failed: {message}",
        format_tmux_args(args)
    ))
}

fn format_tmux_args(args: &[String]) -> String {
    args.iter()
        .map(|arg| shell_quote(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_tmux_has_session_args(terminal_id: &str) -> Vec<String> {
    vec![
        "has-session".to_string(),
        "-t".to_string(),
        terminal_session_name(terminal_id),
    ]
}

fn build_tmux_kill_session_args(terminal_id: &str) -> Vec<String> {
    vec![
        "kill-session".to_string(),
        "-t".to_string(),
        terminal_session_name(terminal_id),
    ]
}

fn build_tmux_new_session_args(
    terminal_id: &str,
    working_directory: &str,
    command: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "new-session".to_string(),
        "-d".to_string(),
        "-s".to_string(),
        terminal_session_name(terminal_id),
        "-c".to_string(),
        working_directory.to_string(),
    ];
    if let Some(command) = command {
        args.push(command.to_string());
    }
    args
}

fn terminal_session_name(terminal_id: &str) -> String {
    format!("{TMUX_SESSION_PREFIX}{terminal_id}")
}

#[cfg(test)]
mod tests {
    use crate::shared::errors::TerminalType;

    use super::{build_tmux_new_session_args, terminal_attach_command};
    use crate::capabilities::workspaces::terminal::launch::TerminalLaunchSpec;

    #[test]
    fn build_tmux_new_session_args_uses_terminal_identity_and_working_directory() {
        let args = build_tmux_new_session_args("terminal-123", "/tmp/worktree", Some("echo ready"));

        assert_eq!(
            args,
            vec![
                "new-session",
                "-d",
                "-s",
                "lifecycle-terminal-123",
                "-c",
                "/tmp/worktree",
                "echo ready",
            ]
        );
    }

    #[test]
    fn terminal_attach_command_targets_tmux_session_identity() {
        let command = terminal_attach_command("terminal-123");

        assert!(command.contains("tmux attach-session -t lifecycle-terminal-123"));
        assert!(command.contains(" -l -c "));
    }

    #[test]
    fn harness_tmux_command_uses_login_shell_wrapped_launch() {
        let launch = TerminalLaunchSpec {
            program: "claude".to_string(),
            args: vec!["--resume".to_string(), "session-123".to_string()],
            treat_nonzero_as_failure: true,
        };

        let command = crate::capabilities::workspaces::terminal::launch::native_terminal_command(
            &TerminalType::Harness,
            &launch,
        );
        let args = build_tmux_new_session_args("terminal-123", "/tmp/worktree", Some(&command));

        assert_eq!(args[0], "new-session");
        assert!(args[6].contains("claude --resume session-123"));
    }
}
