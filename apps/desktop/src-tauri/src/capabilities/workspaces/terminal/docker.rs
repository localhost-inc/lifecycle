use std::collections::HashSet;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::capabilities::workspaces::controller::ManagedWorkspaceController;
use crate::platform::runtime::supervisor::RuntimeBindMount;
use crate::shared::errors::LifecycleError;

use super::launch::{docker_terminal_command, DockerExecLaunchSpec, TerminalLaunchSpec};
use super::persistence::{TerminalWorkspaceContext, DOCKER_SANDBOX_WORKTREE_PATH};

const CONTAINER_BRIDGE_PATH: &str = "/tmp/lifecycle-bridge.sock";
const CONTAINER_CLAUDE_HOME: &str = "/root/.claude";
const CONTAINER_CODEX_HOME: &str = "/sandbox/codex-home";
const CONTAINER_HOME: &str = "/root";
const CONTAINER_LIFECYCLE_CLI_PATH: &str = "/usr/local/bin/lifecycle";
const CODEX_HOME_ENV: &str = "CODEX_HOME";
const LIFECYCLE_BRIDGE_ENV: &str = "LIFECYCLE_BRIDGE";
const LIFECYCLE_CLI_PATH_ENV: &str = "LIFECYCLE_CLI_PATH";
const PATH_ENV: &str = "PATH";

pub(crate) async fn resolve_docker_terminal_command(
    app: &AppHandle,
    controller: &ManagedWorkspaceController,
    workspace_id: &str,
    workspace: &TerminalWorkspaceContext,
    launch: &TerminalLaunchSpec,
    environment: &[(String, String)],
    working_directory: &str,
) -> Result<String, LifecycleError> {
    let (binds, container_environment) =
        resolve_docker_terminal_runtime_inputs(workspace, environment, working_directory)?;
    let supervisor = controller.supervisor();
    let sandbox_container_name = supervisor
        .lock()
        .await
        .ensure_sandbox_container(app, workspace_id, &binds)
        .await?;

    Ok(docker_terminal_command(&DockerExecLaunchSpec {
        container_name: &sandbox_container_name,
        launch,
        container_working_directory: DOCKER_SANDBOX_WORKTREE_PATH,
        environment: &container_environment,
        home_directory: Some(CONTAINER_HOME.to_string()),
        user: current_user_spec(),
    }))
}

fn resolve_docker_terminal_runtime_inputs(
    _workspace: &TerminalWorkspaceContext,
    environment: &[(String, String)],
    working_directory: &str,
) -> Result<(Vec<RuntimeBindMount>, Vec<(String, String)>), LifecycleError> {
    let mut binds = Vec::new();
    let mut container_environment = Vec::new();
    let mut mounted_targets = HashSet::new();

    push_mount_if_exists(
        &mut binds,
        &mut mounted_targets,
        Path::new(working_directory),
        Path::new(DOCKER_SANDBOX_WORKTREE_PATH),
        false,
    )?;

    if let Some(cli_binary) = environment
        .iter()
        .find(|(key, _)| key == LIFECYCLE_CLI_PATH_ENV)
        .map(|(_, value)| PathBuf::from(value))
    {
        push_mount_if_exists(
            &mut binds,
            &mut mounted_targets,
            &cli_binary,
            Path::new(CONTAINER_LIFECYCLE_CLI_PATH),
            true,
        )?;
        container_environment.push((
            LIFECYCLE_CLI_PATH_ENV.to_string(),
            CONTAINER_LIFECYCLE_CLI_PATH.to_string(),
        ));
    }

    if let Some(bridge_socket) = environment
        .iter()
        .find(|(key, _)| key == LIFECYCLE_BRIDGE_ENV)
        .map(|(_, value)| PathBuf::from(value))
    {
        push_mount_if_exists(
            &mut binds,
            &mut mounted_targets,
            &bridge_socket,
            Path::new(CONTAINER_BRIDGE_PATH),
            false,
        )?;
        container_environment.push((
            LIFECYCLE_BRIDGE_ENV.to_string(),
            CONTAINER_BRIDGE_PATH.to_string(),
        ));
    }

    if let Some(codex_home) = environment
        .iter()
        .find(|(key, _)| key == CODEX_HOME_ENV)
        .map(|(_, value)| PathBuf::from(value))
    {
        push_mount_if_exists(
            &mut binds,
            &mut mounted_targets,
            &codex_home,
            Path::new(CONTAINER_CODEX_HOME),
            false,
        )?;
        container_environment.push((CODEX_HOME_ENV.to_string(), CONTAINER_CODEX_HOME.to_string()));
    }

    if let Some(home_dir) = std::env::var_os("HOME").map(PathBuf::from) {
        push_mount_if_exists(
            &mut binds,
            &mut mounted_targets,
            &home_dir.join(".claude"),
            Path::new(CONTAINER_CLAUDE_HOME),
            false,
        )?;
    }

    for (key, value) in environment {
        if matches!(
            key.as_str(),
            CODEX_HOME_ENV | LIFECYCLE_BRIDGE_ENV | LIFECYCLE_CLI_PATH_ENV | PATH_ENV
        ) {
            continue;
        }
        container_environment.push((key.clone(), value.clone()));
    }

    Ok((binds, container_environment))
}

