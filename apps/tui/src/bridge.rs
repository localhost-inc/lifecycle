use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const LIFECYCLE_BRIDGE_URL_ENV: &str = "LIFECYCLE_BRIDGE_URL";
const LIFECYCLE_BRIDGE_CLI_RUNTIME_ENV: &str = "LIFECYCLE_BRIDGE_CLI_RUNTIME";
const LIFECYCLE_BRIDGE_CLI_ENTRYPOINT_ENV: &str = "LIFECYCLE_BRIDGE_CLI_ENTRYPOINT";

#[derive(Debug, Clone)]
pub struct LifecycleBridgeClient {
    base_url: Arc<Mutex<String>>,
    launch: BridgeLaunchConfig,
}

#[derive(Debug, Clone)]
struct BridgeLaunchConfig {
    runtime: Option<String>,
    entrypoint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgePidfile {
    port: u16,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RepoListPayload {
    pub repositories: Vec<RepoPayload>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RepoPayload {
    pub name: String,
    pub source: String,
    pub path: Option<String>,
    #[serde(default)]
    pub workspaces: Option<Vec<RepoWorkspacePayload>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RepoWorkspacePayload {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub host: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(rename = "ref")]
    pub git_ref: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivityPayload {
    pub workspaces: Vec<ActivityEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivityEntry {
    pub repo: String,
    pub name: String,
    pub busy: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServiceListPayload {
    pub services: Vec<ServicePayload>,
}

#[derive(Debug, Deserialize)]
struct BridgeErrorEnvelope {
    error: BridgeErrorPayload,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum BridgeErrorPayload {
    Structured(BridgeStructuredErrorPayload),
    Message(String),
}

#[derive(Debug, Deserialize)]
struct BridgeStructuredErrorPayload {
    message: String,
    #[serde(default)]
    _code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgeValidationEnvelope {
    error: String,
    target: Option<String>,
    #[serde(default)]
    issues: Vec<BridgeValidationIssue>,
}

#[derive(Debug, Deserialize)]
struct BridgeValidationIssue {
    #[serde(default)]
    message: Option<String>,
    #[serde(default)]
    path: Vec<BridgeValidationPathSegment>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum BridgeValidationPathSegment {
    Key(String),
    Index(u64),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceServiceActionPayload {
    pub workspace_id: String,
    pub services: Vec<ServicePayload>,
    pub started_services: Option<Vec<String>>,
    pub stopped_services: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServicePayload {
    pub name: String,
    pub status: String,
    pub assigned_port: Option<u16>,
    pub preview_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceGitPayload {
    pub status: GitStatusPayload,
    pub commits: Vec<GitLogEntryPayload>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceGitCommitPayload {
    pub commit: GitCommitPayload,
    pub push: Option<GitPushPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusPayload {
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatusPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatusPayload {
    pub path: String,
    pub index_status: Option<String>,
    pub worktree_status: Option<String>,
    pub staged: bool,
    pub unstaged: bool,
    pub stats: GitFileStatsPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatsPayload {
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntryPayload {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitPayload {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushPayload {
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

impl LifecycleBridgeClient {
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var(LIFECYCLE_BRIDGE_URL_ENV).ok()?;
        if base_url.trim().is_empty() {
            return None;
        }

        Some(Self {
            base_url: Arc::new(Mutex::new(base_url)),
            launch: BridgeLaunchConfig {
                runtime: std::env::var(LIFECYCLE_BRIDGE_CLI_RUNTIME_ENV).ok().filter(|value| !value.trim().is_empty()),
                entrypoint: std::env::var(LIFECYCLE_BRIDGE_CLI_ENTRYPOINT_ENV).ok().filter(|value| !value.trim().is_empty()),
            },
        })
    }

    pub fn base_url(&self) -> &str {
        panic!("base_url() no longer returns a stable borrowed string; use current_base_url() instead")
    }

    pub fn repo_list(&self) -> Result<RepoListPayload, String> {
        self.get("/repos")
    }

    pub fn workspace_activity(&self) -> Result<ActivityPayload, String> {
        self.get("/workspaces/activity")
    }

    pub fn service_list(&self, workspace_id: &str) -> Result<ServiceListPayload, String> {
        self.get(&format!("/workspaces/{}/services", workspace_id))
    }

    pub fn service_start(
        &self,
        workspace_id: &str,
        service_names: &[String],
    ) -> Result<WorkspaceServiceActionPayload, String> {
        let body = if service_names.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "serviceNames": serde_json::to_value(service_names).map_err(|error| error.to_string())?,
            })
        };
        self.send_json::<WorkspaceServiceActionPayload>(
            &format!("/workspaces/{}/services/start", workspace_id),
            body,
        )
    }

    pub fn service_stop(
        &self,
        workspace_id: &str,
        service_names: &[String],
    ) -> Result<WorkspaceServiceActionPayload, String> {
        let body = if service_names.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "serviceNames": serde_json::to_value(service_names).map_err(|error| error.to_string())?,
            })
        };
        self.send_json::<WorkspaceServiceActionPayload>(
            &format!("/workspaces/{}/services/stop", workspace_id),
            body,
        )
    }

    pub fn workspace_git(&self, workspace_id: &str) -> Result<WorkspaceGitPayload, String> {
        self.get(&format!("/workspaces/{}/git", workspace_id))
    }

    pub fn workspace_shell(&self, workspace_id: &str) -> Result<crate::shell::WorkspaceShell, String> {
        self.post(&format!("/workspaces/{}/shell", workspace_id))
    }

    pub fn workspace_git_commit(
        &self,
        workspace_id: &str,
        message: &str,
        push: bool,
        stage_all: bool,
    ) -> Result<WorkspaceGitCommitPayload, String> {
        let body = serde_json::json!({
            "message": message,
            "push": push,
            "stageAll": stage_all,
        });
        self.send_json::<WorkspaceGitCommitPayload>(
            &format!("/workspaces/{}/git/commit", workspace_id),
            body,
        )
    }

    pub fn register_repo(&self, path: &str) -> Result<serde_json::Value, String> {
        let body = serde_json::json!({
            "path": path,
            "name": std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path),
        });
        self.send_json::<serde_json::Value>("/repos", body)
    }

    pub fn create_workspace(&self, name: &str, repo_path: Option<&str>) -> Result<serde_json::Value, String> {
        let repo_path = repo_path
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .ok_or_else(|| "Workspace creation requires a repository path.".to_string())?;
        let body = serde_json::json!({
            "repoPath": repo_path,
            "name": name,
            "sourceRef": name,
        });
        self.send_json::<serde_json::Value>("/workspaces", body)
    }

    pub fn archive_workspace(&self, name: &str, repo_path: &str) -> Result<serde_json::Value, String> {
        self.request_json::<serde_json::Value, _>(|base_url| {
            let url = format!(
                "{}/workspaces/{}?repoPath={}",
                base_url,
                urlencoding::encode(name),
                urlencoding::encode(repo_path),
            );
            ureq::delete(&url).call()
        })
    }

    fn get<TResult: DeserializeOwned>(&self, path: &str) -> Result<TResult, String> {
        self.request_json::<TResult, _>(|base_url| {
            let url = format!("{}{}", base_url, path);
            ureq::get(&url).call()
        })
    }

    fn post<TResult: DeserializeOwned>(&self, path: &str) -> Result<TResult, String> {
        self.request_json::<TResult, _>(|base_url| {
            let url = format!("{}{}", base_url, path);
            ureq::post(&url).send_bytes(&[])
        })
    }

    fn send_json<TResult: DeserializeOwned>(
        &self,
        path: &str,
        body: serde_json::Value,
    ) -> Result<TResult, String> {
        self.request_json::<TResult, _>(|base_url| {
            let url = format!("{}{}", base_url, path);
            ureq::post(&url).send_json(body.clone())
        })
    }

    fn request_json<TResult: DeserializeOwned, F>(
        &self,
        mut send: F,
    ) -> Result<TResult, String>
    where
        F: FnMut(&str) -> Result<ureq::Response, ureq::Error>,
    {
        let base_url = self.current_base_url();
        let response = send(&base_url);
        match response {
            Ok(response) => response
                .into_json::<TResult>()
                .map_err(|error| error.to_string()),
            Err(ureq::Error::Status(status, response)) => {
                let body = response.into_string().unwrap_or_default();
                Err(format_bridge_error(status, &body))
            }
            Err(ureq::Error::Transport(error)) => {
                if let Some(recovered_url) = self.recover_bridge(&base_url) {
                    match send(&recovered_url) {
                        Ok(response) => {
                            return response
                                .into_json::<TResult>()
                                .map_err(|decode_error| decode_error.to_string());
                        }
                        Err(ureq::Error::Status(status, response)) => {
                            let body = response.into_string().unwrap_or_default();
                            return Err(format_bridge_error(status, &body));
                        }
                        Err(ureq::Error::Transport(retry_error)) => {
                            return Err(format!(
                                "Could not reach bridge after rediscovery at {}: {}",
                                recovered_url, retry_error
                            ));
                        }
                    }
                }

                Err(format!("Could not reach bridge at {}: {}", base_url, error))
            }
        }
    }

    fn current_base_url(&self) -> String {
        self.base_url.lock().expect("bridge url lock poisoned").clone()
    }

    fn set_base_url(&self, next_url: String) {
        *self.base_url.lock().expect("bridge url lock poisoned") = next_url;
    }

    fn recover_bridge(&self, current_url: &str) -> Option<String> {
        if let Some(discovered_url) = discover_healthy_bridge_url() {
            self.set_base_url(discovered_url.clone());
            return Some(discovered_url);
        }

        if self.launch.start().is_ok() {
            for _ in 0..20 {
                thread::sleep(Duration::from_millis(100));
                if let Some(discovered_url) = discover_healthy_bridge_url() {
                    self.set_base_url(discovered_url.clone());
                    return Some(discovered_url);
                }
            }
        }

        if let Some(discovered_url) = discover_bridge_url() {
            if discovered_url != current_url {
                self.set_base_url(discovered_url.clone());
                return Some(discovered_url);
            }
        }

        None
    }
}

impl BridgeLaunchConfig {
    fn start(&self) -> Result<(), String> {
        if let (Some(runtime), Some(entrypoint)) = (&self.runtime, &self.entrypoint) {
            Command::new(runtime)
                .arg(entrypoint)
                .arg("bridge")
                .arg("start")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|error| error.to_string())?;
            return Ok(());
        }

        Command::new("lifecycle")
            .arg("bridge")
            .arg("start")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|error| error.to_string())?;

        Ok(())
    }
}

fn discover_healthy_bridge_url() -> Option<String> {
    let url = discover_bridge_url()?;
    match ureq::get(&format!("{}/health", url)).call() {
        Ok(response) if response.status() == 200 => Some(url),
        _ => None,
    }
}

fn discover_bridge_url() -> Option<String> {
    let pidfile_path = bridge_pidfile_path()?;
    let pidfile = serde_json::from_str::<BridgePidfile>(&fs::read_to_string(pidfile_path).ok()?).ok()?;
    Some(format!("http://127.0.0.1:{}", pidfile.port))
}

fn bridge_pidfile_path() -> Option<PathBuf> {
    Some(dirs::home_dir()?.join(".lifecycle").join("bridge.json"))
}

fn format_bridge_error(status: u16, body: &str) -> String {
    if let Ok(payload) = serde_json::from_str::<BridgeValidationEnvelope>(body) {
        let prefix = if let Some(target) = payload.target {
            format!("Bridge {} validation failed", target)
        } else {
            "Bridge validation failed".to_string()
        };
        let details = format_validation_issues(&payload.issues);
        return if details.is_empty() {
            format!("{}: {}", prefix, payload.error)
        } else {
            format!("{}: {}", prefix, details)
        };
    }

    if let Ok(payload) = serde_json::from_str::<BridgeErrorEnvelope>(body) {
        return match payload.error {
            BridgeErrorPayload::Structured(error) => error.message,
            BridgeErrorPayload::Message(message) => message,
        };
    }

    let raw_body = body.trim();
    if raw_body.is_empty() {
        return format!("Bridge request failed with status {}.", status);
    }

    format!("Bridge request failed with status {}: {}", status, raw_body)
}

fn format_validation_issues(issues: &[BridgeValidationIssue]) -> String {
    issues
        .iter()
        .filter_map(|issue| {
            let message = issue.message.as_deref()?.trim();
            if message.is_empty() {
                return None;
            }

            let path = format_validation_path(&issue.path);
            Some(if path.is_empty() {
                message.to_string()
            } else {
                format!("{}: {}", path, message)
            })
        })
        .collect::<Vec<_>>()
        .join("; ")
}

fn format_validation_path(path: &[BridgeValidationPathSegment]) -> String {
    let mut formatted = String::new();
    for segment in path {
        match segment {
            BridgeValidationPathSegment::Key(key) => {
                if !formatted.is_empty() {
                    formatted.push('.');
                }
                formatted.push_str(key);
            }
            BridgeValidationPathSegment::Index(index) => {
                formatted.push('[');
                formatted.push_str(&index.to_string());
                formatted.push(']');
            }
        }
    }
    formatted
}

#[cfg(test)]
mod tests {
    use super::format_bridge_error;

    #[test]
    fn formats_structured_bridge_errors() {
        let message = format_bridge_error(
            400,
            r#"{"error":{"code":"stack_unconfigured","message":"Workspace has no lifecycle.json."}}"#,
        );
        assert_eq!(message, "Workspace has no lifecycle.json.");
    }

    #[test]
    fn formats_validation_errors_with_issue_details() {
        let message = format_bridge_error(
            400,
            r#"{"error":"Validation failed","target":"body","issues":[{"message":"Required","path":["repoPath"]},{"message":"Too small: expected string to have >=1 characters","path":["worktreePath"]}]}"#,
        );
        assert_eq!(
            message,
            "Bridge body validation failed: repoPath: Required; worktreePath: Too small: expected string to have >=1 characters",
        );
    }

    #[test]
    fn formats_raw_text_failures_with_status() {
        let message = format_bridge_error(500, "upstream exploded");
        assert_eq!(message, "Bridge request failed with status 500: upstream exploded");
    }
}
