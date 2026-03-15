use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use rusqlite::params;

pub(crate) const LOCAL_PREVIEW_HOST: &str = "127.0.0.1";

fn local_preview_url(exposure: &str, effective_port: Option<i64>) -> Option<String> {
    if exposure == "local" {
        effective_port.map(|port| format!("http://{LOCAL_PREVIEW_HOST}:{port}"))
    } else {
        None
    }
}

fn preview_status_for_service(
    exposure: &str,
    effective_port: Option<i64>,
    service_status: &str,
    workspace_status: &WorkspaceStatus,
) -> &'static str {
    if exposure != "local" || effective_port.is_none() {
        return "disabled";
    }

    if service_status == "failed" {
        return "failed";
    }

    if matches!(
        workspace_status,
        WorkspaceStatus::Idle | WorkspaceStatus::Stopping
    ) {
        return "sleeping";
    }

    if service_status == "ready" {
        return "ready";
    }

    if service_status == "starting" || *workspace_status == WorkspaceStatus::Starting {
        return "provisioning";
    }

    "disabled"
}

fn preview_failure_reason_for_status(preview_status: &str) -> Option<&'static str> {
    if preview_status == "failed" {
        Some("service_unreachable")
    } else {
        None
    }
}

pub(crate) fn preview_fields_for_service(
    exposure: &str,
    effective_port: Option<i64>,
    service_status: &str,
    workspace_status: &WorkspaceStatus,
) -> (String, Option<String>, Option<String>) {
    let preview_status =
        preview_status_for_service(exposure, effective_port, service_status, workspace_status);
    (
        preview_status.to_string(),
        preview_failure_reason_for_status(preview_status).map(str::to_string),
        local_preview_url(exposure, effective_port),
    )
}

pub(crate) fn refresh_workspace_preview_rows(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    workspace_status: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT service_name, exposure, effective_port, status
             FROM workspace_service
             WHERE workspace_id = ?1",
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| LifecycleError::Database(e.to_string()))?;

    let mut services = Vec::new();
    for row in rows {
        services.push(row.map_err(|e| LifecycleError::Database(e.to_string()))?);
    }
    drop(stmt);

    for (service_name, exposure, effective_port, service_status) in services {
        let (preview_status, preview_failure_reason, preview_url) = preview_fields_for_service(
            &exposure,
            effective_port,
            &service_status,
            workspace_status,
        );
        conn.execute(
            "UPDATE workspace_service
             SET preview_status = ?1,
                 preview_failure_reason = ?2,
                 preview_url = ?3,
                 updated_at = datetime('now')
             WHERE workspace_id = ?4 AND service_name = ?5",
            params![
                preview_status,
                preview_failure_reason,
                preview_url,
                workspace_id,
                service_name,
            ],
        )
        .map_err(|e| LifecycleError::Database(e.to_string()))?;
    }

    Ok(())
}
