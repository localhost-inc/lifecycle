use super::shared::preview_fields_for_service;
use crate::platform::db::open_db;
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use rusqlite::params;

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
    if matches!(
        status,
        WorkspaceStatus::Ready | WorkspaceStatus::Sleeping | WorkspaceStatus::Failed
    ) {
        Ok(())
    } else {
        Err(LifecycleError::WorkspaceMutationLocked {
            status: status.as_str().to_string(),
        })
    }
}

pub async fn update_workspace_service(
    db_path: &str,
    workspace_id: String,
    service_name: String,
    exposure: String,
    port_override: Option<i64>,
) -> Result<(), LifecycleError> {
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

    let (default_port, service_status) = tx
        .query_row(
            "SELECT default_port, status FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
            params![&workspace_id, &service_name],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => LifecycleError::InvalidInput {
                field: "service_name".to_string(),
                reason: format!("unknown service '{service_name}'"),
            },
            _ => LifecycleError::Database(error.to_string()),
        })?;

    let effective_port = port_override.or(default_port);
    let (preview_state, preview_failure_reason, preview_url) = preview_fields_for_service(
        &exposure,
        effective_port,
        &service_status,
        &workspace_status,
    );

    tx.execute(
        "UPDATE workspace_service
         SET exposure = ?1,
             port_override = ?2,
             effective_port = ?3,
             preview_state = ?4,
             preview_failure_reason = ?5,
             preview_url = ?6,
             updated_at = datetime('now')
         WHERE workspace_id = ?7 AND service_name = ?8",
        params![
            exposure,
            port_override,
            effective_port,
            preview_state,
            preview_failure_reason,
            preview_url,
            &workspace_id,
            &service_name,
        ],
    )
    .map_err(|error| LifecycleError::Database(error.to_string()))?;

    tx.commit()
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::open_db;

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
                status TEXT NOT NULL
            );
            CREATE TABLE workspace_service (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
                service_name TEXT NOT NULL,
                exposure TEXT NOT NULL DEFAULT 'local',
                port_override INTEGER,
                status TEXT NOT NULL,
                default_port INTEGER,
                effective_port INTEGER,
                preview_state TEXT NOT NULL DEFAULT 'disabled',
                preview_failure_reason TEXT,
                preview_url TEXT,
                updated_at TEXT
            );
            ",
        )
        .expect("create tables");
    }

    #[tokio::test]
    async fn update_workspace_service_updates_effective_port_and_preview_url() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status) VALUES (?1, ?2)",
            params!["ws_1", "sleeping"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, default_port, effective_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            params![
                "svc_1",
                "ws_1",
                "web",
                "local",
                Option::<i64>::None,
                "stopped",
                Some(3000_i64),
                Some(3000_i64),
                Some("http://localhost:3000"),
            ],
        )
        .expect("insert service");
        drop(conn);

        update_workspace_service(
            &db_path,
            "ws_1".to_string(),
            "web".to_string(),
            "internal".to_string(),
            Some(4310),
        )
        .await
        .expect("update service");

        let conn = open_db(&db_path).expect("re-open db");
        let row = conn
            .query_row(
                "SELECT exposure, port_override, effective_port, preview_state, preview_failure_reason, preview_url FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
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
                Some(4310),
                Some(4310),
                "disabled".to_string(),
                Option::<String>::None,
                Option::<String>::None,
            ),
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn update_workspace_service_restores_manifest_port_when_override_is_cleared() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status) VALUES (?1, ?2)",
            params!["ws_2", "failed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, default_port, effective_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            params![
                "svc_2",
                "ws_2",
                "api",
                "local",
                Some(4310_i64),
                "failed",
                Some(3000_i64),
                Some(4310_i64),
                Some("http://localhost:4310"),
            ],
        )
        .expect("insert service");
        drop(conn);

        update_workspace_service(
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
                "SELECT exposure, port_override, effective_port, preview_state, preview_failure_reason, preview_url FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
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
                Some(3000),
                "failed".to_string(),
                Some("service_unreachable".to_string()),
                Some("http://localhost:3000".to_string()),
            ),
        );

        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn update_workspace_service_rejects_locked_workspace_status() {
        let db_path = temp_db_path();
        init_workspace_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        conn.execute(
            "INSERT INTO workspace (id, status) VALUES (?1, ?2)",
            params!["ws_3", "starting"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, port_override, status, default_port, effective_port, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))",
            params![
                "svc_3",
                "ws_3",
                "web",
                "local",
                Option::<i64>::None,
                "starting",
                Some(3000_i64),
                Some(3000_i64),
                Some("http://localhost:3000"),
            ],
        )
        .expect("insert service");
        drop(conn);

        let error = update_workspace_service(
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
