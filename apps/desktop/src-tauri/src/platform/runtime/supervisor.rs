use crate::capabilities::workspaces::manifest::{
    is_valid_named_volume_source, ImageService, ImageVolume, ProcessService,
};
use crate::platform::runtime::templates::expand_reserved_runtime_templates;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use bollard::container::{Config, CreateContainerOptions, LogsOptions, RemoveContainerOptions};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::{StreamExt, TryStreamExt};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

struct ManagedProcess {
    child: Child,
    log_handles: Vec<JoinHandle<()>>,
    exit_watcher: Option<JoinHandle<()>>,
}

pub struct Supervisor {
    processes: HashMap<String, ManagedProcess>,
    containers: HashMap<String, String>,
    container_log_handles: HashMap<String, JoinHandle<()>>,
    docker: Option<Docker>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
            containers: HashMap::new(),
            container_log_handles: HashMap::new(),
            docker: None,
        }
    }

    async fn ensure_docker(&mut self) -> Result<&Docker, LifecycleError> {
        if self.docker.is_none() {
            let docker = Docker::connect_with_local_defaults()
                .map_err(|e| LifecycleError::DockerUnavailable(e.to_string()))?;

            docker
                .ping()
                .await
                .map_err(|e| LifecycleError::DockerUnavailable(e.to_string()))?;

            self.docker = Some(docker);
        }

        Ok(self.docker.as_ref().unwrap())
    }

    pub async fn start_process(
        &mut self,
        service_name: &str,
        service: &ProcessService,
        worktree_path: &str,
        runtime_env: &HashMap<String, String>,
        app: AppHandle,
        workspace_id: &str,
    ) -> Result<(), LifecycleError> {
        let cwd = if let Some(ref svc_cwd) = service.cwd {
            format!("{}/{}", worktree_path, svc_cwd)
        } else {
            worktree_path.to_string()
        };

        let mut cmd = Command::new("sh");
        cmd.args(["-c", &service.command]).current_dir(&cwd);

        let resolved_env = resolve_service_env(service_name, service.env.as_ref(), runtime_env)?;
        for (key, value) in &resolved_env {
            cmd.env(key, value);
        }
        for (key, value) in runtime_env {
            cmd.env(key, value);
        }

        // Force color output even though stdout/stderr are piped, not a TTY.
        cmd.env("FORCE_COLOR", "1");
        cmd.env("CLICOLOR_FORCE", "1");

        // Create new process group
        #[cfg(unix)]
        {
            unsafe {
                cmd.pre_exec(|| {
                    libc::setsid();
                    Ok(())
                });
            }
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd
            .spawn()
            .map_err(|e| LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: e.to_string(),
            })?;

        let mut log_handles = Vec::new();

        if let Some(stdout) = child.stdout.take() {
            let app_clone = app.clone();
            let ws_id = workspace_id.to_string();
            let svc_name = service_name.to_string();
            log_handles.push(tokio::spawn(async move {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    publish_lifecycle_event(
                        &app_clone,
                        LifecycleEvent::ServiceLogLine {
                            workspace_id: ws_id.clone(),
                            service_name: svc_name.clone(),
                            stream: "stdout".to_string(),
                            line,
                        },
                    );
                }
            }));
        }

        if let Some(stderr) = child.stderr.take() {
            let app_clone = app.clone();
            let ws_id = workspace_id.to_string();
            let svc_name = service_name.to_string();
            log_handles.push(tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    publish_lifecycle_event(
                        &app_clone,
                        LifecycleEvent::ServiceLogLine {
                            workspace_id: ws_id.clone(),
                            service_name: svc_name.clone(),
                            stream: "stderr".to_string(),
                            line,
                        },
                    );
                }
            }));
        }

        // Spawn exit watcher: polls the PID to detect unexpected process exits
        let exit_watcher = child.id().map(|pid| {
            let app_clone = app.clone();
            let ws_id = workspace_id.to_string();
            let svc_name = service_name.to_string();
            tokio::spawn(async move {
                loop {
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let alive = unsafe { libc::kill(pid as i32, 0) == 0 };
                    if !alive {
                        publish_lifecycle_event(
                            &app_clone,
                            LifecycleEvent::ServiceProcessExited {
                                workspace_id: ws_id,
                                service_name: svc_name,
                                exit_code: None,
                            },
                        );
                        break;
                    }
                }
            })
        });

        self.processes.insert(
            service_name.to_string(),
            ManagedProcess {
                child,
                log_handles,
                exit_watcher,
            },
        );
        Ok(())
    }

    pub async fn start_container(
        &mut self,
        service_name: &str,
        service: &ImageService,
        workspace_id: &str,
        worktree_path: &str,
        storage_root: &Path,
        runtime_env: &HashMap<String, String>,
        app: AppHandle,
    ) -> Result<(), LifecycleError> {
        let docker = self.ensure_docker().await?.clone();
        let image_ref = self
            .resolve_image_ref(service_name, service, workspace_id, worktree_path)
            .await?;

        let container_name = format!("lifecycle-{}-{}", workspace_id, service_name);
        self.remove_container_if_exists(&container_name).await;

        // Build port bindings
        let mut exposed_ports = HashMap::new();
        let mut port_bindings = HashMap::new();

        if let Some(container_port) = service.port {
            let host_port = service.resolved_port.unwrap_or(container_port);
            let container_port = format!("{}/tcp", container_port);
            exposed_ports.insert(container_port.clone(), HashMap::<(), ()>::new());
            port_bindings.insert(
                container_port,
                Some(vec![bollard::service::PortBinding {
                    host_ip: Some("127.0.0.1".to_string()),
                    host_port: Some(host_port.to_string()),
                }]),
            );
        }

        // Build env vars
        let env: Vec<String> =
            resolve_service_env(service_name, service.env.as_ref(), runtime_env)?
                .into_iter()
                .map(|(key, value)| format!("{key}={value}"))
                .collect();

        // Build cmd
        let cmd: Option<Vec<String>> = if let Some(ref command) = service.command {
            let mut parts = vec![command.clone()];
            if let Some(ref args) = service.args {
                parts.extend(args.clone());
            }
            Some(parts)
        } else {
            service.args.clone()
        };
        let binds =
            self.resolve_volume_binds(service_name, service, worktree_path, storage_root)?;

        let config = Config {
            image: Some(image_ref),
            env: Some(env),
            cmd,
            exposed_ports: Some(exposed_ports),
            host_config: Some(bollard::service::HostConfig {
                port_bindings: Some(port_bindings),
                binds: (!binds.is_empty()).then_some(binds),
                ..Default::default()
            }),
            ..Default::default()
        };

        let create_opts = CreateContainerOptions {
            name: container_name.clone(),
            ..Default::default()
        };

        let container = docker
            .create_container(Some(create_opts), config)
            .await
            .map_err(|e| {
                if is_port_conflict_error(&e.to_string()) && service.port.is_some() {
                    return LifecycleError::PortConflict {
                        service: service_name.to_string(),
                        port: service.port.unwrap_or_default(),
                    };
                }

                LifecycleError::ServiceStartFailed {
                    service: service_name.to_string(),
                    reason: format!("Container create failed: {e}"),
                }
            })?;

        docker
            .start_container::<String>(&container.id, None)
            .await
            .map_err(|e| {
                let docker = docker.clone();
                let container_id = container.id.clone();
                tokio::spawn(async move {
                    let _ = docker
                        .remove_container(
                            &container_id,
                            Some(RemoveContainerOptions {
                                force: true,
                                ..Default::default()
                            }),
                        )
                        .await;
                });
                if is_port_conflict_error(&e.to_string()) && service.port.is_some() {
                    return LifecycleError::PortConflict {
                        service: service_name.to_string(),
                        port: service.port.unwrap_or_default(),
                    };
                }

                LifecycleError::ServiceStartFailed {
                    service: service_name.to_string(),
                    reason: format!("Container start failed: {e}"),
                }
            })?;

        let container_id = container.id.clone();
        self.containers
            .insert(service_name.to_string(), container_id.clone());

        // Stream container logs
        {
            let docker_for_logs = docker.clone();
            let app_clone = app;
            let ws_id = workspace_id.to_string();
            let svc_name = service_name.to_string();
            let cid = container_id;
            let handle = tokio::spawn(async move {
                let opts = LogsOptions::<String> {
                    follow: true,
                    stdout: true,
                    stderr: true,
                    ..Default::default()
                };
                let mut stream = docker_for_logs.logs(&cid, Some(opts));
                while let Some(result) = stream.next().await {
                    match result {
                        Ok(output) => {
                            let (stream_name, text) = match output {
                                bollard::container::LogOutput::StdOut { message } => {
                                    ("stdout", String::from_utf8_lossy(&message).to_string())
                                }
                                bollard::container::LogOutput::StdErr { message } => {
                                    ("stderr", String::from_utf8_lossy(&message).to_string())
                                }
                                _ => continue,
                            };
                            for line in text.lines() {
                                publish_lifecycle_event(
                                    &app_clone,
                                    LifecycleEvent::ServiceLogLine {
                                        workspace_id: ws_id.clone(),
                                        service_name: svc_name.clone(),
                                        stream: stream_name.to_string(),
                                        line: line.to_string(),
                                    },
                                );
                            }
                        }
                        Err(_) => break,
                    }
                }
            });
            self.container_log_handles
                .insert(service_name.to_string(), handle);
        }

        Ok(())
    }

    async fn remove_container_if_exists(&mut self, container_ref: &str) {
        let Ok(docker) = self.ensure_docker().await.cloned() else {
            return;
        };

        let _ = docker
            .remove_container(
                container_ref,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;
    }

    async fn resolve_image_ref(
        &mut self,
        service_name: &str,
        service: &ImageService,
        workspace_id: &str,
        worktree_path: &str,
    ) -> Result<String, LifecycleError> {
        if let Some(build) = service.build.as_ref() {
            self.ensure_docker().await?;

            let tag = format!(
                "lifecycle-{}-{}",
                sanitize_docker_name(workspace_id),
                sanitize_docker_name(service_name)
            );
            let context_path = resolve_host_path(service_name, worktree_path, &build.context)?;
            let dockerfile_path = build
                .dockerfile
                .as_ref()
                .map(|path| resolve_host_path(service_name, worktree_path, path))
                .transpose()?;

            let mut command = Command::new("docker");
            command.arg("build").arg("--tag").arg(&tag);
            if let Some(dockerfile_path) = dockerfile_path.as_ref() {
                command.arg("--file").arg(dockerfile_path);
            }
            command.arg(&context_path);
            command.stdout(std::process::Stdio::piped());
            command.stderr(std::process::Stdio::piped());

            let output =
                command
                    .output()
                    .await
                    .map_err(|error| LifecycleError::ServiceStartFailed {
                        service: service_name.to_string(),
                        reason: format!("Docker build failed to start: {error}"),
                    })?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let detail = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("docker build exited with {}", output.status)
                };
                return Err(LifecycleError::ServiceStartFailed {
                    service: service_name.to_string(),
                    reason: detail,
                });
            }

            return Ok(tag);
        }

        let Some(image_ref) = service.image.clone() else {
            return Err(LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: "image service requires image or build".to_string(),
            });
        };

        let pull_opts = CreateImageOptions {
            from_image: image_ref.clone(),
            ..Default::default()
        };

        let docker = self.ensure_docker().await?.clone();
        docker
            .create_image(Some(pull_opts), None, None)
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: format!("Image pull failed: {e}"),
            })?;

        Ok(image_ref)
    }

    fn resolve_volume_binds(
        &self,
        service_name: &str,
        service: &ImageService,
        worktree_path: &str,
        storage_root: &Path,
    ) -> Result<Vec<String>, LifecycleError> {
        let mut binds = Vec::new();

        for volume in service.volumes.as_deref().unwrap_or_default() {
            let host_path = match volume {
                ImageVolume::Bind { source, .. } => {
                    resolve_host_path(service_name, worktree_path, source)?
                }
                ImageVolume::Volume { source, .. } => {
                    if !is_valid_named_volume_source(source) {
                        return Err(LifecycleError::ServiceStartFailed {
                            service: service_name.to_string(),
                            reason: "named volume source is invalid".to_string(),
                        });
                    }

                    let path = storage_root.join(source);
                    std::fs::create_dir_all(&path).map_err(|error| {
                        LifecycleError::ServiceStartFailed {
                            service: service_name.to_string(),
                            reason: format!("failed to create named volume: {error}"),
                        }
                    })?;
                    path
                }
            };

            let mut bind = format!("{}:{}", host_path.display(), volume.target());
            if volume.read_only() {
                bind.push_str(":ro");
            }
            binds.push(bind);
        }

        Ok(binds)
    }

    pub async fn stop_all(&mut self) {
        // Stop processes with SIGTERM, then SIGKILL after grace period
        for (_, mut managed) in self.processes.drain() {
            #[cfg(unix)]
            {
                if let Some(pid) = managed.child.id() {
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGTERM);
                    }
                }
            }

            let _ =
                tokio::time::timeout(std::time::Duration::from_secs(5), managed.child.wait()).await;

            let _ = managed.child.kill().await;

            if let Some(watcher) = managed.exit_watcher {
                watcher.abort();
            }
            for handle in managed.log_handles {
                handle.abort();
            }
        }

        // Abort container log handles
        for (_, handle) in self.container_log_handles.drain() {
            handle.abort();
        }

        // Stop Docker containers
        if let Some(ref docker) = self.docker {
            for (_, container_id) in self.containers.drain() {
                let _ = docker.stop_container(&container_id, None).await;

                let _ = docker
                    .remove_container(
                        &container_id,
                        Some(RemoveContainerOptions {
                            force: true,
                            ..Default::default()
                        }),
                    )
                    .await;
            }
        }
    }

    pub fn is_process_running(&mut self, service_name: &str) -> bool {
        if let Some(managed) = self.processes.get_mut(service_name) {
            match managed.child.try_wait() {
                Ok(None) => true,
                _ => false,
            }
        } else {
            false
        }
    }

    pub fn container_ref(&self, service_name: &str) -> Option<String> {
        self.containers.get(service_name).cloned()
    }
}

