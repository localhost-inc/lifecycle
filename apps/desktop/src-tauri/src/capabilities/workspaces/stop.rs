use crate::capabilities::workspaces::state_machine::validate_workspace_transition;
use crate::platform::db::{open_db, DbPath};
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{emit_service_status, emit_workspace_status, update_workspace_status_db};

pub async fn stop_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    let db = db_path.0.clone();

    let service_names = {
        let conn = open_db(&db)?;
        let mut stmt = conn
            .prepare("SELECT service_name FROM workspace_service WHERE workspace_id = ?1")
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        let rows = stmt
            .query_map(params![workspace_id.clone()], |row| row.get::<_, String>(0))
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        let mut names = Vec::new();
        for row in rows {
            names.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
        }
        names
    };

    // Transition into stopping before mutating runtime state so the UI can reflect shutdown work.
    let current_status = {
        let conn = open_db(&db)?;
        let status: String = conn
            .query_row(
                "SELECT status FROM workspace WHERE id = ?1",
                params![workspace_id.clone()],
                |row| row.get(0),
            )
            .map_err(|e| LifecycleError::Database(e.to_string()))?;
        WorkspaceStatus::from_str(&status)?
    };
    validate_workspace_transition(&current_status, &WorkspaceStatus::Stopping)?;

    update_workspace_status_db(&db, &workspace_id, &WorkspaceStatus::Stopping, None)?;
    emit_workspace_status(&app, &workspace_id, "stopping", None);

    // Stop all services after the stopping transition is visible to DB- and UI-based callers.
    if let Some(controller) = workspace_controllers.get(&workspace_id).await {
        controller.request_stop().await;
        controller.stop_runtime().await;
    }

    // Update service statuses
    {
        let conn = open_db(&db)?;
        conn.execute(
            "UPDATE workspace_service
             SET status = 'stopped',
                 status_reason = NULL,
                 assigned_port = NULL,
                 updated_at = datetime('now')
             WHERE workspace_id = ?1",
            params![workspace_id.clone()],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    for service_name in service_names {
        emit_service_status(&app, &workspace_id, &service_name, "stopped", None);
    }

    update_workspace_status_db(&db, &workspace_id, &WorkspaceStatus::Idle, None)?;
    emit_workspace_status(&app, &workspace_id, "idle", None);

    Ok(())
}
