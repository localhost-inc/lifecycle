use serde::de::{self, Deserializer};
use serde::Deserialize;
use std::path::Path;
use std::process::Command;

pub const TUI_SESSION_ENV: &str = "LIFECYCLE_TUI_SESSION";
pub const TUI_WORKSPACE_CWD_ENV: &str = "LIFECYCLE_TUI_WORKSPACE_CWD";
pub const TUI_WORKSPACE_ID_ENV: &str = "LIFECYCLE_TUI_WORKSPACE_ID";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceBinding {
    Bound,
    AdHoc,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceHost {
    Local,
    Docker,
    Cloud,
    Remote,
    Unknown,
}

impl<'de> Deserialize<'de> for WorkspaceHost {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(match value.trim().to_ascii_lowercase().as_str() {
            "local" => Self::Local,
            "docker" => Self::Docker,
            "cloud" => Self::Cloud,
            "remote" => Self::Remote,
            other if other.is_empty() => {
                return Err(de::Error::custom("workspace host must not be empty"))
            }
            _ => Self::Unknown,
        })
    }
}

impl WorkspaceHost {
    pub fn from_str(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "local" => Self::Local,
            "docker" => Self::Docker,
            "cloud" => Self::Cloud,
            "remote" => Self::Remote,
            _ => Self::Unknown,
        }
    }

    pub fn label(&self) -> &str {
        match self {
            Self::Local => "local",
            Self::Docker => "docker",
            Self::Cloud => "cloud",
            Self::Remote => "remote",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ServiceSummary {
    pub name: String,
    pub preview_url: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct WorkspaceScope {
    pub binding: WorkspaceBinding,
    pub workspace_id: Option<String>,
    pub workspace_name: String,
    pub repo_name: Option<String>,
    pub host: WorkspaceHost,
    pub status: Option<String>,
    pub source_ref: Option<String>,
    pub cwd: Option<String>,
    pub worktree_path: Option<String>,
    pub services: Vec<ServiceSummary>,
    pub resolution_note: Option<String>,
    pub resolution_error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ShellLaunchSpec {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    pub env: Vec<(String, String)>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub struct ShellRuntime {
    pub backend_label: String,
    pub launch_error: Option<String>,
    pub persistent: bool,
    pub session_name: Option<String>,
    pub spec: Option<ShellLaunchSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TuiSession {
    pub workspace: WorkspaceScope,
    pub shell: ShellRuntime,
}

pub fn resolve_shell_runtime(scope: &WorkspaceScope) -> ShellRuntime {
    build_shell_runtime(scope, command_available("tmux"))
}

fn build_shell_runtime(scope: &WorkspaceScope, tmux_available: bool) -> ShellRuntime {
    if let Some(error) = &scope.resolution_error {
        return ShellRuntime {
            backend_label: "unavailable".to_string(),
            launch_error: Some(error.clone()),
            persistent: false,
            session_name: None,
            spec: None,
        };
    }

    let cwd = scope.cwd.clone().or_else(|| scope.worktree_path.clone());
    let session_name = build_tmux_session_name(scope);

    match scope.host {
        WorkspaceHost::Local => build_local_runtime(scope, tmux_available, cwd, session_name),
        WorkspaceHost::Cloud => build_cloud_runtime(scope, session_name),
        WorkspaceHost::Docker => ShellRuntime {
            backend_label: "docker shell".to_string(),
            launch_error: Some(
                "Docker workspace shells are not wired into an authoritative TUI attach path yet."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            spec: None,
        },
        WorkspaceHost::Remote => ShellRuntime {
            backend_label: "remote shell".to_string(),
            launch_error: Some(
                "Remote workspace shells are reserved in the contract but not implemented in the TUI yet."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            spec: None,
        },
        WorkspaceHost::Unknown => ShellRuntime {
            backend_label: "unknown shell".to_string(),
            launch_error: Some(format!(
                "Lifecycle could not resolve a supported shell launch path for this workspace host."
            )),
            persistent: false,
            session_name: None,
            spec: None,
        },
    }
}

fn build_local_runtime(
    scope: &WorkspaceScope,
    tmux_available: bool,
    cwd: Option<String>,
    session_name: String,
) -> ShellRuntime {
    if !tmux_available {
        return ShellRuntime {
            backend_label: "local tmux".to_string(),
            launch_error: Some(
                "tmux is required for the Lifecycle TUI local shell. Install tmux or launch from an environment where tmux is available."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            spec: None,
        };
    }

    let Some(cwd) = cwd else {
        return ShellRuntime {
            backend_label: "local tmux".to_string(),
            launch_error: Some(
                "Lifecycle could not resolve a local working directory for this TUI session."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            spec: None,
        };
    };

    let window_name = if scope.binding == WorkspaceBinding::AdHoc {
        " -n shell"
    } else {
        ""
    };

    // Create-or-attach: tmux session uses the user's default shell.
    // Activity detection is handled by the tmux poller (not OSC 133),
    // so no shell integration injection is needed.
    let script = format!(
        concat!(
            "if ! tmux has-session -t '{session}' 2>/dev/null; then ",
            "  tmux new-session -d -s '{session}' -c '{cwd}'{window_name}; ",
            "fi; ",
            "exec tmux attach-session -t '{session}'",
        ),
        session = session_name,
        cwd = cwd,
        window_name = window_name,
    );

    ShellRuntime {
        backend_label: "local tmux".to_string(),
        launch_error: None,
        persistent: true,
        session_name: Some(session_name),
        spec: Some(ShellLaunchSpec {
            program: "sh".to_string(),
            args: vec!["-c".to_string(), script],
            cwd: Some(cwd),
            env: vec![
                ("TERM".to_string(), "xterm-256color".to_string()),
            ],
        }),
    }
}

fn build_cloud_runtime(scope: &WorkspaceScope, session_name: String) -> ShellRuntime {
    let Some(workspace_id) = scope.workspace_id.as_ref() else {
        return ShellRuntime {
            backend_label: "cloud tmux".to_string(),
            launch_error: Some("Cloud TUI sessions require a bound workspace id.".to_string()),
            persistent: false,
            session_name: None,
            spec: None,
        };
    };

    ShellRuntime {
        backend_label: "cloud tmux".to_string(),
        launch_error: None,
        persistent: true,
        session_name: Some(session_name.clone()),
        spec: Some(ShellLaunchSpec {
            program: "lifecycle".to_string(),
            args: vec![
                "workspace".to_string(),
                "shell".to_string(),
                workspace_id.clone(),
                "--tmux-session".to_string(),
                session_name,
            ],
            cwd: None,
            env: vec![],
        }),
    }
}

fn command_available(program: &str) -> bool {
    Command::new(program)
        .arg("-V")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn build_tmux_session_name(scope: &WorkspaceScope) -> String {
    let ws_slug = {
        let source = if scope.workspace_name.trim().is_empty() {
            scope
                .cwd
                .as_deref()
                .and_then(path_basename)
                .unwrap_or("workspace")
                .to_string()
        } else {
            scope.workspace_name.clone()
        };
        truncate_slug(&slugify(&source), 30)
    };

    let repo_slug = scope
        .repo_name
        .as_deref()
        .map(|name| truncate_slug(&slugify(name), 30));

    match repo_slug {
        Some(repo) => format!("{}-{}", repo, ws_slug),
        None => ws_slug,
    }
}

fn path_basename(path: &str) -> Option<&str> {
    Path::new(path).file_name().and_then(|value| value.to_str())
}

fn truncate_slug(value: &str, max_len: usize) -> String {
    value.chars().take(max_len).collect()
}

fn slugify(value: &str) -> String {
    let mut out = String::new();
    let mut previous_was_dash = false;

    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            previous_was_dash = false;
            Some(ch.to_ascii_lowercase())
        } else if previous_was_dash {
            None
        } else {
            previous_was_dash = true;
            Some('-')
        };

        if let Some(next) = normalized {
            out.push(next);
        }
    }

    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "workspace".to_string()
    } else {
        trimmed.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope(host: WorkspaceHost) -> WorkspaceScope {
        WorkspaceScope {
            binding: WorkspaceBinding::Bound,
            workspace_id: Some("workspace_123".to_string()),
            workspace_name: "Feature Branch".to_string(),
            repo_name: Some("my-app".to_string()),
            host,
            status: Some("active".to_string()),
            source_ref: Some("main".to_string()),
            cwd: Some("/tmp/project".to_string()),
            worktree_path: Some("/tmp/project".to_string()),
            services: vec![],
            resolution_note: None,
            resolution_error: None,
        }
    }

    #[test]
    fn session_name_uses_repo_workspace_format() {
        let name = build_tmux_session_name(&scope(WorkspaceHost::Local));
        assert_eq!(name, "my-app-feature-branch");
    }

    #[test]
    fn local_runtime_prefers_tmux() {
        let runtime = build_shell_runtime(&scope(WorkspaceHost::Local), true);
        assert_eq!(runtime.backend_label, "local tmux");
        assert!(runtime.persistent);
        let spec = runtime.spec.expect("expected local launch spec");
        // Local runtime uses sh -c to orchestrate tmux session setup + attach.
        assert_eq!(spec.program, "sh");
        let script = &spec.args[1];
        assert!(script.contains("tmux new-session"));
        assert!(script.contains("tmux attach-session"));
    }

    #[test]
    fn cloud_runtime_wraps_workspace_shell_command() {
        let runtime = build_shell_runtime(&scope(WorkspaceHost::Cloud), true);
        let spec = runtime.spec.expect("expected cloud launch spec");
        assert_eq!(spec.program, "lifecycle");
        assert_eq!(spec.args[0], "workspace");
        assert_eq!(spec.args[1], "shell");
        assert_eq!(spec.args[2], "workspace_123");
        assert!(spec.args.iter().any(|arg| arg == "--tmux-session"));
    }

    #[test]
    fn docker_runtime_fails_fast() {
        let runtime = build_shell_runtime(&scope(WorkspaceHost::Docker), true);
        assert!(runtime.spec.is_none());
        assert!(runtime
            .launch_error
            .as_deref()
            .unwrap_or_default()
            .contains("Docker workspace shells"));
    }
}
