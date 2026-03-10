use crate::capabilities::workspaces::manifest::{LifecycleConfig, ServiceConfig};
use crate::platform::db::{open_db, DbPath};
use crate::platform::runtime::{health, setup, supervisor};
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use crate::{ManagedSupervisor, SupervisorMap};
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{
    emit_service_status, emit_workspace_status, mark_nonfailed_services_stopped,
    mark_services_failed, reconcile_workspace_services_db, service_name_for_start_error,
    service_status_reason_for_start_error, topo_sort_services, transition_workspace_to_starting,
    update_service_status_db, update_workspace_status_db, workspace_failure_reason_for_start_error,
};

fn set_port_env(env_vars: &mut Option<std::collections::HashMap<String, String>>, port: u16) {
    let vars = env_vars.get_or_insert_with(std::collections::HashMap::new);
    vars.insert("PORT".to_string(), port.to_string());
}

fn is_local_health_host(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "0.0.0.0")
}

fn rewrite_health_check_port(
    health_check: &mut Option<crate::capabilities::workspaces::manifest::HealthCheck>,
    previous_port: Option<u16>,
    override_port: u16,
) {
    let Some(health_check) = health_check.as_mut() else {
        return;
    };

    match health_check {
        crate::capabilities::workspaces::manifest::HealthCheck::Tcp { host, port, .. } => {
            if is_local_health_host(host)
                && (previous_port.is_none() || previous_port == Some(*port))
            {
                *port = override_port;
            }
        }
        crate::capabilities::workspaces::manifest::HealthCheck::Http { url, .. } => {
            let Ok(mut parsed) = reqwest::Url::parse(url) else {
                return;
            };
            let Some(host) = parsed.host_str() else {
                return;
            };

            if !is_local_health_host(host) {
                return;
            }

            let current_port = parsed.port_or_known_default();
            if previous_port.is_some() && current_port != previous_port {
                return;
            }

            if parsed.set_port(Some(override_port)).is_ok() {
                *url = parsed.to_string();
            }
        }
    }
}

fn apply_port_override(service: &mut ServiceConfig, override_port: u16) {
    match service {
        ServiceConfig::Process(process) => {
            let previous_port = process.port;
            process.port = Some(override_port);
            set_port_env(&mut process.env_vars, override_port);
            rewrite_health_check_port(&mut process.health_check, previous_port, override_port);
        }
        ServiceConfig::Image(image) => {
            let previous_port = image.port;
            image.port = Some(override_port);
            set_port_env(&mut image.env_vars, override_port);
            rewrite_health_check_port(&mut image.health_check, previous_port, override_port);
        }
    }
}

fn config_with_workspace_overrides(
    db_path: &str,
    workspace_id: &str,
    config: &LifecycleConfig,
) -> Result<LifecycleConfig, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT service_name, port_override FROM workspace_service WHERE workspace_id = ?1",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut next = config.clone();
    for row in rows {
        let (service_name, port_override) =
            row.map_err(|error| LifecycleError::Database(error.to_string()))?;
        let Some(port_override) = port_override else {
            continue;
        };
        let Ok(port_override) = u16::try_from(port_override) else {
            continue;
        };
        let Some(service) = next.services.get_mut(&service_name) else {
            continue;
        };
        apply_port_override(service, port_override);
    }

    Ok(next)
}

fn load_workspace_status(db_path: &str, workspace_id: &str) -> Result<WorkspaceStatus, LifecycleError> {
    let conn = open_db(db_path)?;
    let status = conn
        .query_row(
            "SELECT status FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;

    WorkspaceStatus::from_str(&status)
}

async fn stop_managed_supervisor(supervisor: &ManagedSupervisor) {
    let mut supervisor = supervisor.lock().await;
    supervisor.stop_all().await;
}

async fn abort_start_if_needed(
    db_path: &str,
    workspace_id: &str,
    supervisor: &ManagedSupervisor,
) -> Result<bool, LifecycleError> {
    if load_workspace_status(db_path, workspace_id)? == WorkspaceStatus::Starting {
        return Ok(false);
    }

    stop_managed_supervisor(supervisor).await;
    Ok(true)
}

async fn record_start_failure(
    app: &AppHandle,
    db_path: &str,
    workspace_id: &str,
    supervisor: &ManagedSupervisor,
    failure_reason: WorkspaceFailureReason,
) -> Result<bool, LifecycleError> {
    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
        return Ok(false);
    }

    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Idle, Some(&failure_reason))?;
    emit_workspace_status(app, workspace_id, "idle", Some(failure_reason.as_str()));
    stop_managed_supervisor(supervisor).await;

    let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
    for service_name in stopped_services {
        emit_service_status(app, workspace_id, &service_name, "stopped", None);
    }

    Ok(true)
}

