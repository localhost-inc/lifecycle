use serde::de::DeserializeOwned;
use serde::Deserialize;

const LIFECYCLE_BRIDGE_URL_ENV: &str = "LIFECYCLE_BRIDGE_URL";

#[derive(Debug, Clone)]
pub struct LifecycleBridgeClient {
    base_url: String,
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

#[derive(Debug, Clone, Deserialize)]
pub struct ServicePayload {
    pub name: String,
    pub status: String,
    pub assigned_port: Option<u16>,
    pub preview_url: Option<String>,
}

impl LifecycleBridgeClient {
    pub fn from_env() -> Option<Self> {
        let base_url = std::env::var(LIFECYCLE_BRIDGE_URL_ENV).ok()?;
        if base_url.trim().is_empty() {
            return None;
        }

        Some(Self { base_url })
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
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

    pub fn workspace_shell(&self, workspace_id: &str) -> Result<crate::shell::WorkspaceShell, String> {
        self.post(&format!("/workspaces/{}/shell", workspace_id))
    }

    pub fn register_repo(&self, path: &str) -> Result<serde_json::Value, String> {
        let url = format!("{}/repos", self.base_url);
        let body = serde_json::json!({
            "path": path,
            "name": std::path::Path::new(path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or(path),
        });
        let response = ureq::post(&url)
            .send_json(body)
            .map_err(|e| e.to_string())?;
        response.into_json().map_err(|e| e.to_string())
    }

    pub fn create_workspace(&self, name: &str, repo_path: Option<&str>) -> Result<serde_json::Value, String> {
        let url = format!("{}/workspaces", self.base_url);
        let mut body = serde_json::json!({
            "name": name,
            "sourceRef": name,
            "worktreePath": "",
        });
        if let Some(path) = repo_path {
            body["repoPath"] = serde_json::Value::String(path.to_string());
        }
        let response = ureq::post(&url)
            .send_json(body)
            .map_err(|e| e.to_string())?;
        response.into_json().map_err(|e| e.to_string())
    }

    pub fn archive_workspace(&self, name: &str, repo_path: &str) -> Result<serde_json::Value, String> {
        let url = format!(
            "{}/workspaces/{}?repoPath={}",
            self.base_url,
            urlencoding::encode(name),
            urlencoding::encode(repo_path),
        );
        let response = ureq::delete(&url)
            .call()
            .map_err(|e| e.to_string())?;
        response.into_json().map_err(|e| e.to_string())
    }

    fn get<TResult: DeserializeOwned>(&self, path: &str) -> Result<TResult, String> {
        let url = format!("{}{}", self.base_url, path);
        let response = ureq::get(&url)
            .call()
            .map_err(|error| error.to_string())?;

        response
            .into_json::<TResult>()
            .map_err(|error| error.to_string())
    }

    fn post<TResult: DeserializeOwned>(&self, path: &str) -> Result<TResult, String> {
        let url = format!("{}{}", self.base_url, path);
        let response = ureq::post(&url)
            .send_bytes(&[])
            .map_err(|error| error.to_string())?;

        response
            .into_json::<TResult>()
            .map_err(|error| error.to_string())
    }
}
