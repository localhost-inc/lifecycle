use crate::platform::lifecycle_cli::LifecycleCliState;
use crate::platform::process_manager::{PortBinding, ProcessManagerHandle};
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnManagedProcessRequest {
    id: String,
    /// Explicit binary to run (e.g. `"sh"`). When absent, the lifecycle CLI
    /// binary is resolved automatically and `args` are treated as CLI arguments.
    binary: Option<String>,
    args: Vec<String>,
    cwd: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    log_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpawnManagedProcessResult {
    pid: u32,
}

/// Spawn a tracked process. When `binary` is provided, it is used directly.
/// Otherwise the lifecycle CLI binary is resolved and `args` are CLI arguments.
#[tauri::command]
pub async fn spawn_managed_process(
    process_manager: State<'_, ProcessManagerHandle>,
    lifecycle_cli: State<'_, LifecycleCliState>,
    app: AppHandle,
    request: SpawnManagedProcessRequest,
) -> Result<SpawnManagedProcessResult, LifecycleError> {
    let binary = match request.binary {
        Some(ref bin) => bin.as_str(),
        None => lifecycle_cli
            .binary_path()
            .ok_or_else(|| {
                LifecycleError::AttachFailed("Lifecycle CLI is unavailable.".to_string())
            })?,
    };

    let mut manager = process_manager.0.lock().await;
    let pid = manager.spawn(
        &app,
        &request.id,
        binary,
        &request.args,
        request.cwd.as_deref(),
        &request.env,
        &request.log_dir,
    )?;

    Ok(SpawnManagedProcessResult { pid })
}

/// Kill a tracked process by ID.
#[tauri::command]
pub async fn kill_managed_process(
    process_manager: State<'_, ProcessManagerHandle>,
    id: String,
) -> Result<bool, LifecycleError> {
    let mut manager = process_manager.0.lock().await;
    Ok(manager.kill(&id))
}

/// Send SIGTERM to a PID not tracked by the process manager.
/// Used for cleaning up stale processes from previous app sessions.
#[tauri::command]
pub fn kill_process_by_pid(pid: u32) -> bool {
    crate::platform::process_manager::kill_by_pid(pid)
}

// ---------------------------------------------------------------------------
// Docker container commands
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartManagedContainerRequest {
    id: String,
    image: String,
    container_name: String,
    #[serde(default)]
    env: Vec<String>,
    cmd: Option<Vec<String>>,
    #[serde(default)]
    port_bindings: Vec<PortBinding>,
    #[serde(default)]
    binds: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartManagedContainerResult {
    container_id: String,
}

/// Create and start a Docker container. Streams logs as `process:event`.
#[tauri::command]
pub async fn start_managed_container(
    process_manager: State<'_, ProcessManagerHandle>,
    app: AppHandle,
    request: StartManagedContainerRequest,
) -> Result<StartManagedContainerResult, LifecycleError> {
    let mut manager = process_manager.0.lock().await;
    let container_id = manager
        .start_container(
            &app,
            &request.id,
            &request.image,
            &request.container_name,
            &request.env,
            request.cmd.as_deref(),
            &request.port_bindings,
            &request.binds,
        )
        .await?;

    Ok(StartManagedContainerResult { container_id })
}

/// Stop and remove a tracked container by ID.
#[tauri::command]
pub async fn stop_managed_container(
    process_manager: State<'_, ProcessManagerHandle>,
    id: String,
) -> Result<bool, LifecycleError> {
    let mut manager = process_manager.0.lock().await;
    Ok(manager.stop_container(&id).await)
}

/// Pull a Docker image.
#[tauri::command]
pub async fn pull_docker_image(
    process_manager: State<'_, ProcessManagerHandle>,
    image: String,
) -> Result<(), LifecycleError> {
    let mut manager = process_manager.0.lock().await;
    manager.pull_image(&image).await
}

/// Build a Docker image from a context directory.
#[tauri::command]
pub async fn build_docker_image(
    process_manager: State<'_, ProcessManagerHandle>,
    tag: String,
    context_path: String,
    dockerfile_path: Option<String>,
) -> Result<(), LifecycleError> {
    let mut manager = process_manager.0.lock().await;
    manager
        .build_image(&tag, &context_path, dockerfile_path.as_deref())
        .await
}

// ---------------------------------------------------------------------------
// Health check commands
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HealthCheckInput {
    #[serde(rename = "tcp")]
    Tcp {
        host: String,
        port: u16,
        timeout_seconds: u64,
    },
    #[serde(rename = "http")]
    Http {
        url: String,
        timeout_seconds: u64,
    },
    #[serde(rename = "container")]
    Container {
        timeout_seconds: u64,
    },
}

impl HealthCheckInput {
    fn to_health_check(&self) -> crate::platform::runtime::health::HealthCheck {
        use crate::platform::runtime::health::{HealthCheck, HealthCheckPort};
        match self {
            Self::Tcp { host, port, timeout_seconds } => HealthCheck::Tcp {
                host: host.clone(),
                port: HealthCheckPort::Number(*port),
                timeout_seconds: *timeout_seconds,
            },
            Self::Http { url, timeout_seconds } => HealthCheck::Http {
                url: url.clone(),
                timeout_seconds: *timeout_seconds,
            },
            Self::Container { timeout_seconds } => HealthCheck::Container {
                timeout_seconds: *timeout_seconds,
            },
        }
    }
}

/// Single-shot health check. Returns whether the target is healthy.
#[tauri::command]
pub async fn check_health(
    input: HealthCheckInput,
    container_ref: Option<String>,
) -> Result<bool, LifecycleError> {
    let health_check = input.to_health_check();
    Ok(crate::platform::runtime::health::check_health(
        &health_check,
        container_ref.as_deref(),
    )
    .await)
}

/// Poll health until ready or timeout.
#[tauri::command]
pub async fn wait_for_health(
    input: HealthCheckInput,
    startup_timeout_seconds: u64,
    container_ref: Option<String>,
) -> Result<(), LifecycleError> {
    let health_check = input.to_health_check();
    crate::platform::runtime::health::wait_for_health(
        &health_check,
        startup_timeout_seconds,
        container_ref.as_deref(),
    )
    .await
}

// ---------------------------------------------------------------------------
// Shell step execution
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunShellStepRequest {
    process_id: String,
    root_path: String,
    name: String,
    command: Option<String>,
    runtime_env: HashMap<String, String>,
    write_files: Option<Vec<ShellStepWriteFile>>,
    timeout_seconds: u64,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShellStepWriteFile {
    path: String,
    content: Option<String>,
    lines: Option<Vec<String>>,
}

/// Run a shell command or write files as a step, streaming output as process events.
#[tauri::command]
pub async fn run_shell_step(
    app: AppHandle,
    request: RunShellStepRequest,
) -> Result<(), LifecycleError> {
    use crate::platform::runtime::prepare;

    let step = prepare::ShellStep {
        name: request.name,
        command: request.command,
        write_files: request.write_files.map(|files| {
            files
                .into_iter()
                .map(|f| prepare::WriteFile {
                    path: f.path,
                    content: f.content,
                    lines: f.lines,
                })
                .collect()
        }),
        timeout_seconds: request.timeout_seconds,
        cwd: request.cwd,
        env: request.env,
    };

    prepare::run_steps(
        &app,
        &request.process_id,
        &request.root_path,
        std::slice::from_ref(&step),
        &request.runtime_env,
        "step",
    )
    .await
}

// ---------------------------------------------------------------------------
// Port assignment
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignPortsRequest {
    seed_id: String,
    names: Vec<String>,
    current_ports: Vec<AssignPortsState>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignPortsState {
    assigned_port: Option<i64>,
    name: String,
    status: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignPortsResult {
    assigned_ports: HashMap<String, i64>,
}

/// Assign available ports using deterministic hashing.
#[tauri::command]
pub fn assign_ports(request: AssignPortsRequest) -> Result<AssignPortsResult, LifecycleError> {
    let states: Vec<_> = request
        .current_ports
        .iter()
        .map(|s| crate::platform::ports::PortState {
            assigned_port: s.assigned_port,
            name: s.name.clone(),
            status: s.status.clone(),
        })
        .collect();

    let assigned_ports =
        crate::platform::ports::assign_ports(&request.seed_id, &request.names, &states)?;

    Ok(AssignPortsResult { assigned_ports })
}
