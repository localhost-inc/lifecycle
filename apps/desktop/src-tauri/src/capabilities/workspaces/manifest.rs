use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[allow(dead_code)]
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct LifecycleConfig {
    pub workspace: WorkspaceConfig,
    pub environment: HashMap<String, EnvironmentNodeConfig>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct WorkspaceConfig {
    #[serde(default)]
    pub prepare: Vec<PrepareStep>,
    pub teardown: Option<Vec<PrepareStep>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PrepareStep {
    pub name: String,
    pub command: Option<String>,
    pub write_files: Option<Vec<PrepareWriteFile>>,
    pub timeout_seconds: u64,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub run_on: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct TaskConfig {
    pub command: Option<String>,
    pub write_files: Option<Vec<PrepareWriteFile>>,
    pub timeout_seconds: u64,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub run_on: Option<String>,
}

impl TaskConfig {
    pub fn depends_on(&self) -> &[String] {
        self.depends_on.as_deref().unwrap_or_default()
    }

    pub fn into_prepare_step(self, name: String) -> PrepareStep {
        PrepareStep {
            name,
            command: self.command,
            write_files: self.write_files,
            timeout_seconds: self.timeout_seconds,
            cwd: self.cwd,
            env: self.env,
            depends_on: self.depends_on,
            run_on: self.run_on,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PrepareWriteFile {
    pub path: String,
    pub content: Option<String>,
    pub lines: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum EnvironmentNodeConfig {
    #[serde(rename = "task")]
    Task(TaskConfig),
    #[serde(rename = "service")]
    Service {
        #[serde(flatten)]
        config: ServiceConfig,
    },
}

impl EnvironmentNodeConfig {
    pub fn service(&self) -> Option<&ServiceConfig> {
        match self {
            Self::Task(_) => None,
            Self::Service { config } => Some(config),
        }
    }

    pub fn service_mut(&mut self) -> Option<&mut ServiceConfig> {
        match self {
            Self::Task(_) => None,
            Self::Service { config } => Some(config),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "runtime")]
pub enum ServiceConfig {
    #[serde(rename = "process")]
    Process(ProcessService),
    #[serde(rename = "image")]
    Image(ImageService),
}

impl ServiceConfig {
    #[allow(dead_code)]
    pub fn env(&self) -> Option<&HashMap<String, String>> {
        match self {
            Self::Process(s) => s.env.as_ref(),
            Self::Image(s) => s.env.as_ref(),
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

    pub fn startup_timeout_seconds(&self) -> u64 {
        match self {
            Self::Process(s) => s.startup_timeout_seconds.unwrap_or(60),
            Self::Image(s) => s.startup_timeout_seconds.unwrap_or(60),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ProcessService {
    pub command: String,
    pub cwd: Option<String>,
    pub env: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub startup_timeout_seconds: Option<u64>,
    pub health_check: Option<HealthCheck>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImageService {
    pub image: Option<String>,
    pub build: Option<ImageBuild>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
    pub depends_on: Option<Vec<String>>,
    pub startup_timeout_seconds: Option<u64>,
    pub health_check: Option<HealthCheck>,
    pub port: Option<u16>,
    pub volumes: Option<Vec<ImageVolume>>,
    #[serde(skip)]
    pub resolved_port: Option<u16>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ImageBuild {
    pub context: String,
    pub dockerfile: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ImageVolume {
    Bind {
        source: String,
        target: String,
        read_only: Option<bool>,
    },
    Volume {
        source: String,
        target: String,
        read_only: Option<bool>,
    },
}

impl ImageVolume {
    pub fn target(&self) -> &str {
        match self {
            Self::Bind { target, .. } | Self::Volume { target, .. } => target,
        }
    }

    pub fn read_only(&self) -> bool {
        match self {
            Self::Bind { read_only, .. } | Self::Volume { read_only, .. } => {
                read_only.unwrap_or(false)
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum HealthCheckPort {
    Number(u16),
    Template(String),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind")]
pub enum HealthCheck {
    #[serde(rename = "tcp")]
    Tcp {
        host: String,
        port: HealthCheckPort,
        timeout_seconds: u64,
    },
    #[serde(rename = "http")]
    Http { url: String, timeout_seconds: u64 },
    #[serde(rename = "container")]
    Container { timeout_seconds: u64 },
}

const UNSUPPORTED_SECRETS_MESSAGE: &str =
    "managed secrets are not supported in local lifecycle.json yet; materialize local env files in workspace prepare instead";
const UNSUPPORTED_SECRET_TEMPLATE_MESSAGE: &str =
    "`${secrets.*}` is not supported in local lifecycle.json; materialize local env files in workspace prepare instead";
const UNSUPPORTED_RESET_MESSAGE: &str =
    "`reset` is not part of the current lifecycle.json contract yet; remove it from the manifest for now";
const UNSUPPORTED_MCPS_MESSAGE: &str =
    "`mcps` is not part of the current lifecycle.json contract yet; remove it from the manifest for now";

pub fn parse_lifecycle_config(json: &str) -> Result<LifecycleConfig, LifecycleError> {
    let value: Value = serde_json::from_str(json)
        .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?;
    validate_manifest_value(&value)?;

    let config: LifecycleConfig = serde_json::from_value(value)
        .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?;
    config.validate()?;
    Ok(config)
}

fn stable_serialize_value(value: &Value) -> Result<String, LifecycleError> {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            serde_json::to_string(value)
                .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))
        }
        Value::Array(values) => {
            let serialized = values
                .iter()
                .map(stable_serialize_value)
                .collect::<Result<Vec<_>, _>>()?;
            Ok(format!("[{}]", serialized.join(",")))
        }
        Value::Object(entries) => {
            let mut sorted_entries = entries.iter().collect::<Vec<_>>();
            sorted_entries.sort_by(|(left, _), (right, _)| left.cmp(right));
            let serialized = sorted_entries
                .into_iter()
                .map(|(key, entry_value)| {
                    Ok(format!(
                        "{}:{}",
                        serde_json::to_string(key)
                            .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?,
                        stable_serialize_value(entry_value)?,
                    ))
                })
                .collect::<Result<Vec<_>, LifecycleError>>()?;
            Ok(format!("{{{}}}", serialized.join(",")))
        }
    }
}

pub fn get_manifest_fingerprint(config: &LifecycleConfig) -> Result<String, LifecycleError> {
    let value = serde_json::to_value(config)
        .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))?;
    stable_serialize_value(&value)
}

pub fn parse_lifecycle_config_with_fingerprint(
    json: &str,
) -> Result<(LifecycleConfig, String), LifecycleError> {
    let config = parse_lifecycle_config(json)?;
    let fingerprint = get_manifest_fingerprint(&config)?;
    Ok((config, fingerprint))
}

impl LifecycleConfig {
    pub fn declared_services(&self) -> impl Iterator<Item = (&String, &ServiceConfig)> + '_ {
        self.environment
            .iter()
            .filter_map(|(name, node)| node.service().map(|config| (name, config)))
    }

    pub fn declared_service_names(&self) -> Vec<String> {
        self.declared_services()
            .map(|(name, _)| name.clone())
            .collect()
    }

    pub fn service_mut(&mut self, name: &str) -> Option<&mut ServiceConfig> {
        self.environment
            .get_mut(name)
            .and_then(EnvironmentNodeConfig::service_mut)
    }

    pub fn validate(&self) -> Result<(), LifecycleError> {
        for (index, step) in self.workspace.prepare.iter().enumerate() {
            validate_step(step, &format!("workspace.prepare.{index}"), false, true)?;
        }

        if let Some(teardown_steps) = self.workspace.teardown.as_ref() {
            for (index, step) in teardown_steps.iter().enumerate() {
                validate_step(step, &format!("workspace.teardown.{index}"), false, false)?;
            }
        }

        for (node_name, node) in &self.environment {
            match node {
                EnvironmentNodeConfig::Task(step) => {
                    validate_task(step, &format!("environment.{node_name}"))?;
                }
                EnvironmentNodeConfig::Service { config } => match config {
                    ServiceConfig::Process(process) => {
                        if matches!(process.health_check, Some(HealthCheck::Container { .. })) {
                            return manifest_invalid(
                                &format!("environment.{node_name}.health_check.kind"),
                                "container health checks are only valid for runtime image services",
                            );
                        }
                    }
                    ServiceConfig::Image(image) => {
                        if image.image.is_none() && image.build.is_none() {
                            return manifest_invalid(
                                &format!("environment.{node_name}.image"),
                                "image services require either image or build",
                            );
                        }
                        if let Some(volumes) = image.volumes.as_ref() {
                            for (index, volume) in volumes.iter().enumerate() {
                                validate_image_volume(
                                    volume,
                                    &format!("environment.{node_name}.volumes.{index}"),
                                )?;
                            }
                        }
                    }
                },
            }
        }

        Ok(())
    }
}

fn validate_step(
    step: &PrepareStep,
    field: &str,
    allow_depends_on: bool,
    allow_run_on: bool,
) -> Result<(), LifecycleError> {
    match (step.command.as_deref(), step.write_files.as_ref()) {
        (Some(_), None) | (None, Some(_)) => {}
        _ => {
            return manifest_invalid(field, "requires exactly one of command or write_files");
        }
    }

    if !allow_depends_on && step.depends_on.is_some() {
        return manifest_invalid(
            &format!("{field}.depends_on"),
            "cannot declare depends_on in this context",
        );
    }

    if let Some(run_on) = step.run_on.as_deref() {
        if !allow_run_on {
            return manifest_invalid(&format!("{field}.run_on"), "cannot declare run_on here");
        }
        if !matches!(run_on, "create" | "start") {
            return manifest_invalid(&format!("{field}.run_on"), "must be one of: create, start");
        }
    }

    if let Some(write_files) = step.write_files.as_ref() {
        if write_files.is_empty() {
            return manifest_invalid(&format!("{field}.write_files"), "must not be empty");
        }

        for (file_index, file) in write_files.iter().enumerate() {
            let file_field = format!("{field}.write_files.{file_index}");
            let has_content = file.content.is_some();
            let has_lines = file.lines.is_some();
            if has_content == has_lines {
                return manifest_invalid(&file_field, "requires exactly one of content or lines");
            }
            if file.lines.as_ref().is_some_and(Vec::is_empty) {
                return manifest_invalid(&format!("{file_field}.lines"), "must not be empty");
            }
        }
    }

    Ok(())
}

fn validate_task(step: &TaskConfig, field: &str) -> Result<(), LifecycleError> {
    match (step.command.as_deref(), step.write_files.as_ref()) {
        (Some(_), None) | (None, Some(_)) => {}
        _ => {
            return manifest_invalid(field, "requires exactly one of command or write_files");
        }
    }

    if let Some(run_on) = step.run_on.as_deref() {
        if !matches!(run_on, "create" | "start") {
            return manifest_invalid(&format!("{field}.run_on"), "must be one of: create, start");
        }
    }

    if let Some(write_files) = step.write_files.as_ref() {
        if write_files.is_empty() {
            return manifest_invalid(&format!("{field}.write_files"), "must not be empty");
        }

        for (file_index, file) in write_files.iter().enumerate() {
            let file_field = format!("{field}.write_files.{file_index}");
            let has_content = file.content.is_some();
            let has_lines = file.lines.is_some();
            if has_content == has_lines {
                return manifest_invalid(&file_field, "requires exactly one of content or lines");
            }
            if file.lines.as_ref().is_some_and(Vec::is_empty) {
                return manifest_invalid(&format!("{file_field}.lines"), "must not be empty");
            }
        }
    }

    Ok(())
}

fn validate_image_volume(volume: &ImageVolume, field: &str) -> Result<(), LifecycleError> {
    if volume.target().trim().is_empty() {
        return manifest_invalid(&format!("{field}.target"), "must not be empty");
    }

    match volume {
        ImageVolume::Bind { source, .. } => {
            if source.trim().is_empty() {
                return manifest_invalid(&format!("{field}.source"), "must not be empty");
            }
        }
        ImageVolume::Volume { source, .. } => {
            if !is_valid_named_volume_source(source) {
                return manifest_invalid(
                    &format!("{field}.source"),
                    "named volumes must start with an alphanumeric character and contain only letters, numbers, dots, underscores, or dashes",
                );
            }
        }
    }

    Ok(())
}

pub(crate) fn is_valid_named_volume_source(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };

    if !first.is_ascii_alphanumeric() {
        return false;
    }

    chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
}

fn validate_manifest_value(value: &Value) -> Result<(), LifecycleError> {
    if let Some(object) = value.as_object() {
        if object.contains_key("secrets") {
            return manifest_invalid("secrets", UNSUPPORTED_SECRETS_MESSAGE);
        }
        if object.contains_key("reset") {
            return manifest_invalid("reset", UNSUPPORTED_RESET_MESSAGE);
        }
        if object.contains_key("mcps") {
            return manifest_invalid("mcps", UNSUPPORTED_MCPS_MESSAGE);
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
                if path.is_empty() && matches!(key.as_str(), "secrets" | "reset" | "mcps") {
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
    fn parse_process_service_and_task_nodes() {
        let json = r#"{
            "workspace": {
                "prepare": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                ],
                "teardown": [
                    { "name": "cleanup", "command": "rm -f .env.local", "timeout_seconds": 10 }
                ]
            },
            "environment": {
                "migrate": {
                    "kind": "task",
                    "command": "bun run db:migrate",
                    "depends_on": ["api"],
                    "timeout_seconds": 60,
                    "run_on": "start"
                },
                "api": {
                    "kind": "service",
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
        assert_eq!(config.workspace.prepare.len(), 1);
        assert_eq!(config.workspace.teardown.as_ref().map(Vec::len), Some(1));
        assert!(matches!(
            config.environment.get("api").unwrap(),
            EnvironmentNodeConfig::Service { .. }
        ));
        assert!(matches!(
            config.environment.get("migrate").unwrap(),
            EnvironmentNodeConfig::Task(_)
        ));
    }

    #[test]
    fn parse_image_service() {
        let json = r#"{
            "workspace": {
                "prepare": [
                    { "name": "init", "command": "echo hello", "timeout_seconds": 10 }
                ]
            },
            "environment": {
                "db": {
                    "kind": "service",
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
            config.environment.get("db").unwrap(),
            EnvironmentNodeConfig::Service { .. }
        ));
    }

    #[test]
    fn parse_tcp_health_check_templates() {
        let json = r#"{
            "workspace": {
                "prepare": [
                    { "name": "init", "command": "echo hello", "timeout_seconds": 10 }
                ]
            },
            "environment": {
                "redis": {
                    "kind": "service",
                    "runtime": "image",
                    "image": "redis:7-alpine",
                    "health_check": {
                        "kind": "tcp",
                        "host": "${LIFECYCLE_SERVICE_REDIS_HOST}",
                        "port": "${LIFECYCLE_SERVICE_REDIS_PORT}",
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config = parse_config(json);
        let EnvironmentNodeConfig::Service { config: service } =
            config.environment.get("redis").expect("redis exists")
        else {
            panic!("expected service node");
        };
        let ServiceConfig::Image(service) = service else {
            panic!("expected image service");
        };

        assert!(matches!(
            service.health_check,
            Some(HealthCheck::Tcp {
                host: _,
                port: HealthCheckPort::Template(_),
                timeout_seconds: 30,
            })
        ));
    }

    #[test]
    fn parse_container_health_check() {
        let json = r#"{
            "workspace": {
                "prepare": [
                    { "name": "init", "command": "echo hello", "timeout_seconds": 10 }
                ]
            },
            "environment": {
                "db": {
                    "kind": "service",
                    "runtime": "image",
                    "image": "postgres:16",
                    "port": 5432,
                    "health_check": {
                        "kind": "container",
                        "timeout_seconds": 30
                    }
                }
            }
        }"#;

        let config = parse_config(json);
        let EnvironmentNodeConfig::Service { config: service } =
            config.environment.get("db").expect("db exists")
        else {
            panic!("expected service node");
        };
        let ServiceConfig::Image(service) = service else {
            panic!("expected image service");
        };

        assert!(matches!(
            service.health_check,
            Some(HealthCheck::Container { .. })
        ));
    }

    #[test]
    fn rejects_container_health_check_on_process_service() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "init", "command": "echo hello", "timeout_seconds": 10 }
                    ]
                },
                "environment": {
                    "api": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "bun run dev",
                        "health_check": {
                            "kind": "container",
                            "timeout_seconds": 30
                        }
                    }
                }
            }"#,
        )
        .expect_err("container health should be rejected for process services");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("environment.api.health_check.kind"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn parse_image_service_with_build_and_volumes() {
        let json = r#"{
            "workspace": {
                "prepare": [
                    { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                ]
            },
            "environment": {
                "postgres": {
                    "kind": "service",
                    "runtime": "image",
                    "build": {
                        "context": "docker",
                        "dockerfile": "docker/Dockerfile.pg.dev"
                    },
                    "volumes": [
                        { "type": "volume", "source": "postgres", "target": "/var/lib/postgresql/data" },
                        { "type": "bind", "source": "docker/init.sql", "target": "/docker-entrypoint-initdb.d/init.sql", "read_only": true }
                    ]
                }
            }
        }"#;

        let config = parse_config(json);
        let EnvironmentNodeConfig::Service { config: service } =
            config.environment.get("postgres").expect("postgres exists")
        else {
            panic!("expected service node");
        };
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
    fn rejects_invalid_named_volume_sources() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 120 }
                    ]
                },
                "environment": {
                    "postgres": {
                        "kind": "service",
                        "runtime": "image",
                        "image": "postgres:16",
                        "volumes": [
                            { "type": "volume", "source": "../postgres", "target": "/var/lib/postgresql/data" }
                        ]
                    }
                }
            }"#,
        )
        .expect_err("invalid named volume should be rejected");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("environment.postgres.volumes.0.source"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn parse_workspace_step_with_write_files() {
        let json = r#"{
            "workspace": {
                "prepare": [
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
            "environment": {
                "api": {
                    "kind": "service",
                    "runtime": "process",
                    "command": "bun run dev",
                    "port": 3000
                }
            }
        }"#;

        let config = parse_config(json);
        let step = &config.workspace.prepare[0];
        assert_eq!(step.name, "write-env");
        assert!(step.command.is_none());
        assert_eq!(step.run_on.as_deref(), Some("start"));
        assert_eq!(step.write_files.as_ref().map(Vec::len), Some(1));
    }

    #[test]
    fn rejects_workspace_prepare_depends_on() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        {
                            "name": "install",
                            "command": "bun install",
                            "timeout_seconds": 10,
                            "depends_on": ["postgres"]
                        }
                    ]
                },
                "environment": {
                    "postgres": { "kind": "service", "runtime": "image", "image": "postgres:16" }
                }
            }"#,
        )
        .expect_err("depends_on should be rejected");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("workspace.prepare.0.depends_on"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn rejects_managed_secrets_blocks() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 10 }
                    ]
                },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "run" }
                },
                "secrets": { "KEY": { "ref": "org/key", "required": true } }
            }"#,
        )
        .expect_err("managed secrets should fail");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("managed secrets are not supported"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn rejects_secret_templates_in_env() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 10 }
                    ]
                },
                "environment": {
                    "api": {
                        "kind": "service",
                        "runtime": "process",
                        "command": "run",
                        "env": { "API_KEY": "${secrets.API_KEY}" }
                    }
                }
            }"#,
        )
        .expect_err("secret template should fail");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("environment.api.env.API_KEY"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn rejects_top_level_reset_blocks() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 10 }
                    ]
                },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "run" }
                },
                "reset": { "strategy": "reseed", "command": "bun run seed", "timeout_seconds": 60 }
            }"#,
        )
        .expect_err("reset config should fail");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("reset"));
                assert!(message.contains("not part of the current lifecycle.json contract"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }

    #[test]
    fn rejects_top_level_mcps_blocks() {
        let error = parse_lifecycle_config(
            r#"{
                "workspace": {
                    "prepare": [
                        { "name": "install", "command": "bun install", "timeout_seconds": 10 }
                    ]
                },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "run" }
                },
                "mcps": {
                    "notion": {
                        "command": "npx",
                        "args": ["-y", "@notionhq/notion-mcp-server"],
                        "transport": "stdio"
                    }
                }
            }"#,
        )
        .expect_err("mcp config should fail");

        match error {
            LifecycleError::ManifestInvalid(message) => {
                assert!(message.contains("mcps"));
                assert!(message.contains("not part of the current lifecycle.json contract"));
            }
            other => panic!("unexpected error: {other}"),
        }
    }
}
