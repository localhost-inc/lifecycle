use super::preview::preview_fields_for_service;
use super::query::ServiceRecord;
use super::shared::emit_service_configuration;
use crate::platform::db::open_db;
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use rusqlite::params;
use tauri::AppHandle;

fn load_workspace_service_record(
    db_path: &str,
    workspace_id: &str,
    service_name: &str,
) -> Result<ServiceRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.query_row(
        "SELECT id, workspace_id, service_name, exposure, port_override, status, status_reason, assigned_port, preview_status, preview_failure_reason, preview_url, created_at, updated_at
         FROM workspace_service
         WHERE workspace_id = ?1 AND service_name = ?2",
        params![workspace_id, service_name],
        |row| {
            Ok(ServiceRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                service_name: row.get(2)?,
                exposure: row.get(3)?,
                port_override: row.get(4)?,
                status: row.get(5)?,
                status_reason: row.get(6)?,
                assigned_port: row.get(7)?,
                preview_status: row.get(8)?,
                preview_failure_reason: row.get(9)?,
                preview_url: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        },
    )
    .map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => LifecycleError::InvalidInput {
            field: "service_name".to_string(),
            reason: format!("unknown service '{service_name}'"),
        },
        _ => LifecycleError::Database(error.to_string()),
    })
}

fn normalize_exposure(exposure: String) -> Result<String, LifecycleError> {
    let normalized = exposure.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "internal" | "local" | "organization" => Ok(normalized),
        _ => Err(LifecycleError::InvalidInput {
            field: "exposure".to_string(),
            reason: "expected one of internal, local, or organization".to_string(),
        }),
    }
}

fn normalize_port_override(port_override: Option<i64>) -> Result<Option<i64>, LifecycleError> {
    match port_override {
        Some(port) if !(1..=65535).contains(&port) => Err(LifecycleError::InvalidInput {
            field: "port_override".to_string(),
            reason: "must be between 1 and 65535".to_string(),
        }),
        _ => Ok(port_override),
    }
}

fn validate_mutable_workspace_status(status: &WorkspaceStatus) -> Result<(), LifecycleError> {
    if matches!(status, WorkspaceStatus::Idle | WorkspaceStatus::Active) {
        Ok(())
    } else {
        Err(LifecycleError::WorkspaceMutationLocked {
            status: status.as_str().to_string(),
        })
    }
}

