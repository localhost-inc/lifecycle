use crate::capabilities::workspaces::manifest::{
    parse_lifecycle_config, LifecycleConfig, ServiceConfig,
};
use crate::platform::db::{open_db, DbPath};
use crate::platform::runtime::{health, setup, supervisor};
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use crate::{ManagedSupervisor, SupervisorMap};
use rusqlite::params;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

use super::environment_graph::{
    lower_environment_graph, topo_sort_environment_nodes, EnvironmentNode, EnvironmentNodeKind,
};
use super::shared::{
    emit_service_status, emit_workspace_status, mark_nonfailed_services_stopped,
    mark_services_failed, reconcile_workspace_services_db, service_name_for_start_error,
    service_status_reason_for_start_error, transition_workspace_to_starting,
    update_service_status_db, update_workspace_status_db, workspace_failure_reason_for_start_error,
};

fn set_port_env(env_vars: &mut Option<std::collections::HashMap<String, String>>, port: u16) {
    let vars = env_vars.get_or_insert_with(std::collections::HashMap::new);
    vars.insert("PORT".to_string(), port.to_string());
}

fn uppercase_env_key(value: &str) -> String {
    let mut result = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_uppercase());
            last_was_separator = false;
        } else if !last_was_separator {
            result.push('_');
            last_was_separator = true;
        }
    }

    result.trim_matches('_').to_string()
}

fn slugify_workspace_value(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    slug.trim_matches('-').to_string()
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
            process.resolved_port = Some(override_port);
            set_port_env(&mut process.env_vars, override_port);
            rewrite_health_check_port(&mut process.health_check, previous_port, override_port);
        }
        ServiceConfig::Image(image) => {
            let previous_port = image.port;
            image.resolved_port = Some(override_port);
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
            "SELECT service_name, effective_port FROM workspace_service WHERE workspace_id = ?1",
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

fn load_workspace_status(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceStatus, LifecycleError> {
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

fn load_setup_completed(db_path: &str, workspace_id: &str) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    let setup_completed_at: Option<String> = conn
        .query_row(
            "SELECT setup_completed_at FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    Ok(setup_completed_at.is_some())
}

fn mark_setup_completed(db_path: &str, workspace_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

fn build_runtime_env(
    db_path: &str,
    workspace_id: &str,
    worktree_path: &str,
) -> Result<std::collections::HashMap<String, String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let (workspace_name, source_ref): (String, String) = conn
        .query_row(
            "SELECT name, source_ref FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut env = std::collections::HashMap::from([
        (
            "LIFECYCLE_WORKSPACE_ID".to_string(),
            workspace_id.to_string(),
        ),
        (
            "LIFECYCLE_WORKSPACE_NAME".to_string(),
            workspace_name.clone(),
        ),
        ("LIFECYCLE_WORKSPACE_SOURCE_REF".to_string(), source_ref),
        (
            "LIFECYCLE_WORKSPACE_PATH".to_string(),
            worktree_path.to_string(),
        ),
        (
            "LIFECYCLE_WORKSPACE_SLUG".to_string(),
            slugify_workspace_value(&workspace_name),
        ),
    ]);

    let mut stmt = conn
        .prepare(
            "SELECT service_name, effective_port
             FROM workspace_service
             WHERE workspace_id = ?1",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    for row in rows {
        let (service_name, effective_port) =
            row.map_err(|error| LifecycleError::Database(error.to_string()))?;
        let key = uppercase_env_key(&service_name);
        if key.is_empty() {
            continue;
        }

        env.insert(
            format!("LIFECYCLE_SERVICE_{key}_HOST"),
            "127.0.0.1".to_string(),
        );

        if let Some(port) = effective_port {
            env.insert(format!("LIFECYCLE_SERVICE_{key}_PORT"), port.to_string());
            env.insert(
                format!("LIFECYCLE_SERVICE_{key}_ADDRESS"),
                format!("127.0.0.1:{port}"),
            );
        }
    }

    Ok(env)
}

fn workspace_volume_root(db_path: &str, workspace_id: &str) -> Result<PathBuf, LifecycleError> {
    let base_dir = Path::new(db_path).parent().ok_or_else(|| {
        LifecycleError::Io(format!(
            "failed to resolve workspace volume root for workspace '{workspace_id}'"
        ))
    })?;
    let root = base_dir.join("workspace-volumes").join(workspace_id);
    std::fs::create_dir_all(&root).map_err(|error| {
        LifecycleError::Io(format!(
            "failed to create workspace volume root '{}': {error}",
            root.display()
        ))
    })?;
    Ok(root)
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

    update_workspace_status_db(
        db_path,
        workspace_id,
        &WorkspaceStatus::Idle,
        Some(&failure_reason),
    )?;
    emit_workspace_status(app, workspace_id, "idle", Some(failure_reason.as_str()));
    stop_managed_supervisor(supervisor).await;

    let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
    for service_name in stopped_services {
        emit_service_status(app, workspace_id, &service_name, "stopped", None);
    }

    Ok(true)
}

async fn execute_service_node(
    app: &AppHandle,
    db_path: &str,
    supervisor: &ManagedSupervisor,
    workspace_id: &str,
    worktree_path: &str,
    storage_root: &Path,
    service_name: &str,
    service: &ServiceConfig,
    runtime_env: &std::collections::HashMap<String, String>,
) -> Result<(), LifecycleError> {
    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
        return Ok(());
    }

    update_service_status_db(
        db_path,
        workspace_id,
        service_name,
        &ServiceStatus::Starting,
        None,
    )?;
    emit_service_status(app, workspace_id, service_name, "starting", None);

    let start_result = match service {
        ServiceConfig::Process(process_svc) => {
            let mut managed = supervisor.lock().await;
            managed
                .start_process(service_name, process_svc, worktree_path, runtime_env)
                .await
        }
        ServiceConfig::Image(image_svc) => {
            let mut managed = supervisor.lock().await;
            managed
                .start_container(
                    service_name,
                    image_svc,
                    workspace_id,
                    worktree_path,
                    storage_root,
                    runtime_env,
                )
                .await
        }
    };

    if let Err(error) = start_result {
        if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
            return Ok(());
        }

        let failed_service_name = service_name_for_start_error(&error, service_name);
        let service_status_reason = service_status_reason_for_start_error(&error);
        let workspace_failure_reason = workspace_failure_reason_for_start_error(&error);

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

        return Err(error);
    }

    if service.health_check().is_none() {
        if matches!(service, ServiceConfig::Process(_)) {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }

            let is_running = {
                let mut managed = supervisor.lock().await;
                managed.is_process_running(service_name)
            };

            if !is_running {
                update_service_status_db(
                    db_path,
                    workspace_id,
                    service_name,
                    &ServiceStatus::Failed,
                    Some("service_process_exited"),
                )?;
                emit_service_status(
                    app,
                    workspace_id,
                    service_name,
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
                    service: service_name.to_string(),
                    reason: "process exited before signaling ready".to_string(),
                });
            }
        }

        if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
            return Ok(());
        }
        update_service_status_db(
            db_path,
            workspace_id,
            service_name,
            &ServiceStatus::Ready,
            None,
        )?;
        emit_service_status(app, workspace_id, service_name, "ready", None);
        return Ok(());
    }

    let health_check = service
        .health_check()
        .expect("health check already verified to exist");
    let timeout_secs = service.startup_timeout_seconds();
    match health::wait_for_health(health_check, timeout_secs).await {
        Ok(()) => {
            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }
            update_service_status_db(
                db_path,
                workspace_id,
                service_name,
                &ServiceStatus::Ready,
                None,
            )?;
            emit_service_status(app, workspace_id, service_name, "ready", None);
        }
        Err(_) => {
            if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
                return Ok(());
            }
            update_service_status_db(
                db_path,
                workspace_id,
                service_name,
                &ServiceStatus::Failed,
                Some("service_port_unreachable"),
            )?;
            emit_service_status(
                app,
                workspace_id,
                service_name,
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
                service: service_name.to_string(),
            });
        }
    }

    Ok(())
}

