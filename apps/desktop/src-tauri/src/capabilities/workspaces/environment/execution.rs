use std::collections::{HashMap, HashSet};
use std::time::Instant;

use crate::platform::diagnostics;
use crate::platform::runtime::{health, setup};
use crate::shared::errors::{
    LifecycleError, ServiceStatus, WorkspaceFailureReason, WorkspaceStatus,
};

use super::super::controller::{ManagedWorkspaceController, WorkspaceControllerToken};
use super::super::manifest::{HealthCheck, ServiceConfig};
use super::super::shared::{
    emit_service_status, emit_workspace_status, mark_nonfailed_services_stopped,
    mark_services_failed, service_name_for_start_error, service_status_reason_for_start_error,
    update_service_status_db, update_workspace_status_db, workspace_failure_reason_for_start_error,
};
use super::graph::{EnvironmentNode, EnvironmentNodeKind};
use super::lifecycle::WorkspaceStartMode;

use std::path::Path;
use tauri::AppHandle;

pub(super) struct WorkspaceStartContext<'a> {
    pub app: &'a AppHandle,
    pub controller: &'a ManagedWorkspaceController,
    pub db_path: &'a str,
    pub start_mode: WorkspaceStartMode,
    pub start_token: WorkspaceControllerToken,
    pub workspace_id: &'a str,
    pub worktree_path: &'a str,
    pub storage_root: &'a Path,
    pub runtime_env: &'a HashMap<String, String>,
}

impl WorkspaceStartContext<'_> {
    pub(super) async fn abort_if_needed(&self) -> Result<bool, LifecycleError> {
        abort_start_if_needed(
            self.db_path,
            self.workspace_id,
            self.controller,
            &self.start_token,
        )
        .await
    }

    pub(super) async fn record_failure(
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

    pub(super) async fn execute_service_node(
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
                        self.app.clone(),
                        self.workspace_id,
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
                        self.app.clone(),
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

    pub(super) async fn execute_task_node(
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

    pub(super) async fn execute_environment_graph(
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

pub(super) async fn abort_start_if_needed(
    db_path: &str,
    workspace_id: &str,
    controller: &ManagedWorkspaceController,
    start_token: &WorkspaceControllerToken,
) -> Result<bool, LifecycleError> {
    if !start_token.is_cancelled()
        && super::lifecycle::load_workspace_status(db_path, workspace_id)?
            == WorkspaceStatus::Starting
    {
        return Ok(false);
    }

    controller.stop_runtime().await;
    Ok(true)
}

pub(super) async fn record_start_failure(
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

pub(super) fn collect_dependent_service_names(
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

pub(super) async fn record_service_graph_failure(
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
