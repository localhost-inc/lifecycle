use std::env;
use std::path::Path;
use std::process::Command;

use serde::de::DeserializeOwned;
use serde::Deserialize;

use crate::shell::{
    resolve_shell_runtime, ServiceSummary, TuiSession, WorkspaceBinding, WorkspaceHost,
    WorkspaceScope, TUI_SESSION_ENV, TUI_WORKSPACE_CWD_ENV, TUI_WORKSPACE_ID_ENV,
};

const WORKSPACE_ID_ENV: &str = "LIFECYCLE_WORKSPACE_ID";
const WORKSPACE_PATH_ENV: &str = "LIFECYCLE_WORKSPACE_PATH";
const REPO_NAME_ENV: &str = "LIFECYCLE_REPO_NAME";

#[derive(Debug, Deserialize)]
struct WorkspaceStatusPayload {
    services: Vec<ServicePayload>,
    workspace: WorkspacePayload,
}

#[derive(Debug, Deserialize)]
struct WorkspacePayload {
    host: String,
    id: String,
    name: String,
    source_ref: String,
    status: String,
    worktree_path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ServicePayload {
    name: String,
    preview_url: Option<String>,
    status: String,
}

#[derive(Debug, Deserialize)]
struct CloudShellPayload {
    cwd: Option<String>,
}

pub fn resolve_tui_session() -> TuiSession {
    if let Some(session) = env_string(TUI_SESSION_ENV)
        .and_then(|value| serde_json::from_str::<TuiSession>(&value).ok())
    {
        return session;
    }

    let workspace = resolve_workspace_scope();
    let shell = resolve_shell_runtime(&workspace);
    TuiSession { workspace, shell }
}

fn resolve_workspace_scope() -> WorkspaceScope {
    let workspace_id = env_string(TUI_WORKSPACE_ID_ENV).or_else(|| env_string(WORKSPACE_ID_ENV));
    let cwd_hint = env_string(TUI_WORKSPACE_CWD_ENV)
        .or_else(|| env_string(WORKSPACE_PATH_ENV))
        .or_else(|| {
            env::current_dir()
                .ok()
                .and_then(|path| path.to_str().map(ToOwned::to_owned))
        });

    match workspace_id {
        Some(workspace_id) => resolve_bound_workspace(workspace_id, cwd_hint),
        None => resolve_ad_hoc_workspace(cwd_hint),
    }
}

fn resolve_bound_workspace(workspace_id: String, cwd_hint: Option<String>) -> WorkspaceScope {
    if let Ok(cloud) =
        run_lifecycle_json::<CloudShellPayload>(&["workspace", "shell", &workspace_id])
    {
        let cwd = cloud.cwd.clone().or_else(|| cwd_hint.clone());
        return WorkspaceScope {
            binding: WorkspaceBinding::Bound,
            workspace_id: Some(workspace_id.clone()),
            workspace_name: workspace_id,
            repo_name: env_string(REPO_NAME_ENV),
            host: WorkspaceHost::Cloud,
            status: Some("active".to_string()),
            source_ref: None,
            cwd: cwd.clone(),
            worktree_path: cwd,
            services: vec![],
            resolution_note: Some(
                "Bound to the cloud workspace shell attach path for this workspace.".to_string(),
            ),
            resolution_error: None,
        };
    }

    if let Ok(status) = run_lifecycle_json::<WorkspaceStatusPayload>(&[
        "workspace",
        "status",
        "--workspace-id",
        &workspace_id,
    ]) {
        return WorkspaceScope {
            binding: WorkspaceBinding::Bound,
            workspace_id: Some(status.workspace.id),
            workspace_name: status.workspace.name,
            repo_name: env_string(REPO_NAME_ENV),
            host: WorkspaceHost::from_str(&status.workspace.host),
            status: Some(status.workspace.status),
            source_ref: Some(status.workspace.source_ref),
            cwd: status
                .workspace
                .worktree_path
                .clone()
                .or_else(|| cwd_hint.clone()),
            worktree_path: status.workspace.worktree_path,
            services: status
                .services
                .into_iter()
                .map(|service| ServiceSummary {
                    name: service.name,
                    preview_url: service.preview_url,
                    status: service.status,
                })
                .collect(),
            resolution_note: Some(
                "Bound to the current workspace scope resolved through Lifecycle.".to_string(),
            ),
            resolution_error: None,
        };
    }

    if let Some(cwd) = cwd_hint {
        return WorkspaceScope {
            binding: WorkspaceBinding::Bound,
            workspace_id: Some(workspace_id.clone()),
            workspace_name: workspace_id,
            repo_name: env_string(REPO_NAME_ENV),
            host: WorkspaceHost::Local,
            status: None,
            source_ref: None,
            cwd: Some(cwd.clone()),
            worktree_path: Some(cwd),
            services: vec![],
            resolution_note: Some(
                "Lifecycle could not read workspace metadata, so the TUI is using the bound workspace path from the environment."
                    .to_string(),
            ),
            resolution_error: None,
        };
    }

    WorkspaceScope {
        binding: WorkspaceBinding::Bound,
        workspace_id: Some(workspace_id.clone()),
        workspace_name: workspace_id.clone(),
        repo_name: env_string(REPO_NAME_ENV),
        host: WorkspaceHost::Unknown,
        status: None,
        source_ref: None,
        cwd: None,
        worktree_path: None,
        services: vec![],
        resolution_note: None,
        resolution_error: Some(format!(
            "Lifecycle could not resolve a bound shell attach path for workspace \"{workspace_id}\". Launch the TUI from a Lifecycle workspace session or use `lifecycle tui {workspace_id}` from an environment that can resolve that workspace."
        )),
    }
}

fn resolve_ad_hoc_workspace(cwd_hint: Option<String>) -> WorkspaceScope {
    let cwd = cwd_hint.unwrap_or_else(|| ".".to_string());
    let workspace_name = Path::new(&cwd)
        .file_name()
        .and_then(|value| value.to_str())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "workspace".to_string());

    WorkspaceScope {
        binding: WorkspaceBinding::AdHoc,
        workspace_id: None,
        workspace_name,
        repo_name: env_string(REPO_NAME_ENV),
        host: WorkspaceHost::Local,
        status: None,
        source_ref: None,
        cwd: Some(cwd.clone()),
        worktree_path: Some(cwd),
        services: vec![],
        resolution_note: Some(
            "Running in ad hoc local mode. Bind a Lifecycle workspace id to unify shell and workspace-side status."
                .to_string(),
        ),
        resolution_error: None,
    }
}

fn env_string(name: &str) -> Option<String> {
    env::var(name).ok().and_then(|value| {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn run_lifecycle_json<T: DeserializeOwned>(args: &[&str]) -> Result<T, String> {
    let output = Command::new("lifecycle")
        .args(args)
        .arg("--json")
        .output()
        .map_err(|error| error.to_string())?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("command exited with {}", output.status)
        };
        return Err(detail);
    }

    serde_json::from_slice::<T>(&output.stdout).map_err(|error| error.to_string())
}
