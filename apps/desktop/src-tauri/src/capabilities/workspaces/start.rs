use crate::capabilities::workspaces::manifest::{LifecycleConfig, ServiceConfig};
use crate::platform::db::{open_db, DbPath};
use crate::platform::runtime::{health, setup, supervisor};
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use crate::SupervisorMap;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{
    emit_service_status, emit_workspace_status, mark_nonfailed_services_stopped,
    mark_services_failed, service_name_for_start_error, service_status_reason_for_start_error,
    topo_sort_services, transition_workspace_to_starting, update_service_status_db,
    update_workspace_status_db, workspace_failure_reason_for_start_error,
};

async fn start_services_lifecycle(
    app: &AppHandle,
    db_path: &str,
    supervisors: &SupervisorMap,
    workspace_id: &str,
    worktree_path: &str,
    config: &LifecycleConfig,
) -> Result<(), LifecycleError> {
    // Upsert workspace_service rows from config
    {
        let conn = open_db(db_path)?;
        // Remove stale services not in current config
        conn.execute(
            "DELETE FROM workspace_service WHERE workspace_id = ?1",
            params![workspace_id],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

        for (name, svc) in &config.services {
            let svc_id = uuid::Uuid::new_v4().to_string();
            let port = svc.port().map(|p| p as i64);
            conn.execute(
                "INSERT INTO workspace_service (id, workspace_id, service_name, default_port, effective_port) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![svc_id, workspace_id, name, port, port],
            ).map_err(|e| LifecycleError::Database(e.to_string()))?;
        }
    }

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
        if let Err(e) =
            setup::run_setup_steps(app, workspace_id, worktree_path, &config.setup.steps).await
        {
            update_workspace_status_db(
                db_path,
                workspace_id,
                &WorkspaceStatus::Failed,
                Some(&WorkspaceFailureReason::SetupStepFailed),
            )?;
            emit_workspace_status(app, workspace_id, "failed", Some("setup_step_failed"));
            return Err(e);
        }

        let conn = open_db(db_path)?;
        conn.execute(
            "UPDATE workspace SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            params![workspace_id],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    // Start services (topologically sorted)
    let mut sup = supervisor::Supervisor::new();
    let sorted_services = match topo_sort_services(&config.services) {
        Ok(sorted) => sorted,
        Err(error) => {
            let service_names: Vec<String> = config.services.keys().cloned().collect();
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

            update_workspace_status_db(
                db_path,
                workspace_id,
                &WorkspaceStatus::Failed,
                Some(&WorkspaceFailureReason::ServiceStartFailed),
            )?;
            emit_workspace_status(app, workspace_id, "failed", Some("service_start_failed"));

            // Store empty supervisor so the entry exists
            let mut sups = supervisors.lock().await;
            sups.insert(workspace_id.to_string(), sup);

            return Err(error);
        }
    };

    for (name, svc) in &sorted_services {
        update_service_status_db(db_path, workspace_id, name, &ServiceStatus::Starting, None)?;
        emit_service_status(app, workspace_id, name, "starting", None);

        let start_result = match svc {
            ServiceConfig::Process(process_svc) => {
                sup.start_process(name, process_svc, worktree_path).await
            }
            ServiceConfig::Image(image_svc) => {
                sup.start_container(name, image_svc, workspace_id).await
            }
        };

        if let Err(e) = start_result {
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

            update_workspace_status_db(
                db_path,
                workspace_id,
                &WorkspaceStatus::Failed,
                Some(&workspace_failure_reason),
            )?;
            emit_workspace_status(
                app,
                workspace_id,
                "failed",
                Some(workspace_failure_reason.as_str()),
            );
            sup.stop_all().await;
            let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
            for service_name in stopped_services {
                emit_service_status(app, workspace_id, &service_name, "stopped", None);
            }

            // Store supervisor even on failure
            let mut sups = supervisors.lock().await;
            sups.insert(workspace_id.to_string(), sup);

            return Err(e);
        }

        // No health check → ready immediately
        if svc.health_check().is_none() {
            if matches!(svc, ServiceConfig::Process(_)) {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                if !sup.is_process_running(name) {
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
                    update_workspace_status_db(
                        db_path,
                        workspace_id,
                        &WorkspaceStatus::Failed,
                        Some(&WorkspaceFailureReason::ServiceStartFailed),
                    )?;
                    emit_workspace_status(
                        app,
                        workspace_id,
                        "failed",
                        Some("service_start_failed"),
                    );
                    sup.stop_all().await;
                    let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
                    for service_name in stopped_services {
                        emit_service_status(app, workspace_id, &service_name, "stopped", None);
                    }

                    // Store supervisor even on failure
                    let mut sups = supervisors.lock().await;
                    sups.insert(workspace_id.to_string(), sup);

                    return Err(LifecycleError::ServiceStartFailed {
                        service: (*name).to_string(),
                        reason: "process exited before signaling ready".to_string(),
                    });
                }
            }

            update_service_status_db(db_path, workspace_id, name, &ServiceStatus::Ready, None)?;
            emit_service_status(app, workspace_id, name, "ready", None);
        }
    }

    // Run health checks
    for (name, svc) in &sorted_services {
        if let Some(hc) = svc.health_check() {
            let timeout_secs = svc.startup_timeout_seconds();
            match health::wait_for_health(hc, timeout_secs).await {
                Ok(()) => {
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
                    update_workspace_status_db(
                        db_path,
                        workspace_id,
                        &WorkspaceStatus::Failed,
                        Some(&WorkspaceFailureReason::ServiceHealthcheckFailed),
                    )?;
                    emit_workspace_status(
                        app,
                        workspace_id,
                        "failed",
                        Some("service_healthcheck_failed"),
                    );
                    sup.stop_all().await;
                    let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
                    for service_name in stopped_services {
                        emit_service_status(app, workspace_id, &service_name, "stopped", None);
                    }

                    // Store supervisor even on failure
                    let mut sups = supervisors.lock().await;
                    sups.insert(workspace_id.to_string(), sup);

                    return Err(LifecycleError::ServiceHealthcheckFailed {
                        service: name.to_string(),
                    });
                }
            }
        }
    }

    // All healthy → ready
    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Ready, None)?;
    emit_workspace_status(app, workspace_id, "ready", None);

    // Store supervisor
    let mut sups = supervisors.lock().await;
    sups.insert(workspace_id.to_string(), sup);

    Ok(())
}

pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
    manifest_json: String,
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
    let sups = supervisors.inner().clone();
    let ws_id = workspace_id.clone();

    tokio::spawn(async move {
        if let Err(e) =
            start_services_lifecycle(&app, &db, &sups, &ws_id, &worktree_path, &config).await
        {
            tracing::error!("start_services failed for {}: {e}", ws_id);
        }
    });

    Ok(())
}