async fn start_services_lifecycle(
    app: &AppHandle,
    db_path: &str,
    supervisor: &ManagedSupervisor,
    workspace_id: &str,
    worktree_path: &str,
    config: &LifecycleConfig,
    manifest_fingerprint: &str,
) -> Result<(), LifecycleError> {
    reconcile_workspace_services_db(
        db_path,
        workspace_id,
        Some(config),
        Some(manifest_fingerprint),
    )?;
    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
        return Ok(());
    }
    let runtime_config = config_with_workspace_overrides(db_path, workspace_id, config)?;

    // Setup runs exactly once per workspace creation.
    let setup_completed = {
        let conn = open_db(db_path)?;
        let setup_completed_at: Option<String> = conn
            .query_row(
                "SELECT setup_completed_at FROM workspace WHERE id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        setup_completed_at.is_some()
    };

    if !setup_completed {
        if let Err(e) = setup::run_setup_steps(
            app,
            workspace_id,
            worktree_path,
            &runtime_config.setup.steps,
        )
        .await
        {
            let recorded = record_start_failure(
                app,
                db_path,
                workspace_id,
                supervisor,
                WorkspaceFailureReason::SetupStepFailed,
            )
            .await?;
            if !recorded {
                return Ok(());
            }
            return Err(e);
        }

        if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
            return Ok(());
        }

        let conn = open_db(db_path)?;
        conn.execute(
            "UPDATE workspace SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![workspace_id],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    // Start services (topologically sorted)
    let sorted_services = match topo_sort_services(&runtime_config.services) {
        Ok(sorted) => sorted,
        Err(error) => {
            let service_names: Vec<String> = runtime_config.services.keys().cloned().collect();
            mark_services_failed(
                db_path,
                workspace_id,
                &service_names,
                "service_dependency_failed",
            )?;

            for service_name in &service_names {
                emit_service_status(
                    app,
                    workspace_id,
                    service_name,
                    "failed",
                    Some("service_dependency_failed"),
                );
            }

            let recorded = record_start_failure(
                app,
                db_path,
                workspace_id,
                supervisor,
                WorkspaceFailureReason::ServiceStartFailed,
            )
            .await?;
            if !recorded {
                return Ok(());
            }

            return Err(error);
        }
    };

    for (name, svc) in &sorted_services {
        if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
            return Ok(());
        }

        update_service_status_db(db_path, workspace_id, name, &ServiceStatus::Starting, None)?;
        emit_service_status(app, workspace_id, name, "starting", None);

        let start_result = match svc {
            ServiceConfig::Process(process_svc) => {
                let mut managed = supervisor.lock().await;
                managed.start_process(name, process_svc, worktree_path).await
            }
            ServiceConfig::Image(image_svc) => {
                let mut managed = supervisor.lock().await;
                managed.start_container(name, image_svc, workspace_id).await
            }
        };

        if let Err(e) = start_result {
            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }

            let failed_service_name = service_name_for_start_error(&e, name);
            let service_status_reason = service_status_reason_for_start_error(&e);
            let workspace_failure_reason = workspace_failure_reason_for_start_error(&e);

            update_service_status_db(
                db_path,
                workspace_id,
                &failed_service_name,
                &ServiceStatus::Failed,
                Some(service_status_reason),
            )?;
            emit_service_status(
                app,
                workspace_id,
                &failed_service_name,
                "failed",
                Some(service_status_reason),
            );

            let recorded = record_start_failure(
                app,
                db_path,
                workspace_id,
                supervisor,
                workspace_failure_reason,
            )
            .await?;
            if !recorded {
                return Ok(());
            }

            return Err(e);
        }

        // No health check → ready immediately
        if svc.health_check().is_none() {
            if matches!(svc, ServiceConfig::Process(_)) {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                    return Ok(());
                }

                let is_running = {
                    let mut managed = supervisor.lock().await;
                    managed.is_process_running(name)
                };

                if !is_running {
                    update_service_status_db(
                        db_path,
                        workspace_id,
                        name,
                        &ServiceStatus::Failed,
                        Some("service_process_exited"),
                    )?;
                    emit_service_status(
                        app,
                        workspace_id,
                        name,
                        "failed",
                        Some("service_process_exited"),
                    );
                    let recorded = record_start_failure(
                        app,
                        db_path,
                        workspace_id,
                        supervisor,
                        WorkspaceFailureReason::ServiceStartFailed,
                    )
                    .await?;
                    if !recorded {
                        return Ok(());
                    }

                    return Err(LifecycleError::ServiceStartFailed {
                        service: (*name).to_string(),
                        reason: "process exited before signaling ready".to_string(),
                    });
                }
            }

            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }
            update_service_status_db(db_path, workspace_id, name, &ServiceStatus::Ready, None)?;
            emit_service_status(app, workspace_id, name, "ready", None);
        }
    }

    // Run health checks
    for (name, svc) in &sorted_services {
        if let Some(hc) = svc.health_check() {
            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }
            let timeout_secs = svc.startup_timeout_seconds();
            match health::wait_for_health(hc, timeout_secs).await {
                Ok(()) => {
                    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                        return Ok(());
                    }
                    update_service_status_db(
                        db_path,
                        workspace_id,
                        name,
                        &ServiceStatus::Ready,
                        None,
                    )?;
                    emit_service_status(app, workspace_id, name, "ready", None);
                }
                Err(_) => {
                    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                        return Ok(());
                    }
                    update_service_status_db(
                        db_path,
                        workspace_id,
                        name,
                        &ServiceStatus::Failed,
                        Some("service_port_unreachable"),
                    )?;
                    emit_service_status(
                        app,
                        workspace_id,
                        name,
                        "failed",
                        Some("service_port_unreachable"),
                    );
                    let recorded = record_start_failure(
                        app,
                        db_path,
                        workspace_id,
                        supervisor,
                        WorkspaceFailureReason::ServiceHealthcheckFailed,
                    )
                    .await?;
                    if !recorded {
                        return Ok(());
                    }

                    return Err(LifecycleError::ServiceHealthcheckFailed {
                        service: name.to_string(),
                    });
                }
            }
        }
    }

    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
        return Ok(());
    }

    // All healthy -> active.
    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Active, None)?;
    emit_workspace_status(app, workspace_id, "active", None);

    Ok(())
}

pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
    manifest_json: String,
    manifest_fingerprint: String,
) -> Result<(), LifecycleError> {
    let config: LifecycleConfig = serde_json::from_str(&manifest_json)
        .map_err(|e| LifecycleError::ManifestInvalid(e.to_string()))?;

    // Read workspace row — validate worktree_path is set.
    let worktree_path = {
        let conn = open_db(&db_path.0)?;
        let path: Option<String> = conn
            .query_row(
                "SELECT worktree_path FROM workspace WHERE id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        path.ok_or_else(|| {
            LifecycleError::WorkspaceNotFound(format!(
                "workspace '{}' has no worktree path",
                workspace_id
            ))
        })?
    };

    // Acquire workspace lifecycle lock synchronously to prevent concurrent starts.
    transition_workspace_to_starting(&db_path.0, &workspace_id)?;
    emit_workspace_status(&app, &workspace_id, "starting", None);

    let db = db_path.0.clone();
    let supervisor = std::sync::Arc::new(tokio::sync::Mutex::new(supervisor::Supervisor::new()));
    {
        let mut supervisors = supervisors.lock().await;
        supervisors.insert(workspace_id.clone(), supervisor.clone());
    }
    let ws_id = workspace_id.clone();

    tokio::spawn(async move {
        if let Err(e) = start_services_lifecycle(
            &app,
            &db,
            &supervisor,
            &ws_id,
            &worktree_path,
            &config,
            &manifest_fingerprint,
        )
        .await
        {
            tracing::error!("start_services failed for {}: {e}", ws_id);
        }
    });

    Ok(())
}

pub async fn sync_workspace_manifest(
    db_path: &str,
    workspace_id: String,
    manifest_json: Option<String>,
    manifest_fingerprint: Option<String>,
) -> Result<(), LifecycleError> {
    let config = manifest_json
        .as_deref()
        .map(|json| {
            serde_json::from_str::<LifecycleConfig>(json)
                .map_err(|error| LifecycleError::ManifestInvalid(error.to_string()))
        })
        .transpose()?;

    let conn = open_db(db_path)?;
    let status: String = conn
        .query_row(
            "SELECT status FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.clone())
            }
            _ => LifecycleError::Database(e.to_string()),
        })?;
    drop(conn);

    let workspace_status = WorkspaceStatus::from_str(&status)?;
    if workspace_status == WorkspaceStatus::Idle {
        reconcile_workspace_services_db(
            db_path,
            &workspace_id,
            config.as_ref(),
            manifest_fingerprint.as_deref(),
        )?;
    }

    Ok(())
}
