use crate::capabilities::workspaces::state_machine::validate_workspace_transition;
use crate::platform::db::{open_db, DbPath};
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use crate::SupervisorMap;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::shared::{emit_service_status, emit_workspace_status, update_workspace_status_db};

pub async fn stop_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    supervisors: State<'_, SupervisorMap>,
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

    // Get current status and validate transition to sleeping before mutating runtime state.
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
    validate_workspace_transition(&current_status, &WorkspaceStatus::Sleeping)?;

    // Stop all services
    {
        let mut sups = supervisors.lock().await;
        if let Some(mut sup) = sups.remove(&workspace_id) {
            sup.stop_all().await;
        }
    }

    // Update service statuses
    {
        let conn = open_db(&db)?;
        conn.execute(
            "UPDATE workspace_service SET status = 'stopped', status_reason = NULL, updated_at = datetime('now') WHERE workspace_id = ?1",
            params![workspace_id.clone()],
        ).map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    for service_name in service_names {
        emit_service_status(&app, &workspace_id, &service_name, "stopped", None);
    }

    update_workspace_status_db(&db, &workspace_id, &WorkspaceStatus::Sleeping, None)?;
    emit_workspace_status(&app, &workspace_id, "sleeping", None);

    Ok(())
}