fn resolve_service_env(
    service_name: &str,
    env: Option<&HashMap<String, String>>,
    runtime_env: &HashMap<String, String>,
) -> Result<HashMap<String, String>, LifecycleError> {
    let mut resolved = HashMap::new();

    let Some(env) = env else {
        return Ok(resolved);
    };

    for (key, value) in env {
        let expanded = expand_reserved_runtime_templates(
            value,
            runtime_env,
            &format!("environment.{service_name}.env.{key}"),
        )?;
        resolved.insert(key.clone(), expanded);
    }

    Ok(resolved)
}

fn is_port_conflict_error(message: &str) -> bool {
    let msg = message.to_lowercase();
    msg.contains("address already in use") || msg.contains("port is already allocated")
}

fn resolve_host_path(
    service_name: &str,
    worktree_path: &str,
    source: &str,
) -> Result<PathBuf, LifecycleError> {
    let source_path = Path::new(source);
    let path = if source_path.is_absolute() {
        source_path.to_path_buf()
    } else {
        Path::new(worktree_path).join(source_path)
    };

    if path.exists() {
        path.canonicalize()
            .map_err(|error| LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: format!("failed to resolve mount path: {error}"),
            })
    } else {
        Err(LifecycleError::ServiceStartFailed {
            service: service_name.to_string(),
            reason: format!("mount source does not exist: {}", path.display()),
        })
    }
}

