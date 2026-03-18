use std::collections::HashSet;
use std::time::Instant;

use crate::capabilities::workspaces::manifest::{parse_lifecycle_config, LifecycleConfig};
use crate::platform::db::{map_database_result, open_db, DbPath};
use crate::platform::diagnostics;
use crate::platform::runtime::setup;
use crate::shared::errors::{LifecycleError, WorkspaceFailureReason, WorkspaceStatus};
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::super::controller::ManagedWorkspaceController;
use super::super::shared::{
    emit_service_status, emit_workspace_manifest_synced, emit_workspace_status,
    mark_services_failed, reconcile_workspace_services_db, transition_workspace_to_starting,
    update_workspace_status_db,
};
use super::execution::{
    abort_start_if_needed, record_service_graph_failure, record_start_failure,
    WorkspaceStartContext,
};
use super::graph::{lower_environment_graph, topo_sort_environment_nodes, EnvironmentNodeKind};
use super::port_assignment::{assign_ports_for_start, config_with_workspace_overrides};
use super::runtime_env::{build_runtime_env, workspace_volume_root};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum WorkspaceStartMode {
    Cold,
    Incremental,
}

pub(super) fn load_workspace_status(
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

fn mark_setup_completed(db_path: &str, workspace_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace SET setup_completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

async fn start_services_lifecycle(
    app: &AppHandle,
    controller: &ManagedWorkspaceController,
    db_path: &str,
    start_token: crate::capabilities::workspaces::controller::WorkspaceControllerToken,
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
    let setup_completed = load_setup_completed(db_path, workspace_id)?;
    let satisfied_service_names = if matches!(start_mode, WorkspaceStartMode::Incremental) {
        load_ready_service_names(db_path, workspace_id)?
    } else {
        HashSet::new()
    };
    let planned_graph = match lower_environment_graph(
        config,
        setup_completed,
        service_names,
        Some(&satisfied_service_names),
    ) {
        Ok(graph) => graph,
        Err(error) => {
            let service_names = service_names
                .map(|names| names.to_vec())
                .unwrap_or_else(|| config.declared_service_names());
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
    let selected_service_names = planned_graph
        .environment_nodes
        .iter()
        .filter_map(|(node_name, node)| match node.kind {
            EnvironmentNodeKind::Service(_) => Some(node_name.clone()),
            EnvironmentNodeKind::Task(_) => None,
        })
        .collect::<Vec<_>>();
    assign_ports_for_start(db_path, workspace_id, config, &selected_service_names)?;
    let runtime_config = config_with_workspace_overrides(db_path, workspace_id, config)?;
    let lowered_graph = lower_environment_graph(
        &runtime_config,
        setup_completed,
        service_names,
        Some(&satisfied_service_names),
    )?;
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
                super::super::query::get_workspace_services(db_path, workspace_id.clone()).await?;
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
