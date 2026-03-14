use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::process::Command;

const GITHUB_HOST: &str = "github.com";
const GITHUB_PROVIDER: &str = "github";
const LOCAL_CLI_SOURCE: &str = "local_cli";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthIdentity {
    pub avatar_url: Option<String>,
    pub display_name: String,
    pub handle: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub state: String,
    pub provider: Option<String>,
    pub source: Option<String>,
    pub identity: Option<AuthIdentity>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhAuthStatusResponse {
    hosts: HashMap<String, Vec<GhAuthHostAccount>>,
}

#[derive(Debug, Deserialize)]
struct GhAuthHostAccount {
    active: bool,
    login: String,
    state: String,
}

#[derive(Debug, Deserialize)]
struct GitHubViewer {
    avatar_url: Option<String>,
    login: Option<String>,
    name: Option<String>,
}

fn logged_out_session(message: impl Into<Option<String>>) -> AuthSession {
    AuthSession {
        state: "logged_out".to_string(),
        provider: Some(GITHUB_PROVIDER.to_string()),
        source: Some(LOCAL_CLI_SOURCE.to_string()),
        identity: None,
        message: message.into(),
    }
}

fn logged_in_session(identity: AuthIdentity, message: Option<String>) -> AuthSession {
    AuthSession {
        state: "logged_in".to_string(),
        provider: Some(GITHUB_PROVIDER.to_string()),
        source: Some(LOCAL_CLI_SOURCE.to_string()),
        identity: Some(identity),
        message,
    }
}

fn trim_output(output: &[u8]) -> Option<String> {
    let text = String::from_utf8_lossy(output).trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

fn extract_active_login(status: &GhAuthStatusResponse) -> Option<String> {
    status
        .hosts
        .get(GITHUB_HOST)
        .and_then(|accounts| {
            accounts
                .iter()
                .find(|account| account.active && account.state == "success")
        })
        .map(|account| account.login.clone())
}

fn parse_auth_status(stdout: &[u8]) -> Result<GhAuthStatusResponse, LifecycleError> {
    serde_json::from_slice(stdout)
        .map_err(|error| LifecycleError::Io(format!("failed to parse GitHub auth status: {error}")))
}

fn parse_github_viewer(stdout: &[u8]) -> Result<GitHubViewer, LifecycleError> {
    serde_json::from_slice(stdout)
        .map_err(|error| LifecycleError::Io(format!("failed to parse GitHub profile: {error}")))
}

async fn gh_output(args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("gh").args(args).output().await
}

pub async fn read_auth_session() -> Result<AuthSession, LifecycleError> {
    let auth_status = match gh_output(&[
        "auth",
        "status",
        "--hostname",
        GITHUB_HOST,
        "--json",
        "hosts",
    ])
    .await
    {
        Ok(output) => output,
        Err(error) => {
            return Ok(logged_out_session(Some(format!(
                "GitHub CLI is unavailable on this machine: {error}"
            ))))
        }
    };

    if !auth_status.status.success() {
        return Ok(logged_out_session(
            trim_output(&auth_status.stderr)
                .or_else(|| trim_output(&auth_status.stdout))
                .or(Some(
                    "GitHub authentication is not available locally.".to_string(),
                )),
        ));
    }

    let parsed_status = parse_auth_status(&auth_status.stdout)?;
    let Some(login) = extract_active_login(&parsed_status) else {
        return Ok(logged_out_session(Some(
            "GitHub CLI is not authenticated locally.".to_string(),
        )));
    };

    let viewer_output = match gh_output(&["api", "--hostname", GITHUB_HOST, "user"]).await {
        Ok(output) => output,
        Err(error) => {
            return Ok(logged_in_session(
                AuthIdentity {
                    avatar_url: None,
                    display_name: login.clone(),
                    handle: Some(login),
                },
                Some(format!("GitHub profile details are unavailable: {error}")),
            ))
        }
    };

    if !viewer_output.status.success() {
        return Ok(logged_in_session(
            AuthIdentity {
                avatar_url: None,
                display_name: login.clone(),
                handle: Some(login),
            },
            trim_output(&viewer_output.stderr)
                .or_else(|| trim_output(&viewer_output.stdout))
                .or(Some("GitHub profile details are unavailable.".to_string())),
        ));
    }

    let viewer = parse_github_viewer(&viewer_output.stdout)?;
    let handle = viewer.login.or(Some(login));
    let display_name = viewer
        .name
        .filter(|value| !value.trim().is_empty())
        .or_else(|| handle.clone())
        .unwrap_or_else(|| "Lifecycle user".to_string());

    Ok(logged_in_session(
        AuthIdentity {
            avatar_url: viewer.avatar_url,
            display_name,
            handle,
        },
        None,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_active_github_login_from_auth_status() {
        let parsed = parse_auth_status(
            br#"{"hosts":{"github.com":[{"active":true,"login":"kylealwyn","state":"success"}]}}"#,
        )
        .expect("parse auth status");

        assert_eq!(extract_active_login(&parsed).as_deref(), Some("kylealwyn"));
    }

    #[test]
    fn ignores_inactive_or_failed_accounts_when_reading_auth_status() {
        let parsed = parse_auth_status(
            br#"{"hosts":{"github.com":[{"active":false,"login":"inactive","state":"success"},{"active":true,"login":"broken","state":"failure"}]}}"#,
        )
        .expect("parse auth status");

        assert_eq!(extract_active_login(&parsed), None);
    }

    #[test]
    fn parses_github_viewer_identity() {
        let viewer = parse_github_viewer(
            br#"{"login":"kylealwyn","name":"Kyle Alwyn","avatar_url":"https://avatars.githubusercontent.com/u/14184138?v=4"}"#,
        )
        .expect("parse github viewer");

        assert_eq!(viewer.login.as_deref(), Some("kylealwyn"));
        assert_eq!(viewer.name.as_deref(), Some("Kyle Alwyn"));
        assert_eq!(
            viewer.avatar_url.as_deref(),
            Some("https://avatars.githubusercontent.com/u/14184138?v=4")
        );
    }
}
