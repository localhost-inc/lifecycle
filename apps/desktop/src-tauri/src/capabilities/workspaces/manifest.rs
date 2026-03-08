use serde::Deserialize;
use std::collections::HashMap;

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct LifecycleConfig {
    pub setup: SetupConfig,
    pub services: HashMap<String, ServiceConfig>,
    #[serde(default)]
    pub secrets: HashMap<String, SecretConfig>,
    pub reset: Option<ResetConfig>,
    pub mcps: Option<HashMap<String, McpServerConfig>>,
}

#[derive(Debug, Deserialize)]
pub struct SetupConfig {
    pub steps: Vec<SetupStep>,
}

#[derive(Debug, Deserialize)]
pub struct SetupStep {
    pub name: String,
    pub command: String,
    pub timeout_seconds: u64,
    pub cwd: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "runtime")]
pub enum ServiceConfig {
    #[serde(rename = "process")]
    Process(ProcessService),
    #[serde(rename = "image")]
    Image(ImageService),
}

impl ServiceConfig {
    #[allow(dead_code)]
    pub fn env_vars(&self) -> Option<&HashMap<String, String>> {
        match self {
            Self::Process(s) => s.env_vars.as_ref(),
            Self::Image(s) => s.env_vars.as_ref(),
        }
    }

    pub fn depends_on(&self) -> &[String] {
        match self {
            Self::Process(s) => s.depends_on.as_deref().unwrap_or_default(),
            Self::Image(s) => s.depends_on.as_deref().unwrap_or_default(),
        }
    }

    pub fn health_check(&self) -> Option<&HealthCheck> {
        match self {
            Self::Process(s) => s.health_check.as_ref(),
            Self::Image(s) => s.health_check.as_ref(),
        }
    }

    pub fn port(&self) -> Option<u16> {
        match self {
            Self::Process(s) => s.port,
            Self::Image(s) => s.port,
        }
    }

    pub fn startup_timeout_seconds(&self) -> u64 {
        match self {
            Self::Process(s) => s.startup_timeout_seconds.unwrap_or(60),
            Self::Image(s) => s.startup_timeout_seconds.unwrap_or(60),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ProcessService {
    pub command: String,
    pub cwd: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub restart_policy: Option<String>,
    pub startup_timeout_seconds: Option<u64>,
    pub health_check: Option<HealthCheck>,
    pub port: Option<u16>,
    pub share_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ImageService {
    pub image: String,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub restart_policy: Option<String>,
    pub startup_timeout_seconds: Option<u64>,
    pub health_check: Option<HealthCheck>,
    pub port: Option<u16>,
    pub share_default: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum HealthCheck {
    #[serde(rename = "tcp")]
    Tcp {
        host: String,
        port: u16,
        timeout_seconds: u64,
    },
    #[serde(rename = "http")]
    Http { url: String, timeout_seconds: u64 },
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct SecretConfig {
    #[serde(rename = "ref")]
    pub secret_ref: String,
    pub required: bool,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct ResetConfig {
    pub strategy: Option<String>,
    pub command: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[allow(dead_code)]
#[derive(Debug, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub transport: String,
    pub env_vars: Option<HashMap<String, String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_process_service() {
        let json = r#"{
            "setup": {
                "steps": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                ]
            },
            "services": {
                "api": {
                    "runtime": "process",
                    "command": "bun run dev",
                    "port": 3000,
                    "health_check": {
                        "type": "http",
                        "url": "http://localhost:3000/health",
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config: LifecycleConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.setup.steps.len(), 1);
        assert_eq!(config.setup.steps[0].name, "install");
        assert!(matches!(
            config.services.get("api").unwrap(),
            ServiceConfig::Process(_)
        ));
    }

    #[test]
    fn parse_image_service() {
        let json = r#"{
            "setup": {
                "steps": [
                    { "name": "init", "command": "echo hello", "timeout_seconds": 10 }
                ]
            },
            "services": {
                "db": {
                    "runtime": "image",
                    "image": "postgres:16",
                    "port": 5432,
                    "health_check": {
                        "type": "tcp",
                        "host": "localhost",
                        "port": 5432,
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config: LifecycleConfig = serde_json::from_str(json).unwrap();
        assert!(matches!(
            config.services.get("db").unwrap(),
            ServiceConfig::Image(_)
        ));
    }

    #[test]
    fn parse_mixed_services() {
        let json = r#"{
            "setup": {
                "steps": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                ]
            },
            "services": {
                "api": {
                    "runtime": "process",
                    "command": "bun run dev",
                    "port": 3000,
                    "depends_on": ["db"]
                },
                "db": {
                    "runtime": "image",
                    "image": "postgres:16",
                    "port": 5432
                }
            }
        }"#;

        let config: LifecycleConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.services.len(), 2);
        let api = config.services.get("api").unwrap();
        assert_eq!(api.depends_on(), &["db"]);
    }
}