async fn execute_task_node(
    app: &AppHandle,
    db_path: &str,
    supervisor: &ManagedSupervisor,
    workspace_id: &str,
    worktree_path: &str,
    step: &crate::capabilities::workspaces::manifest::SetupStep,
    runtime_env: &std::collections::HashMap<String, String>,
) -> Result<(), LifecycleError> {
    if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
        return Ok(());
    }

    if let Err(error) = setup::run_setup_steps(
        app,
        workspace_id,
        worktree_path,
        std::slice::from_ref(step),
        runtime_env,
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
        return Err(error);
    }

    Ok(())
}

async fn execute_environment_graph(
    app: &AppHandle,
    db_path: &str,
    supervisor: &ManagedSupervisor,
    workspace_id: &str,
    worktree_path: &str,
    storage_root: &Path,
    sorted_nodes: &[(&str, &EnvironmentNode)],
    runtime_env: &std::collections::HashMap<String, String>,
) -> Result<(), LifecycleError> {
    for (node_name, node) in sorted_nodes {
        match &node.kind {
            EnvironmentNodeKind::Task(step) => {
                execute_task_node(
                    app,
                    db_path,
                    supervisor,
                    workspace_id,
                    worktree_path,
                    step,
                    runtime_env,
                )
                .await?;
            }
            EnvironmentNodeKind::Service(service) => {
                execute_service_node(
                    app,
                    db_path,
                    supervisor,
                    workspace_id,
                    worktree_path,
                    storage_root,
                    node_name,
                    service,
                    runtime_env,
                )
                .await?;
            }
        }
    }

    Ok(())
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
    let setup_completed = load_setup_completed(db_path, workspace_id)?;
    let lowered_graph = match lower_environment_graph(&runtime_config, setup_completed) {
        Ok(graph) => graph,
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
    let runtime_env = build_runtime_env(db_path, workspace_id, worktree_path)?;
    let storage_root = workspace_volume_root(db_path, workspace_id)?;
    let sorted_nodes = match topo_sort_environment_nodes(&lowered_graph.environment_nodes) {
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

    let setup_work_ran = !lowered_graph.workspace_setup.is_empty()
        || lowered_graph
            .environment_nodes
            .values()
            .any(|node| matches!(node.kind, EnvironmentNodeKind::Task(_)));

    if !lowered_graph.workspace_setup.is_empty() {
        if let Err(error) = setup::run_setup_steps(
            app,
            workspace_id,
            worktree_path,
            &lowered_graph.workspace_setup,
            &runtime_env,
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
            return Err(error);
        }

        if abort_start_if_needed(db_path, workspace_id, supervisor).await? {
            return Ok(());
        }
    }

    execute_environment_graph(
        app,
        db_path,
        supervisor,
        workspace_id,
        worktree_path,
        &storage_root,
        &sorted_nodes,
        &runtime_env,
    )
    .await?;

    if !setup_completed && setup_work_ran {
        mark_setup_completed(db_path, workspace_id)?;
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
    let config = parse_lifecycle_config(&manifest_json)?;

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
        .map(parse_lifecycle_config)
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
