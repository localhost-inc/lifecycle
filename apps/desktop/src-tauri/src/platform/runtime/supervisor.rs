use crate::capabilities::workspaces::manifest::{ImageService, ProcessService};
use crate::shared::errors::LifecycleError;
use bollard::container::{Config, CreateContainerOptions, RemoveContainerOptions};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::TryStreamExt;
use std::collections::HashMap;
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
    ) -> Result<(), LifecycleError> {
        let cwd = if let Some(ref svc_cwd) = service.cwd {
            format!("{}/{}", worktree_path, svc_cwd)
        } else {
            worktree_path.to_string()
        };

        let mut cmd = Command::new("sh");
        cmd.args(["-c", &service.command]).current_dir(&cwd);

        if let Some(ref env_vars) = service.env_vars {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
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
    ) -> Result<(), LifecycleError> {
        let docker = self.ensure_docker().await?.clone();

        // Pull image
        let pull_opts = CreateImageOptions {
            from_image: service.image.clone(),
            ..Default::default()
        };

        docker
            .create_image(Some(pull_opts), None, None)
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| LifecycleError::ServiceStartFailed {
                service: service_name.to_string(),
                reason: format!("Image pull failed: {e}"),
            })?;

        let container_name = format!("lifecycle-{}-{}", workspace_id, service_name);

        // Build port bindings
        let mut exposed_ports = HashMap::new();
        let mut port_bindings = HashMap::new();

        if let Some(port) = service.port {
            let container_port = format!("{}/tcp", port);
            exposed_ports.insert(container_port.clone(), HashMap::<(), ()>::new());
            port_bindings.insert(
                container_port,
                Some(vec![bollard::service::PortBinding {
                    host_ip: Some("127.0.0.1".to_string()),
                    host_port: Some(port.to_string()),
                }]),
            );
        }

        // Build env vars
        let env: Vec<String> = service
            .env_vars
            .as_ref()
            .map(|vars| vars.iter().map(|(k, v)| format!("{}={}", k, v)).collect())
            .unwrap_or_default();

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

        let config = Config {
            image: Some(service.image.clone()),
            env: Some(env),
            cmd,
            exposed_ports: Some(exposed_ports),
            host_config: Some(bollard::service::HostConfig {
                port_bindings: Some(port_bindings),
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

fn is_port_conflict_error(message: &str) -> bool {
    let msg = message.to_lowercase();
    msg.contains("address already in use") || msg.contains("port is already allocated")
}
