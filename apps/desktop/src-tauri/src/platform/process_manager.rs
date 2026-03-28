use crate::shared::errors::LifecycleError;
use bollard::container::{
    Config, CreateContainerOptions, LogsOptions, RemoveContainerOptions,
};
use bollard::image::CreateImageOptions;
use bollard::Docker;
use futures_util::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::task::JoinHandle;

pub const PROCESS_EVENT_NAME: &str = "process:event";

#[derive(Debug, Clone, Serialize)]
pub struct ProcessEventEnvelope {
    pub id: String,
    pub occurred_at: String,
    #[serde(flatten)]
    pub event: ProcessEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum ProcessEvent {
    #[serde(rename = "process.log")]
    LogLine {
        process_id: String,
        stream: String,
        line: String,
    },
    #[serde(rename = "process.exit")]
    Exited {
        process_id: String,
        exit_code: Option<i32>,
    },
}

pub fn publish_process_event(app: &AppHandle, event: ProcessEvent) {
    let occurred_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let envelope = ProcessEventEnvelope {
        id: uuid::Uuid::new_v4().to_string(),
        occurred_at,
        event,
    };
    let _ = app.emit(PROCESS_EVENT_NAME, envelope);
}

struct ProcessEntry {
    child: Child,
    log_handles: Vec<JoinHandle<()>>,
    exit_watcher: Option<JoinHandle<()>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortBinding {
    pub container_port: u16,
    pub host_port: u16,
}

pub struct ProcessManager {
    processes: HashMap<String, ProcessEntry>,
    containers: HashMap<String, String>,
    container_log_handles: HashMap<String, JoinHandle<()>>,
    docker: Option<Docker>,
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            processes: HashMap::new(),
            containers: HashMap::new(),
            container_log_handles: HashMap::new(),
            docker: None,
        }
    }

    fn ensure_docker(&mut self) -> Result<&Docker, LifecycleError> {
        if self.docker.is_none() {
            let docker = Docker::connect_with_local_defaults()
                .map_err(|e| LifecycleError::DockerUnavailable(e.to_string()))?;
            self.docker = Some(docker);
        }
        Ok(self.docker.as_ref().unwrap())
    }

    /// Spawn a tracked process. If a process with the same `id` is already
    /// tracked, it is killed first. Returns the new process PID.
    pub fn spawn(
        &mut self,
        app: &AppHandle,
        id: &str,
        binary: &str,
        args: &[String],
        cwd: Option<&str>,
        env: &HashMap<String, String>,
        log_dir: &str,
    ) -> Result<u32, LifecycleError> {
        if self.processes.contains_key(id) {
            self.kill(id);
        }

        let log_dir = Path::new(log_dir);
        fs::create_dir_all(log_dir)
            .map_err(|e| LifecycleError::Io(format!("failed to create log dir: {e}")))?;

        let stdout_path = log_dir.join(format!("{id}.stdout.log"));
        let stderr_path = log_dir.join(format!("{id}.stderr.log"));

        // Truncate log files so each spawn starts fresh.
        let stdout_file = fs::File::create(&stdout_path)
            .map_err(|e| LifecycleError::Io(format!("failed to create stdout log: {e}")))?;
        let stderr_file = fs::File::create(&stderr_path)
            .map_err(|e| LifecycleError::Io(format!("failed to create stderr log: {e}")))?;

        let mut command = Command::new(binary);
        command
            .args(args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::from(stdout_file))
            .stderr(std::process::Stdio::from(stderr_file));

        if let Some(cwd) = cwd {
            command.current_dir(cwd);
        }

        for (key, value) in env {
            command.env(key, value);
        }

        #[cfg(unix)]
        unsafe {
            command.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }

        let child = command.spawn().map_err(|e| {
            LifecycleError::AttachFailed(format!("failed to spawn process '{id}': {e}"))
        })?;

        let pid = child.id().unwrap_or(0);

        let log_handles = vec![
            spawn_log_tailer(stdout_path, app.clone(), id, "stdout"),
            spawn_log_tailer(stderr_path, app.clone(), id, "stderr"),
        ];

        let exit_watcher = child
            .id()
            .map(|pid| spawn_exit_watcher(app.clone(), id, pid));

        self.processes.insert(
            id.to_string(),
            ProcessEntry {
                child,
                log_handles,
                exit_watcher,
            },
        );

        Ok(pid)
    }

    /// Whether any processes or containers are tracked.
    pub fn has_tracked(&self) -> bool {
        !self.processes.is_empty() || !self.containers.is_empty()
    }

    /// Iterate over all tracked process IDs.
    #[allow(dead_code)]
    pub fn tracked_ids(&self) -> impl Iterator<Item = &String> {
        self.processes.keys()
    }

