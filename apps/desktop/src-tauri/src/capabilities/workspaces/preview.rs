use crate::platform::{db::open_db, preview_proxy};
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use rusqlite::params;

fn workspace_preview_label(
    conn: &rusqlite::Connection,
    workspace_id: &str,
) -> Result<String, LifecycleError> {
    let (kind, name, source_ref): (String, String, String) = conn
        .query_row(
            "SELECT kind, name, source_ref FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    Ok(preview_proxy::workspace_host_label(
        workspace_id,
        &kind,
        &name,
        &source_ref,
    ))
}

fn local_preview_url(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
    exposure: &str,
) -> Result<Option<String>, LifecycleError> {
    if exposure == "local" {
        let workspace_label = workspace_preview_label(conn, workspace_id)?;
        Ok(Some(preview_proxy::local_preview_url(
            &workspace_label,
            service_name,
        )))
    } else {
        Ok(None)
    }
}

fn preview_status_for_service(
    exposure: &str,
    assigned_port: Option<i64>,
    service_status: &str,
    workspace_status: &WorkspaceStatus,
) -> &'static str {
    if exposure != "local" {
        return "disabled";
    }

    if service_status == "failed" {
        return "failed";
    }

    if service_status == "ready" && assigned_port.is_some() {
        return "ready";
    }

    if service_status == "starting" || *workspace_status == WorkspaceStatus::Starting {
        return "provisioning";
    }

    if matches!(
        workspace_status,
        WorkspaceStatus::Idle | WorkspaceStatus::Stopping
    ) {
        return "sleeping";
    }

    if service_status == "stopped" {
        return "sleeping";
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
    conn: &rusqlite::Connection,
    workspace_id: &str,
    service_name: &str,
    exposure: &str,
    assigned_port: Option<i64>,
    service_status: &str,
    workspace_status: &WorkspaceStatus,
) -> Result<(String, Option<String>, Option<String>), LifecycleError> {
    let preview_status =
        preview_status_for_service(exposure, assigned_port, service_status, workspace_status);
    Ok((
        preview_status.to_string(),
        preview_failure_reason_for_status(preview_status).map(str::to_string),
        local_preview_url(conn, workspace_id, service_name, exposure)?,
    ))
}

pub(crate) fn refresh_workspace_preview_rows(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    workspace_status: &WorkspaceStatus,
) -> Result<(), LifecycleError> {
    let mut stmt = conn
        .prepare(
            "SELECT service_name, exposure, assigned_port, status
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

    for (service_name, exposure, assigned_port, service_status) in services {
        let (preview_status, preview_failure_reason, preview_url) =
            preview_fields_for_service(
                conn,
                workspace_id,
                &service_name,
                &exposure,
                assigned_port,
                &service_status,
                workspace_status,
            )?;
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

pub(crate) fn refresh_all_workspace_preview_rows(db_path: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare("SELECT id, status FROM workspace")
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut workspaces = Vec::new();
    for row in rows {
        workspaces.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }
    drop(stmt);

    for (workspace_id, raw_status) in workspaces {
        let workspace_status = WorkspaceStatus::from_str(&raw_status)?;
        refresh_workspace_preview_rows(&conn, &workspace_id, &workspace_status)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::open_db;

    fn temp_db_path() -> String {
        format!(
            "{}/lifecycle-preview-fields-{}.sqlite",
            std::env::temp_dir().display(),
            uuid::Uuid::new_v4()
        )
    }

    fn init_workspace_table(db_path: &str) -> rusqlite::Connection {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL
            );",
        )
        .expect("create workspace table");
        conn
    }

    #[test]
    fn preview_fields_use_stable_proxy_url_for_local_services() {
        let db_path = temp_db_path();
        let conn = init_workspace_table(&db_path);
        let workspace_label =
            preview_proxy::workspace_host_label("ws_preview", "managed", "Frost beacon", "lifecycle/frost-beacon-wsprevie");
        conn.execute(
            "INSERT INTO workspace (id, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_preview", "managed", "Frost beacon", "lifecycle/frost-beacon-wsprevie"],
        )
        .expect("insert workspace");

        let fields = preview_fields_for_service(
            &conn,
            "ws_preview",
            "www",
            "local",
            Some(3000),
            "ready",
            &WorkspaceStatus::Active,
        )
        .expect("preview fields");

        assert_eq!(fields.0, "ready");
        assert_eq!(fields.1, None);
        assert_eq!(
            fields.2,
            Some(preview_proxy::local_preview_url(&workspace_label, "www"))
        );
    }

    #[test]
    fn preview_fields_keep_stable_local_url_while_service_is_sleeping() {
        let db_path = temp_db_path();
        let conn = init_workspace_table(&db_path);
        let workspace_label =
            preview_proxy::workspace_host_label("ws_preview", "managed", "Frost beacon", "lifecycle/frost-beacon-wsprevie");
        conn.execute(
            "INSERT INTO workspace (id, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_preview", "managed", "Frost beacon", "lifecycle/frost-beacon-wsprevie"],
        )
        .expect("insert workspace");

        let fields = preview_fields_for_service(
            &conn,
            "ws_preview",
            "www",
            "local",
            None,
            "stopped",
            &WorkspaceStatus::Idle,
        )
        .expect("preview fields");

        assert_eq!(fields.0, "sleeping");
        assert_eq!(fields.1, None);
        assert_eq!(
            fields.2,
            Some(preview_proxy::local_preview_url(&workspace_label, "www"))
        );
    }

    #[test]
    fn preview_fields_disable_preview_for_internal_services() {
        let db_path = temp_db_path();
        let conn = init_workspace_table(&db_path);
        conn.execute(
            "INSERT INTO workspace (id, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_preview", "managed", "Frost beacon", "lifecycle/frost-beacon-wsprevie"],
        )
        .expect("insert workspace");

        let fields = preview_fields_for_service(
            &conn,
            "ws_preview",
            "worker",
            "internal",
            Some(4100),
            "ready",
            &WorkspaceStatus::Active,
        )
        .expect("preview fields");

        assert_eq!(fields.0, "disabled");
        assert_eq!(fields.1, None);
        assert_eq!(fields.2, None);
    }
}
