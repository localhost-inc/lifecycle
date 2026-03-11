use crate::capabilities::workspaces::manifest::{ImageService, ProcessService};
use crate::platform::runtime::templates::expand_reserved_runtime_templates;
use crate::shared::errors::LifecycleError;
use bollard::container::{Config, CreateContainerOptions, RemoveContainerOptions};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::TryStreamExt;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tokio::process::{Child, Command};

pub struct Supervisor {
    processes: HashMap<String, Child>,
    containers: HashMap<String, String>,
    docker: Option<Docker>,
}

impl Supervisor {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
            containers: HashMap::new(),
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
    ) -> Result<(), LifecycleError> {
        let cwd = if let Some(ref svc_cwd) = service.cwd {
            format!("{}/{}", worktree_path, svc_cwd)
        } else {
            worktree_path.to_string()
        };

        let mut cmd = Command::new("sh");
        cmd.args(["-c", &service.command]).current_dir(&cwd);

        let resolved_env =
            resolve_service_env_vars(service_name, service.env_vars.as_ref(), runtime_env)?;
        for (key, value) in &resolved_env {
            cmd.env(key, value);
        }
        for (key, value) in runtime_env {
            cmd.env(key, value);
        }

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

        // Service logs are not yet streamed; avoid pipe backpressure deadlocks.
        cmd.stdout(std::process::Stdio::null());
        cmd.stderr(std::process::Stdio::null());

        let child = cmd
            .spawn()
            .map_err(|e| LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: e.to_string(),
            })?;

        self.processes.insert(service_name.to_string(), child);
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
    ) -> Result<(), LifecycleError> {
        let docker = self.ensure_docker().await?.clone();
        let image_ref = self
            .resolve_image_ref(service_name, service, workspace_id, worktree_path)
            .await?;

        let container_name = format!("lifecycle-{}-{}", workspace_id, service_name);

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
            resolve_service_env_vars(service_name, service.env_vars.as_ref(), runtime_env)?
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

        self.containers
            .insert(service_name.to_string(), container.id);
        Ok(())
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
            let host_path = if let Some(workspace_name) = volume.source.strip_prefix("workspace://")
            {
                let volume_name = workspace_name.trim().trim_matches('/');
                if volume_name.is_empty() {
                    return Err(LifecycleError::ServiceStartFailed {
                        service: service_name.to_string(),
                        reason: "workspace volume source cannot be empty".to_string(),
                    });
                }

                let path = storage_root.join(volume_name);
                std::fs::create_dir_all(&path).map_err(|error| {
                    LifecycleError::ServiceStartFailed {
                        service: service_name.to_string(),
                        reason: format!("failed to create workspace volume: {error}"),
                    }
                })?;
                path
            } else {
                resolve_host_path(service_name, worktree_path, &volume.source)?
            };

            let mut bind = format!("{}:{}", host_path.display(), volume.target);
            if volume.read_only.unwrap_or(false) {
                bind.push_str(":ro");
            }
            binds.push(bind);
        }

        Ok(binds)
    }

    pub async fn stop_all(&mut self) {
        // Stop processes with SIGTERM, then SIGKILL after grace period
        for (_, mut child) in self.processes.drain() {
            #[cfg(unix)]
            {
                if let Some(pid) = child.id() {
                    unsafe {
                        libc::kill(-(pid as i32), libc::SIGTERM);
                    }
                }
            }

            let _ = tokio::time::timeout(std::time::Duration::from_secs(5), child.wait()).await;

            let _ = child.kill().await;
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
        if let Some(child) = self.processes.get_mut(service_name) {
            match child.try_wait() {
                Ok(None) => true,
                _ => false,
            }
        } else {
            false
        }
    }
}

fn resolve_service_env_vars(
    service_name: &str,
    env_vars: Option<&HashMap<String, String>>,
    runtime_env: &HashMap<String, String>,
) -> Result<HashMap<String, String>, LifecycleError> {
    let mut resolved = HashMap::new();

    let Some(env_vars) = env_vars else {
        return Ok(resolved);
    };

    for (key, value) in env_vars {
        let expanded = expand_reserved_runtime_templates(
            value,
            runtime_env,
            &format!("services.{service_name}.env_vars.{key}"),
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
            env_vars: None,
            depends_on: None,
            restart_policy: None,
            startup_timeout_seconds: None,
            health_check: None,
            port: Some(5432),
            share_default: None,
            volumes: Some(volumes),
            resolved_port: None,
        }
    }

    #[test]
    fn resolve_service_env_vars_expands_reserved_runtime_templates() {
        let env_vars = HashMap::from([(
            "VITE_API_ORIGIN".to_string(),
            "http://${LIFECYCLE_SERVICE_API_ADDRESS}".to_string(),
        )]);
        let runtime_env = HashMap::from([(
            "LIFECYCLE_SERVICE_API_ADDRESS".to_string(),
            "127.0.0.1:3001".to_string(),
        )]);

        let resolved = resolve_service_env_vars("web", Some(&env_vars), &runtime_env)
            .expect("service env vars resolve");

        assert_eq!(
            resolved.get("VITE_API_ORIGIN").map(String::as_str),
            Some("http://127.0.0.1:3001")
        );
    }

    #[test]
    fn resolve_service_env_vars_preserves_non_runtime_templates() {
        let env_vars = HashMap::from([("API_KEY".to_string(), "${secrets.API_KEY}".to_string())]);

        let resolved = resolve_service_env_vars("api", Some(&env_vars), &HashMap::new())
            .expect("non-runtime templates remain untouched");

        assert_eq!(
            resolved.get("API_KEY").map(String::as_str),
            Some("${secrets.API_KEY}")
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
            crate::capabilities::workspaces::manifest::ImageVolume {
                source: "workspace://postgres".to_string(),
                target: "/var/lib/postgresql/data".to_string(),
                read_only: None,
            },
            crate::capabilities::workspaces::manifest::ImageVolume {
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
    fn resolve_volume_binds_rejects_empty_workspace_source() {
        let root =
            std::env::temp_dir().join(format!("lifecycle-supervisor-{}", uuid::Uuid::new_v4()));
        let worktree = root.join("worktree");
        let storage_root = root.join("storage");
        std::fs::create_dir_all(&worktree).expect("create worktree");
        std::fs::create_dir_all(&storage_root).expect("create storage root");

        let service = image_service_with_volumes(vec![
            crate::capabilities::workspaces::manifest::ImageVolume {
                source: "workspace://".to_string(),
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
            .expect_err("empty workspace volume should fail");

        match error {
            LifecycleError::ServiceStartFailed { service, reason } => {
                assert_eq!(service, "postgres");
                assert!(reason.contains("workspace volume source cannot be empty"));
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
