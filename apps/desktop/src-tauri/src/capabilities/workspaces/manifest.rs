use crate::shared::errors::LifecycleError;
use serde::Deserialize;
use serde_json::Value;
use std::collections::HashMap;

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct LifecycleConfig {
    pub setup: SetupConfig,
    pub services: HashMap<String, ServiceConfig>,
    pub reset: Option<ResetConfig>,
    pub mcps: Option<HashMap<String, McpServerConfig>>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SetupConfig {
    pub services: Option<Vec<String>>,
    pub steps: Vec<SetupStep>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SetupStep {
    pub name: String,
    pub command: Option<String>,
    pub write_files: Option<Vec<SetupWriteFile>>,
    pub timeout_seconds: u64,
    pub cwd: Option<String>,
    pub env_vars: Option<HashMap<String, String>>,
    pub run_on: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SetupWriteFile {
    pub path: String,
    pub content: Option<String>,
    pub lines: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
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

    pub fn share_default(&self) -> bool {
        match self {
            Self::Process(s) => s.share_default.unwrap_or(false),
            Self::Image(s) => s.share_default.unwrap_or(false),
        }
    }

    pub fn startup_timeout_seconds(&self) -> u64 {
        match self {
            Self::Process(s) => s.startup_timeout_seconds.unwrap_or(60),
            Self::Image(s) => s.startup_timeout_seconds.unwrap_or(60),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
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
    #[serde(skip)]
    pub resolved_port: Option<u16>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ImageService {
    pub image: Option<String>,
    pub build: Option<ImageBuild>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env_vars: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub restart_policy: Option<String>,
    pub startup_timeout_seconds: Option<u64>,
    pub health_check: Option<HealthCheck>,
    pub port: Option<u16>,
    pub share_default: Option<bool>,
    pub volumes: Option<Vec<ImageVolume>>,
    #[serde(skip)]
    pub resolved_port: Option<u16>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ImageBuild {
    pub context: String,
    pub dockerfile: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ImageVolume {
    pub source: String,
    pub target: String,
    pub read_only: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
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
#[derive(Clone, Debug, Deserialize)]
pub struct ResetConfig {
    pub strategy: Option<String>,
    pub command: Option<String>,
    pub timeout_seconds: Option<u64>,
}

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize)]
pub struct McpServerConfig {
    pub command: String,
    pub args: Option<Vec<String>>,
    pub transport: String,
    pub env_vars: Option<HashMap<String, String>>,
}

const UNSUPPORTED_SECRETS_MESSAGE: &str =
    "managed secrets are not supported in local lifecycle.json yet; materialize local env files in setup instead";
const UNSUPPORTED_SECRET_TEMPLATE_MESSAGE: &str =
    "`${secrets.*}` is not supported in local lifecycle.json; materialize local env files in setup instead";

pub fn parse_lifecycle_config(json: &str) -> Result<LifecycleConfig, LifecycleError> {
    let value: Value = serde_json::from_str(json)
        .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?;
    validate_manifest_value(&value)?;

    let config: LifecycleConfig = serde_json::from_value(value)
        .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?;
    config.validate()?;
    Ok(config)
}

impl LifecycleConfig {
    pub fn validate(&self) -> Result<(), LifecycleError> {
        if self.setup.steps.is_empty() {
            return manifest_invalid("setup.steps", "must include at least one step");
        }

        for (index, step) in self.setup.steps.iter().enumerate() {
            let step_field = format!("setup.steps.{index}");
            match (step.command.as_deref(), step.write_files.as_ref()) {
                (Some(_), None) | (None, Some(_)) => {}
                _ => {
                    return manifest_invalid(
                        &step_field,
                        "requires exactly one of command or write_files",
                    );
                }
            }

            if let Some(run_on) = step.run_on.as_deref() {
                if !matches!(run_on, "create" | "start") {
                    return manifest_invalid(
                        &format!("{step_field}.run_on"),
                        "must be one of: create, start",
                    );
                }
            }

            if let Some(write_files) = step.write_files.as_ref() {
                if write_files.is_empty() {
                    return manifest_invalid(
                        &format!("{step_field}.write_files"),
                        "must not be empty",
                    );
                }

                for (file_index, file) in write_files.iter().enumerate() {
                    let file_field = format!("{step_field}.write_files.{file_index}");
                    let has_content = file.content.is_some();
                    let has_lines = file.lines.is_some();
                    if has_content == has_lines {
                        return manifest_invalid(
                            &file_field,
                            "requires exactly one of content or lines",
                        );
                    }
                    if file.lines.as_ref().is_some_and(Vec::is_empty) {
                        return manifest_invalid(
                            &format!("{file_field}.lines"),
                            "must not be empty",
                        );
                    }
                }
            }
        }

        for (service_name, service) in &self.services {
            if let ServiceConfig::Image(image) = service {
                if image.image.is_none() && image.build.is_none() {
                    return manifest_invalid(
                        &format!("services.{service_name}.image"),
                        "image services require either image or build",
                    );
                }
            }
        }

        if let Some(reset) = self.reset.as_ref() {
            if let Some(strategy) = reset.strategy.as_deref() {
                if !matches!(strategy, "reseed" | "snapshot") {
                    return manifest_invalid("reset.strategy", "must be one of: reseed, snapshot");
                }
            }
        }

        if let Some(mcps) = self.mcps.as_ref() {
            for (name, server) in mcps {
                if !matches!(server.transport.as_str(), "stdio" | "sse") {
                    return manifest_invalid(
                        &format!("mcps.{name}.transport"),
                        "must be one of: stdio, sse",
                    );
                }
            }
        }

        Ok(())
    }
}

fn validate_manifest_value(value: &Value) -> Result<(), LifecycleError> {
    if let Some(object) = value.as_object() {
        if object.contains_key("secrets") {
            return manifest_invalid("secrets", UNSUPPORTED_SECRETS_MESSAGE);
        }
    }

    let mut path = Vec::new();
    validate_manifest_value_inner(value, &mut path)
}

fn validate_manifest_value_inner(
    value: &Value,
    path: &mut Vec<String>,
) -> Result<(), LifecycleError> {
    match value {
        Value::String(content) => {
            if content.contains("${secrets.") {
                return manifest_invalid(&path.join("."), UNSUPPORTED_SECRET_TEMPLATE_MESSAGE);
            }
        }
        Value::Array(entries) => {
            for (index, entry) in entries.iter().enumerate() {
                path.push(index.to_string());
                validate_manifest_value_inner(entry, path)?;
                path.pop();
            }
        }
        Value::Object(entries) => {
            for (key, entry) in entries {
                if path.is_empty() && key == "secrets" {
                    continue;
                }
                path.push(key.clone());
                validate_manifest_value_inner(entry, path)?;
                path.pop();
            }
        }
        _ => {}
    }

    Ok(())
}

fn manifest_invalid<T>(field: &str, reason: &str) -> Result<T, LifecycleError> {
    Err(LifecycleError::ManifestInvalid(format!(
        "{field}: {reason}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse_config(json: &str) -> LifecycleConfig {
        parse_lifecycle_config(json).expect("valid config")
    }

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
                        "kind": "http",
                        "url": "http://localhost:3000/health",
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config = parse_config(json);
        assert!(config.setup.services.is_none());
        assert_eq!(config.setup.steps.len(), 1);
        assert_eq!(config.setup.steps[0].name, "install");
        assert_eq!(
            config.setup.steps[0].command.as_deref(),
            Some("bun install")
        );
        assert!(config.setup.steps[0].write_files.is_none());
        assert!(config.setup.steps[0].run_on.is_none());
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
                        "kind": "tcp",
                        "host": "localhost",
                        "port": 5432,
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config = parse_config(json);
        assert!(matches!(
            config.services.get("db").unwrap(),
            ServiceConfig::Image(_)
        ));
    }

    #[test]
    fn parse_mixed_services() {
        let json = r#"{
            "setup": {
                "services": ["db"],
                "steps": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120, "run_on": "start" }
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

        let config = parse_config(json);
        assert_eq!(config.services.len(), 2);
        assert_eq!(config.setup.services, Some(vec!["db".to_string()]));
        assert_eq!(config.setup.steps[0].run_on.as_deref(), Some("start"));
        let api = config.services.get("api").unwrap();
        assert_eq!(api.depends_on(), &["db"]);
    }

    #[test]
    fn parse_image_service_with_build_and_volumes() {
        let json = r#"{
            "setup": {
                "steps": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                ]
            },
            "services": {
                "postgres": {
                    "runtime": "image",
                    "build": {
                        "context": "docker",
                        "dockerfile": "docker/Dockerfile.pg.dev"
                    },
                    "volumes": [
                        { "source": "workspace://postgres", "target": "/var/lib/postgresql/data" },
                        { "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true }
                    ]
                }
            }
        }"#;

        let config = parse_config(json);
        let service = config
            .services
            .get("postgres")
            .expect("postgres service exists");
        let ServiceConfig::Image(service) = service else {
            panic!("expected image service");
        };

        assert!(service.image.is_none());
        assert_eq!(
            service.build.as_ref().map(|build| build.context.as_str()),
            Some("docker")
        );
        assert_eq!(service.volumes.as_ref().map(Vec::len), Some(2));
    }

    #[test]
    fn parse_setup_step_with_write_files() {
        let json = r#"{
            "setup": {
                "steps": [
                    {
                        "name": "write-env",
                        "write_files": [
                            {
                                "path": "apps/api/.env.local",
                                "lines": [
                                    "PORT=${LIFECYCLE_SERVICE_API_PORT}",
                                    "HOST=${LIFECYCLE_SERVICE_API_HOST}"
                                ]
                            }
                        ],
                        "timeout_seconds": 10,
                        "run_on": "start"
                    }
                ]
            },
            "services": {
                "api": {
                    "runtime": "process",
                    "command": "bun run dev",
                    "port": 3000
                }
            }
        }"#;

        let config = parse_config(json);
        let step = &config.setup.steps[0];
        assert_eq!(step.name, "write-env");
        assert!(step.command.is_none());
        assert_eq!(step.run_on.as_deref(), Some("start"));
        assert_eq!(step.write_files.as_ref().map(Vec::len), Some(1));
        assert_eq!(
            step.write_files
                .as_ref()
                .and_then(|files| files.first())
                .map(|file| file.path.as_str()),
            Some("apps/api/.env.local")
        );
    }

    #[test]
    fn rejects_managed_secrets_blocks() {
        let error = parse_lifecycle_config(
            r#"{
                "setup": {
                    "steps": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 }
                    ]
                },
                "services": {
                    "api": { "runtime": "process", "command": "bun run dev" }
                },
                "secrets": {
                    "API_KEY": { "ref": "org/key", "required": true }
                }
            }"#,
        )
        .expect_err("managed secrets should be rejected");

        assert!(matches!(
            error,
            LifecycleError::ManifestInvalid(message)
            if message.contains("secrets: managed secrets are not supported")
        ));
    }

    #[test]
    fn rejects_secret_template_references() {
        let error = parse_lifecycle_config(
            r#"{
                "setup": {
                    "steps": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 60 }
                    ]
                },
                "services": {
                    "api": {
                        "runtime": "process",
                        "command": "bun run dev",
                        "env_vars": {
                            "API_KEY": "${secrets.API_KEY}"
                        }
                    }
                }
            }"#,
        )
        .expect_err("secret templates should be rejected");

        assert!(matches!(
            error,
            LifecycleError::ManifestInvalid(message)
            if message.contains("services.api.env_vars.API_KEY")
                && message.contains("`${secrets.*}` is not supported")
        ));
    }
}