pub async fn update_workspace_service(
    app: Option<&AppHandle>,
    db_path: &str,
    workspace_id: String,
    service_name: String,
    exposure: String,
    port_override: Option<i64>,
) -> Result<ServiceRecord, LifecycleError> {
    let exposure = normalize_exposure(exposure)?;
    let port_override = normalize_port_override(port_override)?;
    let mut conn = open_db(db_path)?;
    let tx = conn
        .transaction()
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let workspace_status = tx
        .query_row(
            "SELECT status FROM workspace WHERE id = ?1",
            params![&workspace_id],
            |row| row.get::<_, String>(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.clone())
            }
            _ => LifecycleError::Database(error.to_string()),
        })
        .and_then(|status| WorkspaceStatus::from_str(&status))?;
    validate_mutable_workspace_status(&workspace_status)?;

    let (current_assigned_port, service_status) = tx
        .query_row(
            "SELECT assigned_port, status FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
            params![&workspace_id, &service_name],
            |row| {
                Ok((
                    row.get::<_, Option<i64>>(0)?,
                    row.get::<_, String>(1)?,
                ))
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => LifecycleError::InvalidInput {
                field: "service_name".to_string(),
                reason: format!("unknown service '{service_name}'"),
            },
            _ => LifecycleError::Database(error.to_string()),
        })?;

    let assigned_port = if workspace_status == WorkspaceStatus::Active
        && matches!(service_status.as_str(), "ready" | "starting")
    {
        current_assigned_port
    } else {
        None
    };
    let (preview_status, preview_failure_reason, preview_url) = preview_fields_for_service(
        &tx,
        &workspace_id,
        &service_name,
        &exposure,
        assigned_port,
        &service_status,
        &workspace_status,
    )?;

    tx.execute(
        "UPDATE workspace_service
         SET exposure = ?1,
             port_override = ?2,
             assigned_port = ?3,
             preview_status = ?4,
             preview_failure_reason = ?5,
             preview_url = ?6,
             updated_at = datetime('now')
         WHERE workspace_id = ?7 AND service_name = ?8",
        params![
            exposure,
            port_override,
            assigned_port,
            preview_status,
            preview_failure_reason,
            preview_url,
            &workspace_id,
            &service_name,
        ],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    tx.commit()
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let service = load_workspace_service_record(db_path, &workspace_id, &service_name)?;
    if let Some(app) = app {
        emit_service_configuration(app, &workspace_id, &service);
    }

    Ok(service)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capabilities::workspaces::test_support::available_test_port;
    use crate::platform::db::open_db;
    use crate::platform::git::worktree::{short_workspace_id, slugify_workspace_name};
    use crate::platform::preview_proxy::{local_preview_url, workspace_host_label};

    fn temp_db_path() -> String {
        format!(
            "{}/lifecycle-service-{}.sqlite",
            std::env::temp_dir().display(),
            uuid::Uuid::new_v4()
        )
    }

    fn init_workspace_tables(db_path: &str) {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "
            CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL
            );
            CREATE TABLE workspace_service (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                service_name TEXT NOT NULL,
                exposure TEXT NOT NULL DEFAULT 'local',
                port_override INTEGER,
                status TEXT NOT NULL,
                status_reason TEXT,
                assigned_port INTEGER,
                preview_status TEXT NOT NULL DEFAULT 'disabled',
                preview_failure_reason TEXT,
                preview_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT
            );
            ",
        )
        .expect("create tables");
    }

    fn managed_workspace_identity(workspace_id: &str) -> (String, String, String) {
        let name = workspace_id.replace('_', " ");
        let source_ref = format!(
            "lifecycle/{}-{}",
            slugify_workspace_name(&name),
            short_workspace_id(workspace_id)
        );
        let label = workspace_host_label(workspace_id, "managed", &name, &source_ref);
        (name, source_ref, label)
    }

    #[tokio::test]
    async fn update_workspace_service_updates_idle_configuration_without_assigning_runtime_port() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let override_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, preview_label) = managed_workspace_identity("ws_1");
        conn.execute(
            "INSERT INTO workspace (id, status, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["ws_1", "idle", "managed", name, source_ref],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, assigned_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                "svc_1",
                "ws_1",
                "web",
                "local",
                Option::<i64>::None,
                "stopped",
                Option::<i64>::None,
                Some(local_preview_url(&preview_label, "web")),
            ],
        )
        .expect("insert service");
        drop(conn);

        update_workspace_service(
            None,
            &db_path,
            "ws_1".to_string(),
            "web".to_string(),
            "internal".to_string(),
            Some(override_port),
        )
        .await
        .expect("update service");

        let conn = open_db(&db_path).expect("re-open db");
        let row = conn
            .query_row(
                "SELECT exposure, port_override, assigned_port, preview_status, preview_failure_reason, preview_url FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                params!["ws_1", "web"],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .expect("query service");

        assert_eq!(
            row,
            (
                "internal".to_string(),
                Some(override_port),
                Option::<i64>::None,
                "disabled".to_string(),
                Option::<String>::None,
                Option::<String>::None,
            ),
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn update_workspace_service_clears_idle_runtime_port_when_override_is_cleared() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);
        let override_port = available_test_port();

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, preview_label) = managed_workspace_identity("ws_2");
        conn.execute(
            "INSERT INTO workspace (id, status, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["ws_2", "idle", "managed", name, source_ref],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, assigned_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                "svc_2",
                "ws_2",
                "api",
                "local",
                Some(override_port),
                "failed",
                Some(override_port),
                Some(local_preview_url(&preview_label, "api")),
            ],
        )
        .expect("insert service");
        drop(conn);

        update_workspace_service(
            None,
            &db_path,
            "ws_2".to_string(),
            "api".to_string(),
            "local".to_string(),
            None,
        )
        .await
        .expect("clear override");

        let conn = open_db(&db_path).expect("re-open db");
        let row = conn
            .query_row(
                "SELECT exposure, port_override, assigned_port, preview_status, preview_failure_reason, preview_url FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                params!["ws_2", "api"],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, Option<i64>>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, Option<String>>(4)?,
                        row.get::<_, Option<String>>(5)?,
                    ))
                },
            )
            .expect("query service");

        assert_eq!(
            row,
            (
                "local".to_string(),
                Option::<i64>::None,
                Option::<i64>::None,
                "failed".to_string(),
                Some("service_unreachable".to_string()),
                Some(local_preview_url(&preview_label, "api")),
            ),
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn update_workspace_service_rejects_locked_workspace_status() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, preview_label) = managed_workspace_identity("ws_3");
        conn.execute(
            "INSERT INTO workspace (id, status, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4, ?5)",
            params!["ws_3", "starting", "managed", name, source_ref],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, assigned_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                "svc_3",
                "ws_3",
                "web",
                "local",
                Option::<i64>::None,
                "starting",
                Some(3000_i64),
                Some(local_preview_url(&preview_label, "web")),
            ],
        )
        .expect("insert service");
        drop(conn);

        let error = update_workspace_service(
            None,
            &db_path,
            "ws_3".to_string(),
            "web".to_string(),
            "local".to_string(),
            Some(4200),
        )
        .await
        .expect_err("expected lock error");

        assert!(matches!(
            error,
            LifecycleError::WorkspaceMutationLocked { status } if status == "starting"
        ));

        let _ = std::fs::remove_file(db_path);
    }
}
