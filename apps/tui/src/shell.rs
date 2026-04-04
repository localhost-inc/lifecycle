use serde::de::{self, Deserializer};
use serde::Deserialize;
use std::path::Path;

pub const INITIAL_WORKSPACE_ID_ENV: &str = "LIFECYCLE_INITIAL_WORKSPACE_ID";

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
pub struct ShellPlan {
    pub backend_label: String,
    pub launch_error: Option<String>,
    pub persistent: bool,
    pub session_name: Option<String>,
    pub prepare: Option<ShellLaunchSpec>,
    pub spec: Option<ShellLaunchSpec>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceShell {
    pub workspace: WorkspaceScope,
    pub shell: ShellPlan,
}

pub fn build_workspace_shell(scope: WorkspaceScope, tmux_available: bool) -> WorkspaceShell {
    let shell = build_shell_runtime(&scope, tmux_available);
    WorkspaceShell { workspace: scope, shell }
}

fn build_shell_runtime(scope: &WorkspaceScope, tmux_available: bool) -> ShellPlan {
    if let Some(error) = &scope.resolution_error {
        return ShellPlan {
            backend_label: "unavailable".to_string(),
            launch_error: Some(error.clone()),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        };
    }

    let cwd = scope.cwd.clone().or_else(|| scope.worktree_path.clone());
    let session_name = build_tmux_session_name(scope);

    match scope.host {
        WorkspaceHost::Local => build_local_runtime(scope, tmux_available, cwd, session_name),
        WorkspaceHost::Cloud => build_cloud_plan(scope, session_name),
        WorkspaceHost::Docker => ShellPlan {
            backend_label: "docker shell".to_string(),
            launch_error: Some(
                "Docker workspace shells are not wired into an authoritative TUI attach path yet."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        },
        WorkspaceHost::Remote => ShellPlan {
            backend_label: "remote shell".to_string(),
            launch_error: Some(
                "Remote workspace shells are reserved in the contract but not implemented in the TUI yet."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        },
        WorkspaceHost::Unknown => ShellPlan {
            backend_label: "unknown shell".to_string(),
            launch_error: Some(format!(
                "Lifecycle could not resolve a supported shell launch path for this workspace host."
            )),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        },
    }
}

fn build_local_runtime(
    scope: &WorkspaceScope,
    tmux_available: bool,
    cwd: Option<String>,
    session_name: String,
) -> ShellPlan {
    if !tmux_available {
        return ShellPlan {
            backend_label: "local tmux".to_string(),
            launch_error: Some(
                "tmux is required for the Lifecycle TUI local shell. Install tmux or launch from an environment where tmux is available."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        };
    }

    let Some(cwd) = cwd else {
        return ShellPlan {
            backend_label: "local tmux".to_string(),
            launch_error: Some(
                "Lifecycle could not resolve a local working directory for this TUI session."
                    .to_string(),
            ),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        };
    };

    // Use tmux's native create-or-attach flow directly rather than shelling out
    // through `sh -c`. This avoids quoting bugs for workspace paths and removes
    // the race between has-session/new-session/attach-session.
    let mut args = vec![
        "new-session".to_string(),
        "-A".to_string(),
        "-s".to_string(),
        session_name.clone(),
        "-c".to_string(),
        cwd.clone(),
    ];
    if scope.binding == WorkspaceBinding::AdHoc {
        args.push("-n".to_string());
        args.push("shell".to_string());
    }
    args.push(";".to_string());
    args.push("set-option".to_string());
    args.push("-t".to_string());
    args.push(session_name.clone());
    args.push("window-size".to_string());
    args.push("latest".to_string());

    ShellPlan {
        backend_label: "local tmux".to_string(),
        launch_error: None,
        persistent: true,
        session_name: Some(session_name),
        prepare: None,
        spec: Some(ShellLaunchSpec {
            program: "tmux".to_string(),
            args,
            cwd: Some(cwd),
            env: vec![("TERM".to_string(), "xterm-256color".to_string())],
        }),
    }
}

fn build_cloud_plan(scope: &WorkspaceScope, session_name: String) -> ShellPlan {
    let Some(workspace_id) = scope.workspace_id.as_ref() else {
        return ShellPlan {
            backend_label: "cloud tmux".to_string(),
            launch_error: Some("Cloud TUI sessions require a bound workspace id.".to_string()),
            persistent: false,
            session_name: None,
            prepare: None,
            spec: None,
        };
    };

    ShellPlan {
        backend_label: "cloud tmux".to_string(),
        launch_error: None,
        persistent: true,
        session_name: Some(session_name.clone()),
        prepare: None,
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
        let plan = build_shell_runtime(&scope(WorkspaceHost::Local), true);
        assert_eq!(plan.backend_label, "local tmux");
        assert!(plan.persistent);
        let spec = plan.spec.expect("expected local launch spec");
        assert_eq!(spec.program, "tmux");
        assert_eq!(spec.args[0], "new-session");
        assert!(spec.args.iter().any(|arg| arg == "-A"));
        assert!(spec.args.iter().any(|arg| arg == "-s"));
        assert!(spec.args.iter().any(|arg| arg == "-c"));
        assert!(spec.args.windows(4).any(|window| {
            window[0] == ";" && window[1] == "set-option" && window[2] == "-t" && window[3] == "my-app-feature-branch"
        }));
        assert!(spec.args.windows(2).any(|window| window == ["window-size", "latest"]));
    }

    #[test]
    fn local_runtime_preserves_literal_cwd_in_tmux_args() {
        let mut scoped = scope(WorkspaceHost::Local);
        scoped.cwd = Some("/tmp/it's-real".to_string());
        scoped.worktree_path = scoped.cwd.clone();

        let plan = build_shell_runtime(&scoped, true);
        let spec = plan.spec.expect("expected local launch spec");
        assert_eq!(spec.program, "tmux");
        assert!(spec.args.windows(2).any(|window| window == ["-c", "/tmp/it's-real"]));
    }

    #[test]
    fn cloud_runtime_wraps_workspace_shell_command() {
        let plan = build_shell_runtime(&scope(WorkspaceHost::Cloud), true);
        let spec = plan.spec.expect("expected cloud launch spec");
        assert_eq!(spec.program, "lifecycle");
        assert_eq!(spec.args[0], "workspace");
        assert_eq!(spec.args[1], "shell");
        assert_eq!(spec.args[2], "workspace_123");
        assert!(spec.args.iter().any(|arg| arg == "--tmux-session"));
    }

    #[test]
    fn docker_runtime_fails_fast() {
        let plan = build_shell_runtime(&scope(WorkspaceHost::Docker), true);
        assert!(plan.spec.is_none());
        assert!(plan
            .launch_error
            .as_deref()
            .unwrap_or_default()
            .contains("Docker workspace shells"));
    }

    #[test]
    fn workspace_shell_wraps_scope_and_plan() {
        let workspace = scope(WorkspaceHost::Local);
        let shell = build_workspace_shell(workspace.clone(), true);
        assert_eq!(shell.workspace.workspace_id, workspace.workspace_id);
        assert_eq!(shell.workspace.workspace_name, workspace.workspace_name);
        assert_eq!(shell.shell.backend_label, "local tmux");
        assert!(shell.shell.spec.is_some());
    }
}