    /// Check if a tracked process is still running.
    #[allow(dead_code)]
    pub fn is_running(&mut self, id: &str) -> bool {
        self.processes
            .get_mut(id)
            .is_some_and(|entry| matches!(entry.child.try_wait(), Ok(None)))
    }

    /// Send SIGTERM to a tracked process and remove it from tracking.
    pub fn kill(&mut self, id: &str) -> bool {
        let Some(entry) = self.processes.remove(id) else {
            return false;
        };
        teardown_entry(entry);
        true
    }

    /// Stop all tracked processes (SIGTERM → grace period → SIGKILL)
    /// and all tracked Docker containers.
    pub async fn stop_all(&mut self) {
        for (_, mut entry) in self.processes.drain() {
            if let Some(watcher) = entry.exit_watcher.take() {
                watcher.abort();
            }
            for handle in entry.log_handles.drain(..) {
                handle.abort();
            }

            #[cfg(unix)]
            if let Some(pid) = entry.child.id() {
                unsafe {
                    libc::kill(-(pid as i32), libc::SIGTERM);
                }
            }

            let _ = tokio::time::timeout(
                std::time::Duration::from_secs(3),
                entry.child.wait(),
            )
            .await;

            let _ = entry.child.kill().await;
        }

        for (_, handle) in self.container_log_handles.drain() {
            handle.abort();
        }

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

    /// Create and start a Docker container. Streams container logs as
    /// `ProcessEvent::LogLine`. Returns the Docker container ID.
    pub async fn start_container(
        &mut self,
        app: &AppHandle,
        id: &str,
        image: &str,
        container_name: &str,
        env: &[String],
        cmd: Option<&[String]>,
        port_bindings: &[PortBinding],
        binds: &[String],
    ) -> Result<String, LifecycleError> {
        let docker = self.ensure_docker()?.clone();

        // Ping to verify Docker is reachable.
        docker
            .ping()
            .await
            .map_err(|e| LifecycleError::DockerUnavailable(e.to_string()))?;

        // Remove existing container with this name if present.
        let _ = docker
            .remove_container(
                container_name,
                Some(RemoveContainerOptions {
                    force: true,
                    ..Default::default()
                }),
            )
            .await;

        let mut exposed_ports = HashMap::new();
        let mut bollard_port_bindings = HashMap::new();
        for binding in port_bindings {
            let key = format!("{}/tcp", binding.container_port);
            exposed_ports.insert(key.clone(), HashMap::<(), ()>::new());
            bollard_port_bindings.insert(
                key,
                Some(vec![bollard::service::PortBinding {
                    host_ip: Some("127.0.0.1".to_string()),
                    host_port: Some(binding.host_port.to_string()),
                }]),
            );
        }

        let config = Config {
            image: Some(image.to_string()),
            env: Some(env.to_vec()),
            cmd: cmd.map(|c| c.to_vec()),
            exposed_ports: Some(exposed_ports),
            host_config: Some(bollard::service::HostConfig {
                port_bindings: Some(bollard_port_bindings),
                binds: (!binds.is_empty()).then(|| binds.to_vec()),
                ..Default::default()
            }),
            ..Default::default()
        };

        let container = docker
            .create_container(
                Some(CreateContainerOptions {
                    name: container_name.to_string(),
                    ..Default::default()
                }),
                config,
            )
            .await
            .map_err(|e| LifecycleError::ProcessStartFailed {
                name: id.to_string(),
                reason: format!("container create failed: {e}"),
            })?;

        docker
            .start_container::<String>(&container.id, None)
            .await
            .map_err(|e| {
                let docker = docker.clone();
                let cid = container.id.clone();
                tokio::spawn(async move {
                    let _ = docker
                        .remove_container(
                            &cid,
                            Some(RemoveContainerOptions {
                                force: true,
                                ..Default::default()
                            }),
                        )
                        .await;
                });
                LifecycleError::ProcessStartFailed {
                    name: id.to_string(),
                    reason: format!("container start failed: {e}"),
                }
            })?;

        let container_id = container.id.clone();
        self.containers
            .insert(id.to_string(), container_id.clone());

        // Stream container logs as ProcessEvent::LogLine.
        let log_handle = spawn_container_log_tailer(
            docker,
            container_id.clone(),
            app.clone(),
            id,
        );
        self.container_log_handles
            .insert(id.to_string(), log_handle);

        Ok(container_id)
    }

    /// Stop and remove a tracked container.
    pub async fn stop_container(&mut self, id: &str) -> bool {
        if let Some(handle) = self.container_log_handles.remove(id) {
            handle.abort();
        }

        let Some(container_id) = self.containers.remove(id) else {
            return false;
        };

        let Some(ref docker) = self.docker else {
            return false;
        };

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

        true
    }

    /// Get the Docker container ID for a tracked container.
    #[allow(dead_code)]
    pub fn container_id(&self, id: &str) -> Option<&str> {
        self.containers.get(id).map(String::as_str)
    }

    /// Pull a Docker image.
    pub async fn pull_image(&mut self, image: &str) -> Result<(), LifecycleError> {
        let docker = self.ensure_docker()?.clone();
        docker
            .ping()
            .await
            .map_err(|e| LifecycleError::DockerUnavailable(e.to_string()))?;

        docker
            .create_image(
                Some(CreateImageOptions {
                    from_image: image.to_string(),
                    ..Default::default()
                }),
                None,
                None,
            )
            .try_collect::<Vec<_>>()
            .await
            .map_err(|e| LifecycleError::ProcessStartFailed {
                name: image.to_string(),
                reason: format!("image pull failed: {e}"),
            })?;

        Ok(())
    }

    /// Build a Docker image from a context directory.
    pub async fn build_image(
        &mut self,
        tag: &str,
        context_path: &str,
        dockerfile_path: Option<&str>,
    ) -> Result<(), LifecycleError> {
        self.ensure_docker()?;

        let mut command = tokio::process::Command::new("docker");
        command.arg("build").arg("--tag").arg(tag);
        if let Some(dockerfile) = dockerfile_path {
            command.arg("--file").arg(dockerfile);
        }
        command.arg(context_path);
        command.stdout(std::process::Stdio::piped());
        command.stderr(std::process::Stdio::piped());

        let output = command.output().await.map_err(|e| {
            LifecycleError::ProcessStartFailed {
                name: tag.to_string(),
                reason: format!("docker build failed to start: {e}"),
            }
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
            return Err(LifecycleError::ProcessStartFailed {
                name: tag.to_string(),
                reason: detail,
            });
        }

        Ok(())
    }
}

/// Send SIGTERM to a PID that is not tracked by the process manager.
/// Useful for cleaning up stale processes from previous app sessions.
pub fn kill_by_pid(pid: u32) -> bool {
    #[cfg(unix)]
    {
        unsafe { libc::kill(pid as i32, libc::SIGTERM) == 0 }
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        false
    }
}

fn teardown_entry(entry: ProcessEntry) {
    for handle in &entry.log_handles {
        handle.abort();
    }
    if let Some(watcher) = &entry.exit_watcher {
        watcher.abort();
    }

    #[cfg(unix)]
    if let Some(pid) = entry.child.id() {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }
}

fn spawn_log_tailer(
    log_path: std::path::PathBuf,
    app: AppHandle,
    process_id: &str,
    stream: &str,
) -> JoinHandle<()> {
    let process_id = process_id.to_string();
    let stream_name = stream.to_string();
    tokio::spawn(async move {
        let file = loop {
            match tokio::fs::File::open(&log_path).await {
                Ok(f) => break f,
                Err(_) => tokio::time::sleep(std::time::Duration::from_millis(50)).await,
            }
        };
        let mut reader = BufReader::new(file);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line).await {
                Ok(0) => {
                    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
                }
                Ok(_) => {
                    let text = line.trim_end_matches('\n').trim_end_matches('\r');
                    if !text.is_empty() {
                        publish_process_event(
                            &app,
                            ProcessEvent::LogLine {
                                process_id: process_id.clone(),
                                stream: stream_name.clone(),
                                line: text.to_string(),
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    })
}

fn spawn_exit_watcher(app: AppHandle, process_id: &str, pid: u32) -> JoinHandle<()> {
    let process_id = process_id.to_string();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
            let alive = unsafe { libc::kill(pid as i32, 0) == 0 };
            if !alive {
                publish_process_event(
                    &app,
                    ProcessEvent::Exited {
                        process_id,
                        exit_code: None,
                    },
                );
                break;
            }
        }
    })
}

fn spawn_container_log_tailer(
    docker: Docker,
    container_id: String,
    app: AppHandle,
    process_id: &str,
) -> JoinHandle<()> {
    let process_id = process_id.to_string();
    tokio::spawn(async move {
        let opts = LogsOptions::<String> {
            follow: true,
            stdout: true,
            stderr: true,
            ..Default::default()
        };
        let mut stream = docker.logs(&container_id, Some(opts));
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
                        publish_process_event(
                            &app,
                            ProcessEvent::LogLine {
                                process_id: process_id.clone(),
                                stream: stream_name.to_string(),
                                line: line.to_string(),
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    })
}

pub struct ProcessManagerHandle(pub tokio::sync::Mutex<ProcessManager>);

impl ProcessManagerHandle {
    pub fn new() -> Self {
        Self(tokio::sync::Mutex::new(ProcessManager::new()))
    }
}
