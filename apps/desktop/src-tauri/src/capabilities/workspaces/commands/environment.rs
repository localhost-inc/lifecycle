use crate::platform::db::{open_db, DbPath};
use crate::platform::runtime::prepare;
use crate::shared::errors::{LifecycleError, ServiceStatus};
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use super::super::environment::runtime_env::build_runtime_env;
use super::super::manifest::{parse_lifecycle_config, PrepareStep, PrepareWriteFile};
use super::super::shared::{
    emit_service_status, reconcile_workspace_services_db, update_service_status_db,
};

// ---------------------------------------------------------------------------
// prepare_environment_start
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareEnvironmentStartInput {
    workspace_id: String,
    manifest_json: String,
    manifest_fingerprint: String,
    service_names: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrepareEnvironmentStartResult {
    service_names: Vec<String>,
}

#[tauri::command]
pub async fn prepare_environment_start(
    _app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    input: PrepareEnvironmentStartInput,
) -> Result<PrepareEnvironmentStartResult, LifecycleError> {
    let config = parse_lifecycle_config(&input.manifest_json)?;
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&input.workspace_id)
        .await?;

    reconcile_workspace_services_db(
        &db_path.0,
        &input.workspace_id,
        Some(&config),
        Some(&input.manifest_fingerprint),
        false,
    )?;

    super::super::environment::port_assignment::assign_ports_for_start(
        &db_path.0,
        &input.workspace_id,
        &config,
        &input.service_names,
    )?;

    Ok(PrepareEnvironmentStartResult {
        service_names: input.service_names,
    })
}