fn sanitize_docker_name(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();

    sanitized
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn image_service_with_volumes(
        volumes: Vec<crate::capabilities::workspaces::manifest::ImageVolume>,
    ) -> ImageService {
        ImageService {
            image: Some("postgres:16".to_string()),
            build: None,
            command: None,
            args: None,
            env: None,
            depends_on: None,
            startup_timeout_seconds: None,
            health_check: None,
            port: Some(5432),
            volumes: Some(volumes),
            resolved_port: None,
        }
    }

    #[test]
    fn resolve_service_env_expands_reserved_runtime_templates() {
        let env = HashMap::from([(
            "VITE_API_ORIGIN".to_string(),
            "${LIFECYCLE_SERVICE_API_URL}".to_string(),
        )]);
        let runtime_env = HashMap::from([(
            "LIFECYCLE_SERVICE_API_URL".to_string(),
            "http://api.frost-beacon-57f59253.lifecycle.localhost:52300".to_string(),
        )]);

        let resolved =
            resolve_service_env("web", Some(&env), &runtime_env).expect("service env resolves");

        assert_eq!(
            resolved.get("VITE_API_ORIGIN").map(String::as_str),
            Some("http://api.frost-beacon-57f59253.lifecycle.localhost:52300")
        );
    }

    #[test]
    fn resolve_service_env_preserves_non_runtime_templates() {
        let env = HashMap::from([("API_KEY".to_string(), "${EXTERNAL_API_KEY}".to_string())]);

        let resolved = resolve_service_env("api", Some(&env), &HashMap::new())
            .expect("non-runtime templates remain untouched");

        assert_eq!(
            resolved.get("API_KEY").map(String::as_str),
            Some("${EXTERNAL_API_KEY}")
        );
    }

    #[test]
    fn resolve_volume_binds_supports_workspace_and_relative_sources() {
        let root =
            std::env::temp_dir().join(format!("lifecycle-supervisor-{}", uuid::Uuid::new_v4()));
        let worktree = root.join("worktree");
        let storage_root = root.join("storage");
        let init_sql = worktree.join("docker/init.sql");
        std::fs::create_dir_all(init_sql.parent().expect("parent exists"))
            .expect("create worktree subdir");
        std::fs::create_dir_all(&storage_root).expect("create storage root");
        std::fs::write(&init_sql, "select 1;").expect("write init.sql");

        let service = image_service_with_volumes(vec![
            crate::capabilities::workspaces::manifest::ImageVolume::Volume {
                source: "postgres".to_string(),
                target: "/var/lib/postgresql/data".to_string(),
                read_only: None,
            },
            crate::capabilities::workspaces::manifest::ImageVolume::Bind {
                source: "docker/init.sql".to_string(),
                target: "/docker-entrypoint-initdb.d/init.sql".to_string(),
                read_only: Some(true),
            },
        ]);

        let binds = Supervisor::new()
            .resolve_volume_binds(
                "postgres",
                &service,
                worktree.to_str().expect("utf8 worktree path"),
                &storage_root,
            )
            .expect("resolve binds");

        assert_eq!(binds.len(), 2);
        assert!(
            binds[0].ends_with(":/var/lib/postgresql/data"),
            "expected workspace bind target, got {}",
            binds[0]
        );
        assert!(
            storage_root.join("postgres").exists(),
            "workspace volume directory should be created"
        );
        assert!(
            binds[1].ends_with(":/docker-entrypoint-initdb.d/init.sql:ro"),
            "expected readonly bind target, got {}",
            binds[1]
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn resolve_volume_binds_rejects_invalid_named_volume_sources() {
        let root =
            std::env::temp_dir().join(format!("lifecycle-supervisor-{}", uuid::Uuid::new_v4()));
        let worktree = root.join("worktree");
        let storage_root = root.join("storage");
        std::fs::create_dir_all(&worktree).expect("create worktree");
        std::fs::create_dir_all(&storage_root).expect("create storage root");

        let service = image_service_with_volumes(vec![
            crate::capabilities::workspaces::manifest::ImageVolume::Volume {
                source: "../postgres".to_string(),
                target: "/data".to_string(),
                read_only: None,
            },
        ]);

        let error = Supervisor::new()
            .resolve_volume_binds(
                "postgres",
                &service,
                worktree.to_str().expect("utf8 worktree path"),
                &storage_root,
            )
            .expect_err("invalid named volume should fail");

        match error {
            LifecycleError::ServiceStartFailed { service, reason } => {
                assert_eq!(service, "postgres");
                assert!(reason.contains("named volume source is invalid"));
            }
            other => panic!("unexpected error: {other}"),
        }

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn sanitize_docker_name_collapses_separators() {
        assert_eq!(sanitize_docker_name("Kin Workspace_01"), "kin-workspace-01");
        assert_eq!(sanitize_docker_name("__api__worker__"), "api-worker");
    }
}
