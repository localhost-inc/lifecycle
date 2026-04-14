use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

const LIFECYCLE_BRIDGE_URL_ENV: &str = "LIFECYCLE_BRIDGE_URL";
const LIFECYCLE_BRIDGE_CLI_RUNTIME_ENV: &str = "LIFECYCLE_BRIDGE_CLI_RUNTIME";
const LIFECYCLE_BRIDGE_CLI_ENTRYPOINT_ENV: &str = "LIFECYCLE_BRIDGE_CLI_ENTRYPOINT";
const LIFECYCLE_BRIDGE_REGISTRATION_ENV: &str = "LIFECYCLE_BRIDGE_REGISTRATION";
const LIFECYCLE_RUNTIME_ROOT_ENV: &str = "LIFECYCLE_RUNTIME_ROOT";

#[derive(Debug, Clone)]
pub struct LifecycleBridgeClient {
    base_url: Arc<Mutex<String>>,
    launch: BridgeLaunchConfig,
    /// Receives the new base URL each time `bridge.json` changes.
    url_changed_rx: Arc<Mutex<mpsc::Receiver<String>>>,
    /// Keeps the watcher alive for the lifetime of the client.
    _watcher: Arc<Mutex<Option<RecommendedWatcher>>>,
}

#[derive(Debug, Clone)]
struct BridgeLaunchConfig {
    runtime: Option<String>,
    entrypoint: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BridgeRegistration {
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
pub struct StackNodePayload {
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub assigned_port: Option<u16>,
    #[serde(default)]
    pub preview_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StackSummaryPayload {
    pub state: String,
    pub nodes: Vec<StackNodePayload>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceStackPayload {
    pub stack: StackSummaryPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceStackActionPayload {
    pub stack: StackSummaryPayload,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGitPayload {
    pub status: GitStatusPayload,
    pub commits: Vec<GitLogEntryPayload>,
    pub current_branch: GitBranchPullRequestPayload,
    pub pull_requests: GitPullRequestListPayload,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceGitCommitPayload {
    pub push: Option<GitPushPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusPayload {
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatusPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatusPayload {
    pub path: String,
    pub original_path: Option<String>,
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
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushPayload {}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestSupportPayload {
    pub available: bool,
    pub provider: Option<String>,
    pub reason: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestCheckSummaryPayload {
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestSummaryPayload {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub is_draft: bool,
    pub author: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub mergeable: String,
    pub review_decision: Option<String>,
    pub checks: Option<Vec<GitPullRequestCheckSummaryPayload>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestListPayload {
    pub support: GitPullRequestSupportPayload,
    pub pull_requests: Vec<GitPullRequestSummaryPayload>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchPullRequestPayload {
    pub support: GitPullRequestSupportPayload,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub has_pull_request_changes: Option<bool>,
    pub suggested_base_ref: Option<String>,
    pub pull_request: Option<GitPullRequestSummaryPayload>,
}

impl LifecycleBridgeClient {
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var(LIFECYCLE_BRIDGE_URL_ENV).ok()?;
        if base_url.trim().is_empty() {
            return None;
        }

        let (url_changed_tx, url_changed_rx) = mpsc::channel();
        let shared_url = Arc::new(Mutex::new(base_url));
        let watcher = start_registration_watcher(shared_url.clone(), url_changed_tx);

        Some(Self {
            base_url: shared_url,
            launch: BridgeLaunchConfig {
                runtime: std::env::var(LIFECYCLE_BRIDGE_CLI_RUNTIME_ENV)
                    .ok()
                    .filter(|value| !value.trim().is_empty()),
                entrypoint: std::env::var(LIFECYCLE_BRIDGE_CLI_ENTRYPOINT_ENV)
                    .ok()
                    .filter(|value| !value.trim().is_empty()),
            },
            url_changed_rx: Arc::new(Mutex::new(url_changed_rx)),
            _watcher: Arc::new(Mutex::new(watcher)),
        })
    }

    pub fn base_url(&self) -> String {
        self.current_base_url()
    }

    /// Drain any pending URL-change notifications from the file watcher.
    /// Returns the latest new base URL if the bridge moved, or `None`.
    pub fn poll_url_changed(&self) -> Option<String> {
        let rx = self
            .url_changed_rx
            .lock()
            .expect("url_changed lock poisoned");
        let mut latest = None;
        while let Ok(url) = rx.try_recv() {
            latest = Some(url);
        }
        latest
    }

    pub fn repo_list(&self) -> Result<RepoListPayload, String> {
        self.get("/repos")
    }

    pub fn stack_summary(&self, workspace_id: &str) -> Result<WorkspaceStackPayload, String> {
        self.get(&format!("/workspaces/{}/stack", workspace_id))
    }

    pub fn stack_start(
        &self,
        workspace_id: &str,
        service_names: &[String],
    ) -> Result<WorkspaceStackActionPayload, String> {
        let body = if service_names.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "serviceNames": serde_json::to_value(service_names).map_err(|error| error.to_string())?,
            })
        };
        self.send_json::<WorkspaceStackActionPayload>(
            &format!("/workspaces/{}/stack/start", workspace_id),
            body,
        )
    }

    pub fn stack_stop(
        &self,
        workspace_id: &str,
        service_names: &[String],
    ) -> Result<WorkspaceStackActionPayload, String> {
        let body = if service_names.is_empty() {
            serde_json::json!({})
        } else {
            serde_json::json!({
                "serviceNames": serde_json::to_value(service_names).map_err(|error| error.to_string())?,
            })
        };
        self.send_json::<WorkspaceStackActionPayload>(
            &format!("/workspaces/{}/stack/stop", workspace_id),
            body,
        )
    }

    pub fn workspace_git(&self, workspace_id: &str) -> Result<WorkspaceGitPayload, String> {
        self.get(&format!("/workspaces/{}/git", workspace_id))
    }

    pub fn workspace_shell(
        &self,
        workspace_id: &str,
    ) -> Result<crate::shell::WorkspaceShell, String> {
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

    pub fn create_workspace(
        &self,
        name: &str,
        repo_path: Option<&str>,
    ) -> Result<serde_json::Value, String> {
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

    pub fn archive_workspace(
        &self,
        name: &str,
        repo_path: &str,
    ) -> Result<serde_json::Value, String> {
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

    fn request_json<TResult: DeserializeOwned, F>(&self, mut send: F) -> Result<TResult, String>
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
        self.base_url
            .lock()
            .expect("bridge url lock poisoned")
            .clone()
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
    let registration_path = bridge_registration_path()?;
    bridge_url_from_registration_text(&fs::read_to_string(registration_path).ok()?)
}

fn bridge_registration_path() -> Option<PathBuf> {
    bridge_registration_path_from_env(
        std::env::var(LIFECYCLE_BRIDGE_REGISTRATION_ENV).ok(),
        std::env::var(LIFECYCLE_RUNTIME_ROOT_ENV).ok(),
        dirs::home_dir(),
    )
}

fn bridge_registration_path_from_env(
    explicit_registration: Option<String>,
    runtime_root: Option<String>,
    home_dir: Option<PathBuf>,
) -> Option<PathBuf> {
    if let Some(path) = explicit_registration {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return expand_home_path(trimmed, home_dir.clone());
        }
    }

    if let Some(root) = runtime_root {
        let trimmed = root.trim();
        if !trimmed.is_empty() {
            return Some(expand_home_path(trimmed, home_dir)?.join("bridge.json"));
        }
    }

    Some(home_dir?.join(".lifecycle").join("bridge.json"))
}

fn expand_home_path(path: &str, home_dir: Option<PathBuf>) -> Option<PathBuf> {
    if path == "~" {
        return home_dir;
    }

    if let Some(stripped) = path.strip_prefix("~/") {
        return Some(home_dir?.join(stripped));
    }

    Some(PathBuf::from(path))
}

pub fn current_bridge_url_from_registration() -> Option<String> {
    discover_bridge_url()
}

fn bridge_url_from_registration_text(text: &str) -> Option<String> {
    let registration = serde_json::from_str::<BridgeRegistration>(text).ok()?;
    Some(format!("http://127.0.0.1:{}", registration.port))
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

/// Watch `~/.lifecycle/bridge.json` for changes. When the file is written,
/// re-read the registration and, if the derived URL differs from the current
/// `base_url`, update it and send the new URL through `tx`.
fn start_registration_watcher(
    base_url: Arc<Mutex<String>>,
    tx: mpsc::Sender<String>,
) -> Option<RecommendedWatcher> {
    let registration_path = bridge_registration_path()?;
    let watch_dir = registration_path.parent()?.to_path_buf();

    let mut watcher =
        notify::recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            let event = match res {
                Ok(event) => event,
                Err(_) => return,
            };

            let dominated = matches!(
                event.kind,
                notify::EventKind::Create(_)
                    | notify::EventKind::Modify(_)
                    | notify::EventKind::Remove(_)
            );
            if !dominated {
                return;
            }

            let affects_registration = event.paths.iter().any(|p| p.ends_with("bridge.json"));
            if !affects_registration {
                return;
            }

            let next_url = match discover_healthy_bridge_url() {
                Some(url) => url,
                None => return,
            };

            let current = base_url.lock().expect("bridge url lock poisoned").clone();
            if next_url != current {
                crate::debug::log(format!(
                    "bridge registration changed: {} -> {}",
                    current, next_url
                ));
                *base_url.lock().expect("bridge url lock poisoned") = next_url.clone();
                let _ = tx.send(next_url);
            }
        })
        .ok()?;

    watcher
        .watch(&watch_dir, RecursiveMode::NonRecursive)
        .ok()?;
    Some(watcher)
}

#[cfg(test)]
mod tests {
    use super::{
        bridge_registration_path_from_env, bridge_url_from_registration_text, format_bridge_error,
        WorkspaceGitPayload,
    };
    use std::path::PathBuf;

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
            r#"{"error":"Validation failed","target":"body","issues":[{"message":"Required","path":["repoPath"]},{"message":"Too small: expected string to have >=1 characters","path":["workspaceRoot"]}]}"#,
        );
        assert_eq!(
            message,
            "Bridge body validation failed: repoPath: Required; workspaceRoot: Too small: expected string to have >=1 characters",
        );
    }

    #[test]
    fn formats_raw_text_failures_with_status() {
        let message = format_bridge_error(500, "upstream exploded");
        assert_eq!(
            message,
            "Bridge request failed with status 500: upstream exploded"
        );
    }

    #[test]
    fn parses_bridge_url_from_registration_text() {
        let url = bridge_url_from_registration_text(r#"{"pid":42,"port":52036}"#);
        assert_eq!(url.as_deref(), Some("http://127.0.0.1:52036"));
    }

    #[test]
    fn registration_path_prefers_explicit_override() {
        let path = bridge_registration_path_from_env(
            Some("/tmp/custom-bridge.json".to_string()),
            Some("/tmp/runtime-root".to_string()),
            Some(PathBuf::from("/Users/kyle")),
        )
        .expect("registration path");

        assert_eq!(path, PathBuf::from("/tmp/custom-bridge.json"));
    }

    #[test]
    fn registration_path_uses_runtime_root() {
        let path = bridge_registration_path_from_env(
            None,
            Some("/tmp/runtime-root".to_string()),
            Some(PathBuf::from("/Users/kyle")),
        )
        .expect("registration path");

        assert_eq!(path, PathBuf::from("/tmp/runtime-root/bridge.json"));
    }

    #[test]
    fn deserializes_workspace_git_payload_with_pull_request_fields() {
        let payload = serde_json::from_str::<WorkspaceGitPayload>(
            r#"{
                "status": {
                    "branch": "feature/git-prs",
                    "headSha": "abcdef1234567890",
                    "upstream": "origin/feature/git-prs",
                    "ahead": 2,
                    "behind": 1,
                    "files": [
                        {
                            "path": "src/app.ts",
                            "originalPath": null,
                            "indexStatus": "modified",
                            "worktreeStatus": "modified",
                            "staged": true,
                            "unstaged": true,
                            "stats": {
                                "insertions": 12,
                                "deletions": 4
                            }
                        }
                    ]
                },
                "commits": [
                    {
                        "sha": "abcdef1234567890",
                        "shortSha": "abcdef12",
                        "message": "feat: add version control panel",
                        "author": "kyle",
                        "email": "kyle@example.com",
                        "timestamp": "2026-03-09T11:00:00.000Z"
                    }
                ],
                "currentBranch": {
                    "support": {
                        "available": true,
                        "provider": "github",
                        "reason": null,
                        "message": null
                    },
                    "branch": "feature/git-prs",
                    "upstream": "origin/feature/git-prs",
                    "hasPullRequestChanges": true,
                    "suggestedBaseRef": "main",
                    "pullRequest": {
                        "number": 42,
                        "title": "feat: add git pull request rail",
                        "url": "https://github.com/example/repo/pull/42",
                        "state": "open",
                        "isDraft": false,
                        "author": "kyle",
                        "headRefName": "feature/git-prs",
                        "baseRefName": "main",
                        "createdAt": "2026-03-09T10:00:00.000Z",
                        "updatedAt": "2026-03-09T11:00:00.000Z",
                        "mergeable": "mergeable",
                        "mergeStateStatus": "CLEAN",
                        "reviewDecision": "approved",
                        "checks": [
                            {
                                "name": "build",
                                "status": "success",
                                "workflowName": "CI",
                                "detailsUrl": "https://github.com/example/repo/actions/runs/42"
                            }
                        ]
                    }
                },
                "pullRequests": {
                    "support": {
                        "available": true,
                        "provider": "github",
                        "reason": null,
                        "message": null
                    },
                    "pullRequests": [
                        {
                            "number": 42,
                            "title": "feat: add git pull request rail",
                            "url": "https://github.com/example/repo/pull/42",
                            "state": "open",
                            "isDraft": false,
                            "author": "kyle",
                            "headRefName": "feature/git-prs",
                            "baseRefName": "main",
                            "createdAt": "2026-03-09T10:00:00.000Z",
                            "updatedAt": "2026-03-09T11:00:00.000Z",
                            "mergeable": "mergeable",
                            "mergeStateStatus": "CLEAN",
                            "reviewDecision": "approved",
                            "checks": [
                                {
                                    "name": "build",
                                    "status": "success",
                                    "workflowName": "CI",
                                    "detailsUrl": "https://github.com/example/repo/actions/runs/42"
                                }
                            ]
                        }
                    ]
                }
            }"#,
        )
        .expect("payload should deserialize");

        assert_eq!(
            payload.status.upstream.as_deref(),
            Some("origin/feature/git-prs")
        );
        assert_eq!(
            payload
                .current_branch
                .pull_request
                .as_ref()
                .map(|pr| pr.number),
            Some(42)
        );
        assert_eq!(payload.pull_requests.pull_requests.len(), 1);
    }
}