// ---------------------------------------------------------------------------
// run_environment_step
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunEnvironmentStepInput {
    workspace_id: String,
    name: String,
    command: Option<String>,
    write_files: Option<Vec<StepWriteFile>>,
    timeout_seconds: u64,
    cwd: Option<String>,
    env: Option<std::collections::HashMap<String, String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepWriteFile {
    path: String,
    content: Option<String>,
    lines: Option<Vec<String>>,
}

#[tauri::command]
pub async fn run_environment_step(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    input: RunEnvironmentStepInput,
) -> Result<(), LifecycleError> {
    let worktree_path = load_worktree_path(&db_path.0, &input.workspace_id)?;
    let runtime_env = build_runtime_env(&db_path.0, &input.workspace_id, &worktree_path)?;

    let step = PrepareStep {
        name: input.name,
        command: input.command,
        write_files: input.write_files.map(|files| {
            files
                .into_iter()
                .map(|f| PrepareWriteFile {
                    path: f.path,
                    content: f.content,
                    lines: f.lines,
                })
                .collect()
        }),
        timeout_seconds: input.timeout_seconds,
        cwd: input.cwd,
        env: input.env,
        depends_on: None,
        run_on: None,
    };

    prepare::run_steps(
        &app,
        &input.workspace_id,
        &worktree_path,
        std::slice::from_ref(&step),
        &runtime_env,
        "environment",
        None,
    )
    .await?;

    Ok(())
}

// ---------------------------------------------------------------------------
// start_environment_service
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn start_environment_service(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    service_name: String,
    manifest_json: String,
) -> Result<(), LifecycleError> {
    let config = parse_lifecycle_config(&manifest_json)?;
    let worktree_path = load_worktree_path(&db_path.0, &workspace_id)?;
    let runtime_env = build_runtime_env(&db_path.0, &workspace_id, &worktree_path)?;
    let runtime_config = super::super::environment::port_assignment::config_with_assigned_ports(
        &db_path.0,
        &workspace_id,
        &config,
    )?;

    let service_config = runtime_config
        .declared_services()
        .find(|(name, _)| *name == &service_name)
        .map(|(_, config)| config.clone())
        .ok_or_else(|| LifecycleError::InvalidInput {
            field: "serviceName".to_string(),
            reason: format!("service '{service_name}' not found in manifest"),
        })?;

    // Mark starting.
    update_service_status_db(
        &db_path.0,
        &workspace_id,
        &service_name,
        &ServiceStatus::Starting,
        None,
    )?;
    emit_service_status(&app, &workspace_id, &service_name, "starting", None);

    let controller = workspace_controllers.get_or_create(&workspace_id).await;
    let storage_root =
        super::super::environment::runtime_env::workspace_volume_root(&db_path.0, &workspace_id)?;

    // Start the process or container.
    let start_result = match &service_config {
        crate::capabilities::workspaces::manifest::ServiceConfig::Process(process_svc) => {
            let log_dir = storage_root.join("logs");
            std::fs::create_dir_all(&log_dir).map_err(|e| LifecycleError::ServiceStartFailed {
                service: service_name.clone(),
                reason: format!("failed to create log directory: {e}"),
            })?;
            let supervisor = controller.supervisor();
            let mut managed = supervisor.lock().await;
            managed
                .start_process(
                    &service_name,
                    process_svc,
                    &worktree_path,
                    &runtime_env,
                    app.clone(),
                    &workspace_id,
                    &log_dir,
                )
                .await
        }
        crate::capabilities::workspaces::manifest::ServiceConfig::Image(image_svc) => {
            let supervisor = controller.supervisor();
            let mut managed = supervisor.lock().await;
            managed
                .start_container(
                    &service_name,
                    image_svc,
                    &workspace_id,
                    &worktree_path,
                    &storage_root,
                    &runtime_env,
                    app.clone(),
                )
                .await
        }
    };

    if let Err(error) = start_result {
        update_service_status_db(
            &db_path.0,
            &workspace_id,
            &service_name,
            &ServiceStatus::Failed,
            Some("service_start_failed"),
        )?;
        emit_service_status(
            &app,
            &workspace_id,
            &service_name,
            "failed",
            Some("service_start_failed"),
        );
        return Err(error);
    }

    // Persist PID for process services.
    if matches!(
        service_config,
        crate::capabilities::workspaces::manifest::ServiceConfig::Process(_)
    ) {
        let supervisor = controller.supervisor();
        let managed = supervisor.lock().await;
        if let Some(pid) = managed.get_process_pid(&service_name) {
            let _ = crate::platform::db::persist_service_pid(
                &db_path.0,
                &workspace_id,
                &service_name,
                pid as i64,
            );
        }
    }

    // Health check.
    if let Some(health_check) = service_config.health_check() {
        let resolved_health_check =
            crate::platform::runtime::health::resolve_health_check_templates(
                health_check,
                &runtime_env,
                &format!("environment.{service_name}.health_check"),
            )?;
        let timeout_secs = service_config.startup_timeout_seconds();
        let container_ref = match &service_config {
            crate::capabilities::workspaces::manifest::ServiceConfig::Image(_) => {
                let supervisor = controller.supervisor();
                let managed = supervisor.lock().await;
                managed.container_ref(&service_name)
            }
            _ => None,
        };
        match crate::platform::runtime::health::wait_for_health(
            &resolved_health_check,
            timeout_secs,
            container_ref.as_deref(),
        )
        .await
        {
            Ok(()) => {}
            Err(_) => {
                update_service_status_db(
                    &db_path.0,
                    &workspace_id,
                    &service_name,
                    &ServiceStatus::Failed,
                    Some("service_port_unreachable"),
                )?;
                emit_service_status(
                    &app,
                    &workspace_id,
                    &service_name,
                    "failed",
                    Some("service_port_unreachable"),
                );
                return Err(LifecycleError::ServiceHealthcheckFailed {
                    service: service_name,
                });
            }
        }
    } else if matches!(
        service_config,
        crate::capabilities::workspaces::manifest::ServiceConfig::Process(_)
    ) {
        // No health check — wait briefly and verify process is still alive.
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        let is_running = {
            let supervisor = controller.supervisor();
            let mut managed = supervisor.lock().await;
            managed.is_process_running(&service_name)
        };
        if !is_running {
            update_service_status_db(
                &db_path.0,
                &workspace_id,
                &service_name,
                &ServiceStatus::Failed,
                Some("service_process_exited"),
            )?;
            emit_service_status(
                &app,
                &workspace_id,
                &service_name,
                "failed",
                Some("service_process_exited"),
            );
            return Err(LifecycleError::ServiceStartFailed {
                service: service_name,
                reason: "process exited before signaling ready".to_string(),
            });
        }
    }

    // Mark ready.
    update_service_status_db(
        &db_path.0,
        &workspace_id,
        &service_name,
        &ServiceStatus::Ready,
        None,
    )?;
    emit_service_status(&app, &workspace_id, &service_name, "ready", None);

    Ok(())
}

// ---------------------------------------------------------------------------
// stop_environment_service
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn stop_environment_service(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    service_name: String,
) -> Result<(), LifecycleError> {
    if let Some(controller) = workspace_controllers.get(&workspace_id).await {
        controller.stop_runtime().await;
    }

    let conn = open_db(&db_path.0)?;
    conn.execute(
        "UPDATE service
         SET status = 'stopped',
             status_reason = NULL,
             assigned_port = NULL,
             pid = NULL,
             updated_at = datetime('now')
         WHERE workspace_id = ?1 AND name = ?2",
        params![workspace_id, service_name],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;

    emit_service_status(&app, &workspace_id, &service_name, "stopped", None);
    Ok(())
}

// ---------------------------------------------------------------------------
// mark_workspace_prepared
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn mark_workspace_prepared(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    let conn = open_db(&db_path.0)?;
    conn.execute(
        "UPDATE workspace SET prepared_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![workspace_id],
    )
    .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// get_workspace_prepared
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_workspace_prepared(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<bool, LifecycleError> {
    let conn = open_db(&db_path.0)?;
    let prepared_at: Option<String> = conn
        .query_row(
            "SELECT prepared_at FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    Ok(prepared_at.is_some())
}

// ---------------------------------------------------------------------------
// get_workspace_ready_services
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_workspace_ready_services(
    db_path: State<'_, DbPath>,
    workspace_id: String,
) -> Result<Vec<String>, LifecycleError> {
    let conn = open_db(&db_path.0)?;
    let mut stmt = conn
        .prepare(
            "SELECT name FROM service WHERE workspace_id = ?1 AND status = 'ready'",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut names = Vec::new();
    for row in rows {
        names.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    Ok(names)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn load_worktree_path(db_path: &str, workspace_id: &str) -> Result<String, LifecycleError> {
    let conn = open_db(db_path)?;
    let path: Option<String> = conn
        .query_row(
            "SELECT worktree_path FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(e.to_string()),
        })?;
    path.ok_or_else(|| {
        LifecycleError::WorkspaceNotFound(format!(
            "workspace '{}' has no worktree path",
            workspace_id
        ))
    })
}
