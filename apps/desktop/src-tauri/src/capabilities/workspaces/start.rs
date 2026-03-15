use crate::capabilities::workspaces::manifest::{
    parse_lifecycle_config, HealthCheck, LifecycleConfig, ServiceConfig,
};
use crate::platform::db::{map_database_result, open_db, DbPath};
use crate::platform::diagnostics;
use crate::platform::runtime::{health, setup};
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::Instant;
use tauri::{AppHandle, State};

use super::controller::{ManagedWorkspaceController, WorkspaceControllerToken};
use super::environment_graph::{
    lower_environment_graph, topo_sort_environment_nodes, EnvironmentNode, EnvironmentNodeKind,
};
use super::shared::{
    emit_service_status, emit_workspace_manifest_synced, emit_workspace_status,
    mark_nonfailed_services_stopped, mark_services_failed, reconcile_workspace_services_db,
    service_name_for_start_error, service_status_reason_for_start_error,
    transition_workspace_to_starting, update_service_status_db, update_workspace_status_db,
    workspace_failure_reason_for_start_error,
};

fn set_port_env(env: &mut Option<std::collections::HashMap<String, String>>, port: u16) {
    let vars = env.get_or_insert_with(std::collections::HashMap::new);
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

fn apply_port_override(service: &mut ServiceConfig, override_port: u16) {
    match service {
        ServiceConfig::Process(process) => {
            process.resolved_port = Some(override_port);
            set_port_env(&mut process.env, override_port);
        }
        ServiceConfig::Image(image) => {
            image.resolved_port = Some(override_port);
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
        let Some(service) = next.service_mut(&service_name) else {
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

fn load_ready_service_names(
    db_path: &str,
    workspace_id: &str,
) -> Result<HashSet<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT service_name
             FROM workspace_service
             WHERE workspace_id = ?1 AND status = 'ready'",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut ready_service_names = HashSet::new();
    for row in rows {
        ready_service_names
            .insert(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }

    Ok(ready_service_names)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WorkspaceStartMode {
    Cold,
    Incremental,
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
) -> Result<HashMap<String, String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let (workspace_name, source_ref): (String, String) = conn
        .query_row(
            "SELECT name, source_ref FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut env = HashMap::from([
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

struct WorkspaceStartContext<'a> {
    app: &'a AppHandle,
    controller: &'a ManagedWorkspaceController,
    db_path: &'a str,
    start_mode: WorkspaceStartMode,
    start_token: WorkspaceControllerToken,
    workspace_id: &'a str,
    worktree_path: &'a str,
    storage_root: &'a Path,
    runtime_env: &'a HashMap<String, String>,
}

impl WorkspaceStartContext<'_> {
    async fn abort_if_needed(&self) -> Result<bool, LifecycleError> {
        abort_start_if_needed(
            self.db_path,
            self.workspace_id,
            self.controller,
            &self.start_token,
        )
        .await
    }

    async fn record_failure(
        &self,
        failure_reason: WorkspaceFailureReason,
    ) -> Result<bool, LifecycleError> {
        record_start_failure(
            self.app,
            self.controller,
            self.db_path,
            &self.start_token,
            self.start_mode,
            self.workspace_id,
            failure_reason,
        )
        .await
    }

    async fn execute_service_node(
        &self,
        service_name: &str,
        service: &ServiceConfig,
    ) -> Result<(), LifecycleError> {
        if self.abort_if_needed().await? {
            return Ok(());
        }

        update_service_status_db(
            self.db_path,
            self.workspace_id,
            service_name,
            &ServiceStatus::Starting,
            None,
        )?;
        emit_service_status(self.app, self.workspace_id, service_name, "starting", None);

        let service_start_started_at = Instant::now();
        let start_result = match service {
            ServiceConfig::Process(process_svc) => {
                let supervisor = self.controller.supervisor();
                let mut managed = supervisor.lock().await;
                managed
                    .start_process(
                        service_name,
                        process_svc,
                        self.worktree_path,
                        self.runtime_env,
                    )
                    .await
            }
            ServiceConfig::Image(image_svc) => {
                let supervisor = self.controller.supervisor();
                let mut managed = supervisor.lock().await;
                managed
                    .start_container(
                        service_name,
                        image_svc,
                        self.workspace_id,
                        self.worktree_path,
                        self.storage_root,
                        self.runtime_env,
                    )
                    .await
            }
        };

        if let Err(error) = start_result {
            if self.abort_if_needed().await? {
                return Ok(());
            }

            let failed_service_name = service_name_for_start_error(&error, service_name);
            let service_status_reason = service_status_reason_for_start_error(&error);
            let workspace_failure_reason = workspace_failure_reason_for_start_error(&error);

            update_service_status_db(
                self.db_path,
                self.workspace_id,
                &failed_service_name,
                &ServiceStatus::Failed,
                Some(service_status_reason),
            )?;
            emit_service_status(
                self.app,
                self.workspace_id,
                &failed_service_name,
                "failed",
                Some(service_status_reason),
            );

            let recorded = self.record_failure(workspace_failure_reason).await?;
            if !recorded {
                return Ok(());
            }

            return Err(error);
        }

        diagnostics::append_timing(
            "workspace-start",
            &format!(
                "workspace {} service {service_name} start",
                self.workspace_id
            ),
            service_start_started_at,
        );

        if service.health_check().is_none() {
            if matches!(service, ServiceConfig::Process(_)) {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                if self.abort_if_needed().await? {
                    return Ok(());
                }

                let is_running = {
                    let supervisor = self.controller.supervisor();
                    let mut managed = supervisor.lock().await;
                    managed.is_process_running(service_name)
                };

                if !is_running {
                    update_service_status_db(
                        self.db_path,
                        self.workspace_id,
                        service_name,
                        &ServiceStatus::Failed,
                        Some("service_process_exited"),
                    )?;
                    emit_service_status(
                        self.app,
                        self.workspace_id,
                        service_name,
                        "failed",
                        Some("service_process_exited"),
                    );
                    let recorded = self
                        .record_failure(WorkspaceFailureReason::ServiceStartFailed)
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

            if self.abort_if_needed().await? {
                return Ok(());
            }
            update_service_status_db(
                self.db_path,
                self.workspace_id,
                service_name,
                &ServiceStatus::Ready,
                None,
            )?;
            emit_service_status(self.app, self.workspace_id, service_name, "ready", None);
            return Ok(());
        }

        let health_check = health::resolve_health_check_templates(
            service
                .health_check()
                .expect("health check already verified to exist"),
            self.runtime_env,
            &format!("environment.{service_name}.health_check"),
        )?;
        let timeout_secs = service.startup_timeout_seconds();
        let health_check_started_at = Instant::now();
        let container_ref = match (service, &health_check) {
            (ServiceConfig::Image(_), HealthCheck::Container { .. }) => {
                let supervisor = self.controller.supervisor();
                let managed = supervisor.lock().await;
                managed.container_ref(service_name)
            }
            _ => None,
        };
        let health_result = {
            let mut start_token = self.start_token.clone();
            tokio::select! {
                result = health::wait_for_health(&health_check, timeout_secs, container_ref.as_deref()) => Some(result),
                _ = start_token.cancelled() => None,
            }
        };
        match health_result {
            Some(Ok(())) => {
                if self.abort_if_needed().await? {
                    return Ok(());
                }
                update_service_status_db(
                    self.db_path,
                    self.workspace_id,
                    service_name,
                    &ServiceStatus::Ready,
                    None,
                )?;
                emit_service_status(self.app, self.workspace_id, service_name, "ready", None);
                diagnostics::append_timing(
                    "workspace-start",
                    &format!(
                        "workspace {} service {service_name} health check",
                        self.workspace_id
                    ),
                    health_check_started_at,
                );
            }
            Some(Err(_)) => {
                if self.abort_if_needed().await? {
                    return Ok(());
                }
                update_service_status_db(
                    self.db_path,
                    self.workspace_id,
                    service_name,
                    &ServiceStatus::Failed,
                    Some("service_port_unreachable"),
                )?;
                emit_service_status(
                    self.app,
                    self.workspace_id,
                    service_name,
                    "failed",
                    Some("service_port_unreachable"),
                );
                let recorded = self
                    .record_failure(WorkspaceFailureReason::ServiceHealthcheckFailed)
                    .await?;
                if !recorded {
                    return Ok(());
                }

                return Err(LifecycleError::ServiceHealthcheckFailed {
                    service: service_name.to_string(),
                });
            }
            None => return Ok(()),
        }

        Ok(())
    }

    async fn execute_task_node(
        &self,
        node_name: &str,
        step: &crate::capabilities::workspaces::manifest::SetupStep,
    ) -> Result<(), LifecycleError> {
        if self.abort_if_needed().await? {
            return Ok(());
        }

        let step_field = format!("environment.{node_name}");
        match setup::run_steps(
            self.app,
            self.workspace_id,
            self.worktree_path,
            std::slice::from_ref(step),
            self.runtime_env,
            &step_field,
            setup::StepProgressTarget::EnvironmentTask,
            Some(self.start_token.clone()),
        )
        .await
        {
            Ok(setup::StepRunOutcome::Completed) => {}
            Ok(setup::StepRunOutcome::Cancelled) => return Ok(()),
            Err(error) => {
                let recorded = self
                    .record_failure(WorkspaceFailureReason::EnvironmentTaskFailed)
                    .await?;
                if !recorded {
                    return Ok(());
                }
                return Err(error);
            }
        }

        Ok(())
    }

    async fn execute_environment_graph(
        &self,
        nodes: &HashMap<String, EnvironmentNode>,
        sorted_nodes: &[(&str, &EnvironmentNode)],
    ) -> Result<(), LifecycleError> {
        for (node_name, node) in sorted_nodes {
            match &node.kind {
                EnvironmentNodeKind::Task(step) => {
                    if let Err(error) = self.execute_task_node(node_name, step).await {
                        mark_dependent_services_failed(self, nodes, node_name)?;
                        return Err(error);
                    }
                }
                EnvironmentNodeKind::Service(service) => {
                    if let Err(error) = self.execute_service_node(node_name, service).await {
                        mark_dependent_services_failed(self, nodes, node_name)?;
                        return Err(error);
                    }
                }
            }
        }

        Ok(())
    }
}

async fn abort_start_if_needed(
    db_path: &str,
    workspace_id: &str,
    controller: &ManagedWorkspaceController,
    start_token: &WorkspaceControllerToken,
) -> Result<bool, LifecycleError> {
    if !start_token.is_cancelled()
        && load_workspace_status(db_path, workspace_id)? == WorkspaceStatus::Starting
    {
        return Ok(false);
    }

    controller.stop_runtime().await;
    Ok(true)
}

async fn record_start_failure(
    app: &AppHandle,
    controller: &ManagedWorkspaceController,
    db_path: &str,
    start_token: &WorkspaceControllerToken,
    start_mode: WorkspaceStartMode,
    workspace_id: &str,
    failure_reason: WorkspaceFailureReason,
) -> Result<bool, LifecycleError> {
    if abort_start_if_needed(db_path, workspace_id, controller, start_token).await? {
        return Ok(false);
    }

    let next_workspace_status = match start_mode {
        WorkspaceStartMode::Cold => WorkspaceStatus::Idle,
        WorkspaceStartMode::Incremental => WorkspaceStatus::Active,
    };
    let next_failure_reason = match start_mode {
        WorkspaceStartMode::Cold => Some(&failure_reason),
        WorkspaceStartMode::Incremental => None,
    };
    update_workspace_status_db(
        db_path,
        workspace_id,
        &next_workspace_status,
        next_failure_reason,
    )?;
    emit_workspace_status(
        app,
        workspace_id,
        next_workspace_status.as_str(),
        next_failure_reason.map(WorkspaceFailureReason::as_str),
    );
    controller.finish_start(start_token).await;

    if matches!(start_mode, WorkspaceStartMode::Cold) {
        controller.stop_runtime().await;

        let stopped_services = mark_nonfailed_services_stopped(db_path, workspace_id)?;
        for service_name in stopped_services {
            emit_service_status(app, workspace_id, &service_name, "stopped", None);
        }
    }

    Ok(true)
}

fn collect_dependent_service_names(
    nodes: &HashMap<String, EnvironmentNode>,
    failed_node_name: &str,
) -> Vec<String> {
    let mut visited = HashSet::from([failed_node_name.to_string()]);
    let mut frontier = vec![failed_node_name.to_string()];
    let mut dependent_service_names = Vec::new();

    while let Some(node_name) = frontier.pop() {
        for (candidate_name, candidate_node) in nodes {
            if visited.contains(candidate_name) || !candidate_node.depends_on().contains(&node_name)
            {
                continue;
            }

            visited.insert(candidate_name.clone());
            frontier.push(candidate_name.clone());

            if matches!(candidate_node.kind, EnvironmentNodeKind::Service(_)) {
                dependent_service_names.push(candidate_name.clone());
            }
        }
    }

    dependent_service_names.sort();
    dependent_service_names
}

fn mark_dependent_services_failed(
    ctx: &WorkspaceStartContext<'_>,
    nodes: &HashMap<String, EnvironmentNode>,
    failed_node_name: &str,
) -> Result<(), LifecycleError> {
    let dependent_service_names = collect_dependent_service_names(nodes, failed_node_name);

    if dependent_service_names.is_empty() {
        return Ok(());
    }

    mark_services_failed(
        ctx.db_path,
        ctx.workspace_id,
        &dependent_service_names,
        "service_dependency_failed",
    )?;

    for service_name in dependent_service_names {
        emit_service_status(
            ctx.app,
            ctx.workspace_id,
            &service_name,
            "failed",
            Some("service_dependency_failed"),
        );
    }

    Ok(())
}

async fn record_service_graph_failure(
    ctx: &WorkspaceStartContext<'_>,
    service_names: &[String],
    error: LifecycleError,
) -> Result<(), LifecycleError> {
    mark_services_failed(
        ctx.db_path,
        ctx.workspace_id,
        service_names,
        "service_dependency_failed",
    )?;

    for service_name in service_names {
        emit_service_status(
            ctx.app,
            ctx.workspace_id,
            service_name,
            "failed",
            Some("service_dependency_failed"),
        );
    }

    let recorded = ctx
        .record_failure(WorkspaceFailureReason::ServiceStartFailed)
        .await?;
    if !recorded {
        return Ok(());
    }

    Err(error)
}

async fn start_services_lifecycle(
    app: &AppHandle,
    controller: &ManagedWorkspaceController,
    db_path: &str,
    start_token: WorkspaceControllerToken,
    start_mode: WorkspaceStartMode,
    service_names: Option<&[String]>,
    workspace_id: &str,
    worktree_path: &str,
    config: &LifecycleConfig,
    manifest_fingerprint: &str,
) -> Result<(), LifecycleError> {
    let total_started_at = Instant::now();
    reconcile_workspace_services_db(
        db_path,
        workspace_id,
        Some(config),
        Some(manifest_fingerprint),
        matches!(start_mode, WorkspaceStartMode::Incremental),
    )?;
    if abort_start_if_needed(db_path, workspace_id, controller, &start_token).await? {
        return Ok(());
    }
    let runtime_config = config_with_workspace_overrides(db_path, workspace_id, config)?;
    let setup_completed = load_setup_completed(db_path, workspace_id)?;
    let satisfied_service_names = if matches!(start_mode, WorkspaceStartMode::Incremental) {
        load_ready_service_names(db_path, workspace_id)?
    } else {
        HashSet::new()
    };
    let lowered_graph = match lower_environment_graph(
        &runtime_config,
        setup_completed,
        service_names,
        Some(&satisfied_service_names),
    ) {
        Ok(graph) => graph,
        Err(error) => {
            let service_names = service_names
                .map(|names| names.to_vec())
                .unwrap_or_else(|| runtime_config.declared_service_names());
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
                controller,
                db_path,
                &start_token,
                start_mode,
                workspace_id,
                WorkspaceFailureReason::ServiceStartFailed,
            )
            .await?;
            if !recorded {
                return Ok(());
            }

            return Err(error);
        }
    };
    let selected_service_names = lowered_graph
        .environment_nodes
        .iter()
        .filter_map(|(node_name, node)| match node.kind {
            EnvironmentNodeKind::Service(_) => Some(node_name.clone()),
            EnvironmentNodeKind::Task(_) => None,
        })
        .collect::<Vec<_>>();
    if lowered_graph.workspace_setup.is_empty() && lowered_graph.environment_nodes.is_empty() {
        update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Active, None)?;
        emit_workspace_status(app, workspace_id, "active", None);
        controller.finish_start(&start_token).await;
        diagnostics::append_timing(
            "workspace-start",
            &format!("workspace {workspace_id} total"),
            total_started_at,
        );
        return Ok(());
    }
    let runtime_env = build_runtime_env(db_path, workspace_id, worktree_path)?;
    let storage_root = workspace_volume_root(db_path, workspace_id)?;
    let ctx = WorkspaceStartContext {
        app,
        controller,
        db_path,
        start_mode,
        start_token: start_token.clone(),
        workspace_id,
        worktree_path,
        storage_root: &storage_root,
        runtime_env: &runtime_env,
    };
    let sorted_nodes = match topo_sort_environment_nodes(&lowered_graph.environment_nodes) {
        Ok(sorted) => sorted,
        Err(error) => {
            record_service_graph_failure(&ctx, &selected_service_names, error).await?;
            return Ok(());
        }
    };

    let setup_work_ran = !lowered_graph.workspace_setup.is_empty()
        || lowered_graph
            .environment_nodes
            .values()
            .any(|node| matches!(node.kind, EnvironmentNodeKind::Task(_)));

    if !lowered_graph.workspace_setup.is_empty() {
        let setup_started_at = Instant::now();
        match setup::run_steps(
            app,
            workspace_id,
            worktree_path,
            &lowered_graph.workspace_setup,
            &runtime_env,
            "workspace.setup",
            setup::StepProgressTarget::WorkspaceSetup,
            Some(start_token.clone()),
        )
        .await
        {
            Ok(setup::StepRunOutcome::Completed) => {}
            Ok(setup::StepRunOutcome::Cancelled) => return Ok(()),
            Err(error) => {
                let recorded = ctx
                    .record_failure(WorkspaceFailureReason::SetupStepFailed)
                    .await?;
                if !recorded {
                    return Ok(());
                }
                return Err(error);
            }
        }

        diagnostics::append_timing(
            "workspace-start",
            &format!("workspace {workspace_id} setup"),
            setup_started_at,
        );

        if ctx.abort_if_needed().await? {
            return Ok(());
        }
    }

    ctx.execute_environment_graph(&lowered_graph.environment_nodes, &sorted_nodes)
        .await?;

    if !setup_completed && setup_work_ran {
        mark_setup_completed(db_path, workspace_id)?;
    }

    if ctx.abort_if_needed().await? {
        return Ok(());
    }

    // All healthy -> active.
    update_workspace_status_db(db_path, workspace_id, &WorkspaceStatus::Active, None)?;
    emit_workspace_status(app, workspace_id, "active", None);
    controller.finish_start(&start_token).await;
    diagnostics::append_timing(
        "workspace-start",
        &format!("workspace {workspace_id} total"),
        total_started_at,
    );

    Ok(())
}

pub async fn start_services(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
    manifest_json: String,
    manifest_fingerprint: String,
    service_names: Option<Vec<String>>,
) -> Result<(), LifecycleError> {
    let config = parse_lifecycle_config(&manifest_json)?;
    let service_names = service_names.filter(|names| !names.is_empty());
    let _mutation_guard = workspace_controllers
        .acquire_mutation_guard(&workspace_id)
        .await?;
    let current_workspace_status = load_workspace_status(&db_path.0, &workspace_id)?;
    let start_mode = match (&current_workspace_status, service_names.as_ref()) {
        (WorkspaceStatus::Idle, _) => WorkspaceStartMode::Cold,
        (WorkspaceStatus::Active, Some(_)) => WorkspaceStartMode::Incremental,
        (WorkspaceStatus::Starting | WorkspaceStatus::Stopping, _) => {
            return Err(LifecycleError::WorkspaceMutationLocked {
                status: current_workspace_status.as_str().to_string(),
            });
        }
        (WorkspaceStatus::Active, None) => {
            return Err(LifecycleError::InvalidStateTransition {
                from: WorkspaceStatus::Active.as_str().to_string(),
                to: WorkspaceStatus::Starting.as_str().to_string(),
            });
        }
    };

    // Read workspace row — validate worktree_path is set.
    let worktree_path = {
        let conn = open_db(&db_path.0)?;
        let path: Option<String> = map_database_result(conn.query_row(
            "SELECT worktree_path FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        ))?;
        path.ok_or_else(|| {
            LifecycleError::WorkspaceNotFound(format!(
                "workspace '{}' has no worktree path",
                workspace_id
            ))
        })?
    };
    let setup_completed = load_setup_completed(&db_path.0, &workspace_id)?;
    let satisfied_service_names = if matches!(start_mode, WorkspaceStartMode::Incremental) {
        load_ready_service_names(&db_path.0, &workspace_id)?
    } else {
        HashSet::new()
    };
    let lowered_graph = lower_environment_graph(
        &config,
        setup_completed,
        service_names.as_deref(),
        Some(&satisfied_service_names),
    )?;
    if matches!(start_mode, WorkspaceStartMode::Incremental)
        && lowered_graph.workspace_setup.is_empty()
        && lowered_graph.environment_nodes.is_empty()
    {
        return Ok(());
    }

    // Acquire workspace lifecycle lock synchronously to prevent concurrent starts.
    transition_workspace_to_starting(&db_path.0, &workspace_id)?;
    emit_workspace_status(&app, &workspace_id, "starting", None);

    let db = db_path.0.clone();
    let controller = workspace_controllers.get_or_create(&workspace_id).await;
    let start_token = controller.begin_start().await?;
    let ws_id = workspace_id.clone();
    let requested_service_names = service_names.clone();

    tokio::spawn(async move {
        if let Err(e) = start_services_lifecycle(
            &app,
            &controller,
            &db,
            start_token,
            start_mode,
            requested_service_names.as_deref(),
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
    app: Option<&AppHandle>,
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
            false,
        )?;
        if let Some(app) = app {
            let services =
                super::query::get_workspace_services(db_path, workspace_id.clone()).await?;
            emit_workspace_manifest_synced(
                app,
                &workspace_id,
                manifest_fingerprint.as_deref(),
                &services,
            );
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::manifest::{ProcessService, SetupStep};

    #[test]
    fn collect_dependent_service_names_only_marks_impacted_service_descendants() {
        let nodes = HashMap::from([
            (
                "api".to_string(),
                EnvironmentNode {
                    kind: EnvironmentNodeKind::Service(ServiceConfig::Process(ProcessService {
                        command: "bun run api".to_string(),
                        cwd: None,
                        env: None,
                        depends_on: None,
                        startup_timeout_seconds: None,
                        health_check: None,
                        port: Some(8787),
                        share_default: None,
                        resolved_port: None,
                    })),
                    depends_on: vec!["migrate".to_string()],
                },
            ),
            (
                "migrate".to_string(),
                EnvironmentNode {
                    kind: EnvironmentNodeKind::Task(SetupStep {
                        name: "migrate".to_string(),
                        command: Some("bun run db:migrate".to_string()),
                        write_files: None,
                        timeout_seconds: 60,
                        cwd: None,
                        env: None,
                        depends_on: Some(vec![]),
                        run_on: None,
                    }),
                    depends_on: vec![],
                },
            ),
            (
                "www".to_string(),
                EnvironmentNode {
                    kind: EnvironmentNodeKind::Service(ServiceConfig::Process(ProcessService {
                        command: "bun run www".to_string(),
                        cwd: None,
                        env: None,
                        depends_on: Some(vec!["api".to_string()]),
                        startup_timeout_seconds: None,
                        health_check: None,
                        port: Some(3000),
                        share_default: Some(true),
                        resolved_port: None,
                    })),
                    depends_on: vec!["api".to_string()],
                },
            ),
            (
                "docs".to_string(),
                EnvironmentNode {
                    kind: EnvironmentNodeKind::Service(ServiceConfig::Process(ProcessService {
                        command: "bun run docs".to_string(),
                        cwd: None,
                        env: None,
                        depends_on: None,
                        startup_timeout_seconds: None,
                        health_check: None,
                        port: Some(4000),
                        share_default: Some(true),
                        resolved_port: None,
                    })),
                    depends_on: vec![],
                },
            ),
        ]);

        assert_eq!(
            collect_dependent_service_names(&nodes, "migrate"),
            vec!["api".to_string(), "www".to_string()]
        );
        assert_eq!(
            collect_dependent_service_names(&nodes, "api"),
            vec!["www".to_string()]
        );
    }
}