fn push_mount_if_exists(
    binds: &mut Vec<RuntimeBindMount>,
    mounted_targets: &mut HashSet<PathBuf>,
    source: &Path,
    target: &Path,
    read_only: bool,
) -> Result<(), LifecycleError> {
    if !source.exists() {
        return Ok(());
    }

    let source = source.canonicalize().map_err(|error| {
        LifecycleError::AttachFailed(format!(
            "failed to resolve docker terminal mount {}: {error}",
            source.display()
        ))
    })?;
    let target = target.to_path_buf();
    if !mounted_targets.insert(target.clone()) {
        return Ok(());
    }

    binds.push(if read_only {
        RuntimeBindMount::read_only(source, target)
    } else {
        RuntimeBindMount::new(source, target)
    });

    Ok(())
}

fn current_user_spec() -> Option<(u32, u32)> {
    #[cfg(unix)]
    {
        return Some((unsafe { libc::geteuid() }, unsafe { libc::getegid() }));
    }

    #[allow(unreachable_code)]
    None
}

#[cfg(test)]
mod tests {
    use super::resolve_docker_terminal_runtime_inputs;
    use crate::capabilities::workspaces::terminal::persistence::TerminalWorkspaceContext;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn docker_terminal_runtime_inputs_translate_host_specific_paths() {
        let root =
            std::env::temp_dir().join(format!("lifecycle-docker-runtime-{}", uuid::Uuid::new_v4()));
        let worktree_path = root.join("project");
        let cli_path = root.join("bin/lifecycle");
        let bridge_path = root.join("bridge.sock");
        let codex_home = root.join("codex-home");
        fs::create_dir_all(&worktree_path).expect("create worktree");
        fs::create_dir_all(cli_path.parent().expect("cli parent")).expect("create cli dir");
        fs::create_dir_all(&codex_home).expect("create codex home");
        fs::write(&cli_path, "#!/bin/sh\n").expect("write cli");
        fs::write(&bridge_path, "").expect("write bridge placeholder");

        let (binds, environment) = resolve_docker_terminal_runtime_inputs(
            &TerminalWorkspaceContext {
                project_path: worktree_path.to_string_lossy().to_string(),
                target: "docker".to_string(),
                worktree_path: worktree_path.to_string_lossy().to_string(),
            },
            &[
                (
                    "PATH".to_string(),
                    "/Users/example/bin:/usr/bin".to_string(),
                ),
                (
                    "LIFECYCLE_CLI_PATH".to_string(),
                    cli_path.to_string_lossy().to_string(),
                ),
                (
                    "LIFECYCLE_BRIDGE".to_string(),
                    bridge_path.to_string_lossy().to_string(),
                ),
                (
                    "CODEX_HOME".to_string(),
                    codex_home.to_string_lossy().to_string(),
                ),
                ("LIFECYCLE_WORKSPACE_ID".to_string(), "ws_1".to_string()),
            ],
            &worktree_path.to_string_lossy(),
        )
        .expect("docker inputs resolve");

        assert!(binds
            .iter()
            .any(|bind| bind.target == PathBuf::from("/workspace")));
        assert!(binds
            .iter()
            .any(|bind| bind.target == PathBuf::from("/usr/local/bin/lifecycle")));
        assert!(binds
            .iter()
            .any(|bind| bind.target == PathBuf::from("/tmp/lifecycle-bridge.sock")));
        assert!(binds
            .iter()
            .any(|bind| bind.target == PathBuf::from("/sandbox/codex-home")));
        assert!(!environment.iter().any(|(key, _)| key == "PATH"));
        assert!(environment.iter().any(|(key, value)| {
            key == "LIFECYCLE_CLI_PATH" && value == "/usr/local/bin/lifecycle"
        }));
        assert!(environment.iter().any(|(key, value)| {
            key == "LIFECYCLE_BRIDGE" && value == "/tmp/lifecycle-bridge.sock"
        }));
        assert!(environment
            .iter()
            .any(|(key, value)| { key == "CODEX_HOME" && value == "/sandbox/codex-home" }));

        let _ = fs::remove_dir_all(root);
    }
}
