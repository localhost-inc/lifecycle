use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Instant;

use crate::capabilities::workspaces::manifest::{
    parse_lifecycle_config, parse_lifecycle_config_with_fingerprint, LifecycleConfig,
};
use crate::platform::db::{map_database_result, open_db, DbPath};
use crate::platform::diagnostics;
use crate::platform::runtime::prepare;
use crate::shared::errors::{LifecycleError, EnvironmentFailureReason, EnvironmentStatus};
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::super::controller::ManagedWorkspaceController;
use super::super::shared::{
    emit_environment_status, emit_service_status, mark_services_failed,
    reconcile_workspace_services_db, transition_environment_to, update_environment_status_db,
};
use super::execution::{
    abort_start_if_needed, record_service_graph_failure, record_start_failure,
    WorkspaceStartContext,
};
use super::graph::{lower_environment_graph, topo_sort_environment_nodes, EnvironmentNodeKind};
use super::port_assignment::{assign_ports_for_start, config_with_assigned_ports};
use super::runtime_env::{build_runtime_env, workspace_volume_root};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum WorkspaceStartMode {
    Cold,
    Incremental,
}

pub(super) fn load_workspace_status(
    db_path: &str,
    workspace_id: &str,
) -> Result<EnvironmentStatus, LifecycleError> {
    let conn = open_db(db_path)?;
    let status = conn
        .query_row(
            "SELECT status FROM environment WHERE workspace_id = ?1",
            params![workspace_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;

    EnvironmentStatus::from_str(&status)
}

fn load_prepared(db_path: &str, workspace_id: &str) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    let prepared_at: Option<String> = conn
        .query_row(
            "SELECT prepared_at FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    Ok(prepared_at.is_some())
}

fn load_ready_service_names(
    db_path: &str,
    workspace_id: &str,
) -> Result<HashSet<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT name
             FROM service
             WHERE environment_id = ?1 AND status = 'ready'",
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

fn mark_prepared(db_path: &str, workspace_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE workspace SET prepared_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
        params![workspace_id],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

async fn start_environment_lifecycle(
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
    let prepared = load_prepared(db_path, workspace_id)?;
    let satisfied_service_names = if matches!(start_mode, WorkspaceStartMode::Incremental) {
        load_ready_service_names(db_path, workspace_id)?
    } else {
        HashSet::new()
    };
    let planned_graph = match lower_environment_graph(
        config,
        prepared,
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

            for name in &service_names {
                emit_service_status(
                    app,
                    workspace_id,
                    name,
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
                EnvironmentFailureReason::ServiceStartFailed,
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
    let runtime_config = config_with_assigned_ports(db_path, workspace_id, config)?;
    let lowered_graph = lower_environment_graph(
        &runtime_config,
        prepared,
        service_names,
        Some(&satisfied_service_names),
    )?;
    if lowered_graph.workspace_prepare.is_empty() && lowered_graph.environment_nodes.is_empty() {
        update_environment_status_db(db_path, workspace_id, &EnvironmentStatus::Running, None)?;
        emit_environment_status(app, workspace_id, "running", None);
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

    let prepare_work_ran = !lowered_graph.workspace_prepare.is_empty()
        || lowered_graph
            .environment_nodes
            .values()
            .any(|node| matches!(node.kind, EnvironmentNodeKind::Task(_)));

    if !lowered_graph.workspace_prepare.is_empty() {
        let prepare_started_at = Instant::now();
        match prepare::run_steps(
            worktree_path,
            &lowered_graph.workspace_prepare,
            &runtime_env,
            "workspace.prepare",
            Some(start_token.clone()),
        )
        .await
        {
            Ok(prepare::StepRunOutcome::Completed) => {}
            Ok(prepare::StepRunOutcome::Cancelled) => return Ok(()),
            Err(error) => {
                let recorded = ctx
                    .record_failure(EnvironmentFailureReason::PrepareStepFailed)
                    .await?;
                if !recorded {
                    return Ok(());
                }
                return Err(error);
            }
        }

        diagnostics::append_timing(
            "workspace-start",
            &format!("workspace {workspace_id} prepare"),
            prepare_started_at,
        );

        if ctx.abort_if_needed().await? {
            return Ok(());
        }

        update_environment_status_db(db_path, workspace_id, &EnvironmentStatus::Starting, None)?;
        emit_environment_status(app, workspace_id, "starting", None);
    }

    ctx.execute_environment_graph(&lowered_graph.environment_nodes, &sorted_nodes)
        .await?;

    if !prepared && prepare_work_ran {
        mark_prepared(db_path, workspace_id)?;
    }

    if ctx.abort_if_needed().await? {
        return Ok(());
    }

    // All healthy -> running.
    update_environment_status_db(db_path, workspace_id, &EnvironmentStatus::Running, None)?;
    emit_environment_status(app, workspace_id, "running", None);
    controller.finish_start(&start_token).await;
    diagnostics::append_timing(
        "workspace-start",
        &format!("workspace {workspace_id} total"),
        total_started_at,
    );

    Ok(())
}

pub async fn start_environment(
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
        (EnvironmentStatus::Idle, _) => WorkspaceStartMode::Cold,
        (EnvironmentStatus::Running, Some(_)) => WorkspaceStartMode::Incremental,
        (EnvironmentStatus::Starting | EnvironmentStatus::Stopping, _) => {
            return Err(LifecycleError::WorkspaceMutationLocked {
                status: current_workspace_status.as_str().to_string(),
            });
        }
        (EnvironmentStatus::Running, None) => {
            return Err(LifecycleError::InvalidStateTransition {
                from: EnvironmentStatus::Running.as_str().to_string(),
                to: EnvironmentStatus::Starting.as_str().to_string(),
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
    let prepared = load_prepared(&db_path.0, &workspace_id)?;
    let satisfied_service_names = if matches!(start_mode, WorkspaceStartMode::Incremental) {
        load_ready_service_names(&db_path.0, &workspace_id)?
    } else {
        HashSet::new()
    };
    let lowered_graph = lower_environment_graph(
        &config,
        prepared,
        service_names.as_deref(),
        Some(&satisfied_service_names),
    )?;
    if matches!(start_mode, WorkspaceStartMode::Incremental)
        && lowered_graph.workspace_prepare.is_empty()
        && lowered_graph.environment_nodes.is_empty()
    {
        return Ok(());
    }

    // Acquire workspace lifecycle lock synchronously to prevent concurrent starts.
    transition_environment_to(&db_path.0, &workspace_id, &EnvironmentStatus::Starting)?;
    emit_environment_status(&app, &workspace_id, EnvironmentStatus::Starting.as_str(), None);

    let db = db_path.0.clone();
    let controller = workspace_controllers.get_or_create(&workspace_id).await;
    let start_token = controller.begin_start().await?;
    let ws_id = workspace_id.clone();
    let requested_service_names = service_names.clone();

    tokio::spawn(async move {
        if let Err(e) = start_environment_lifecycle(
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
            tracing::error!("start_environment failed for {}: {e}", ws_id);
        }
    });

    Ok(())
}

fn sync_workspace_manifest_if_idle(
    db_path: &str,
    workspace_id: &str,
    config: Option<&LifecycleConfig>,
    manifest_fingerprint: Option<&str>,
) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    let status: String = conn
        .query_row(
            "SELECT status FROM environment WHERE workspace_id = ?1",
            params![workspace_id],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(e.to_string()),
        })?;
    drop(conn);

    let workspace_status = EnvironmentStatus::from_str(&status)?;
    if workspace_status != EnvironmentStatus::Idle {
        return Ok(false);
    }

    reconcile_workspace_services_db(
        db_path,
        workspace_id,
        config,
        manifest_fingerprint,
        false,
    )?;
    Ok(true)
}

pub fn sync_workspace_manifest_from_disk_if_idle(
    db_path: &str,
    workspace_id: &str,
) -> Result<bool, LifecycleError> {
    let conn = open_db(db_path)?;
    let (
        worktree_path,
        current_manifest_fingerprint,
        persisted_service_count,
        has_environment,
    ): (
        Option<String>,
        Option<String>,
        usize,
        bool,
    ) = conn
        .query_row(
            "SELECT workspace.worktree_path,
                    workspace.manifest_fingerprint,
                    COUNT(service.id),
                    environment.workspace_id IS NOT NULL
             FROM workspace
             LEFT JOIN environment ON environment.workspace_id = workspace.id
             LEFT JOIN service ON service.environment_id = environment.workspace_id
             WHERE workspace.id = ?1
             GROUP BY workspace.worktree_path, workspace.manifest_fingerprint, environment.workspace_id",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;
    drop(conn);

    if !has_environment {
        return Err(LifecycleError::Database(format!(
            "workspace {workspace_id} is missing required environment row"
        )));
    }

    let Some(worktree_path) = worktree_path else {
        return Ok(false);
    };

    let manifest_path = PathBuf::from(worktree_path).join("lifecycle.json");
    let manifest_text = match std::fs::read_to_string(&manifest_path) {
        Ok(content) => Some(content),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => {
            return Err(LifecycleError::Io(format!(
                "failed to read {}: {}",
                manifest_path.display(),
                error
            )));
        }
    };

    let (config, manifest_fingerprint) = match manifest_text {
        Some(text) => match parse_lifecycle_config_with_fingerprint(&text) {
            Ok((config, fingerprint)) => (Some(config), Some(fingerprint)),
            Err(LifecycleError::ManifestInvalid(_)) => (None, None),
            Err(error) => return Err(error),
        },
        None => (None, None),
    };

    let declared_service_count = config
        .as_ref()
        .map(|manifest| manifest.declared_service_names().len())
        .unwrap_or(0);
    let should_reconcile = match manifest_fingerprint.as_deref() {
        Some(next_manifest_fingerprint) => {
            current_manifest_fingerprint.as_deref() != Some(next_manifest_fingerprint)
                || (declared_service_count > 0 && persisted_service_count == 0)
        }
        None => current_manifest_fingerprint.is_some() || persisted_service_count > 0,
    };

    if !should_reconcile {
        return Ok(false);
    }

    sync_workspace_manifest_if_idle(
        db_path,
        workspace_id,
        config.as_ref(),
        manifest_fingerprint.as_deref(),
    )
}
