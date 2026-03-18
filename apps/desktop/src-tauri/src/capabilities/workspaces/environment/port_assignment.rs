use crate::capabilities::workspaces::manifest::{LifecycleConfig, ServiceConfig};
use crate::platform::db::open_db;
use crate::shared::errors::{LifecycleError, WorkspaceStatus};
use rusqlite::params;

use super::super::ports::resolve_assigned_port;
use super::super::preview::preview_fields_for_service;

fn set_port_env(env: &mut Option<std::collections::HashMap<String, String>>, port: u16) {
    let vars = env.get_or_insert_with(std::collections::HashMap::new);
    vars.insert("PORT".to_string(), port.to_string());
}

pub(super) fn apply_port_override(service: &mut ServiceConfig, override_port: u16) {
    match service {
        ServiceConfig::Process(process) => {
            set_port_env(&mut process.env, override_port);
        }
        ServiceConfig::Image(image) => {
            image.resolved_port = Some(override_port);
        }
    }
}

pub(super) fn config_with_workspace_overrides(
    db_path: &str,
    workspace_id: &str,
    config: &LifecycleConfig,
) -> Result<LifecycleConfig, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare(
            "SELECT service_name, assigned_port FROM workspace_service WHERE workspace_id = ?1",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut next = config.clone();
    for row in rows {
        let (service_name, assigned_port) =
            row.map_err(|error| LifecycleError::Database(error.to_string()))?;
        eprintln!(
            "[lifecycle:config_overrides] service={service_name} assigned_port={assigned_port:?}"
        );
        let Some(assigned_port) = assigned_port else {
            continue;
        };
        let Ok(assigned_port) = u16::try_from(assigned_port) else {
            continue;
        };
        let Some(service) = next.service_mut(&service_name) else {
            eprintln!("[lifecycle:config_overrides] service_mut returned None for {service_name}");
            continue;
        };
        apply_port_override(service, assigned_port);
    }

    Ok(next)
}

pub(super) fn assign_ports_for_start(
    db_path: &str,
    workspace_id: &str,
    config: &LifecycleConfig,
    service_names: &[String],
) -> Result<(), LifecycleError> {
    if service_names.is_empty() {
        return Ok(());
    }

    let mut conn = open_db(db_path)?;
    let tx = conn
        .transaction()
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    for service_name in service_names {
        if !config
            .declared_services()
            .any(|(name, _)| name == service_name)
        {
            continue;
        }

        let (exposure, port_override, service_status, current_assigned_port) = tx
            .query_row(
                "SELECT exposure, port_override, status, assigned_port
                 FROM workspace_service
                 WHERE workspace_id = ?1 AND service_name = ?2",
                params![workspace_id, service_name],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                    ))
                },
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
        let assigned_port = resolve_assigned_port(
            &tx,
            workspace_id,
            service_name,
            port_override,
            current_assigned_port,
            matches!(service_status.as_str(), "ready" | "starting"),
        )?;
        let (preview_status, preview_failure_reason, preview_url) = preview_fields_for_service(
            &tx,
            workspace_id,
            service_name,
            &exposure,
            Some(assigned_port),
            &service_status,
            &WorkspaceStatus::Starting,
        )?;

        tx.execute(
            "UPDATE workspace_service
             SET assigned_port = ?1,
                 preview_status = ?2,
                 preview_failure_reason = ?3,
                 preview_url = ?4,
                 updated_at = datetime('now')
             WHERE workspace_id = ?5 AND service_name = ?6",
            params![
                Some(assigned_port),
                preview_status,
                preview_failure_reason,
                preview_url,
                workspace_id,
                service_name,
            ],
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    }

    tx.commit()
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::open_db;
    use crate::platform::git::worktree::{short_workspace_id, slugify_workspace_name};
    use crate::platform::preview_proxy::{local_preview_url, workspace_host_label};

    fn temp_db_path() -> String {
        format!(
            "{}/lifecycle-start-{}.sqlite",
            std::env::temp_dir().display(),
            uuid::Uuid::new_v4()
        )
    }

    fn init_workspace_service_tables(db_path: &str) {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace_service (
                id TEXT PRIMARY KEY NOT NULL,
                workspace_id TEXT NOT NULL,
                service_name TEXT NOT NULL,
                exposure TEXT NOT NULL,
                port_override INTEGER,
                status TEXT NOT NULL,
                status_reason TEXT,
                assigned_port INTEGER,
                preview_status TEXT NOT NULL,
                preview_failure_reason TEXT,
                preview_url TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT
            );",
        )
        .expect("create workspace_service");
    }

    fn init_workspace_table(db_path: &str) {
        let conn = open_db(db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                kind TEXT NOT NULL
            );",
        )
        .expect("create workspace");
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

    #[test]
    fn assign_ports_for_start_assigns_runtime_port_at_start() {
        let db_path = temp_db_path();
        init_workspace_table(&db_path);
        init_workspace_service_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, preview_label) = managed_workspace_identity("ws_start");
        conn.execute(
            "INSERT INTO workspace (id, name, source_ref, kind) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_start", name, source_ref, "managed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status,
                assigned_port, preview_status, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, datetime('now'))",
            params![
                "svc_web",
                "ws_start",
                "web",
                "local",
                "stopped",
                "sleeping",
                Some(local_preview_url(&preview_label, "web")),
            ],
        )
        .expect("insert service");
        drop(conn);

        let config_json = r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "web": { "kind": "service", "runtime": "process", "command": "bun run dev" }
                }
            }"#;
        let config = serde_json::from_str::<LifecycleConfig>(&config_json).expect("valid config");

        assign_ports_for_start(&db_path, "ws_start", &config, &["web".to_string()])
            .expect("assign ports");

        let conn = open_db(&db_path).expect("re-open db");
        let row: (Option<i64>, String, Option<String>) = conn
            .query_row(
                "SELECT assigned_port, preview_status, preview_url
                 FROM workspace_service
                 WHERE workspace_id = ?1 AND service_name = ?2",
                params!["ws_start", "web"],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("query service");
        assert!(row.0.is_some());
        assert_eq!(row.1, "provisioning");
        assert_eq!(row.2, Some(local_preview_url(&preview_label, "web")));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn assign_ports_for_start_picks_a_new_port_when_default_is_unavailable() {
        let db_path = temp_db_path();
        init_workspace_table(&db_path);
        init_workspace_service_tables(&db_path);
        let guard = std::net::TcpListener::bind(("127.0.0.1", 0)).expect("bind port");
        let occupied_port = i64::from(guard.local_addr().expect("local addr").port());

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, preview_label) = managed_workspace_identity("ws_start");
        conn.execute(
            "INSERT INTO workspace (id, name, source_ref, kind) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_start", name, source_ref, "managed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (
                id, workspace_id, service_name, exposure, status,
                assigned_port, preview_status, preview_url, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6, ?7, datetime('now'))",
            params![
                "svc_api",
                "ws_start",
                "api",
                "local",
                "stopped",
                "sleeping",
                Some(local_preview_url(&preview_label, "api")),
            ],
        )
        .expect("insert service");
        drop(conn);

        let config_json = r#"{
                "workspace": { "setup": [] },
                "environment": {
                    "api": { "kind": "service", "runtime": "process", "command": "bun run api" }
                }
            }"#;
        let config = serde_json::from_str::<LifecycleConfig>(&config_json).expect("valid config");

        assign_ports_for_start(&db_path, "ws_start", &config, &["api".to_string()])
            .expect("assign ports");

        let conn = open_db(&db_path).expect("re-open db");
        let assigned_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port FROM workspace_service WHERE workspace_id = ?1 AND service_name = ?2",
                params!["ws_start", "api"],
                |row| row.get(0),
            )
            .expect("query service");
        assert!(matches!(assigned_port, Some(port) if port != occupied_port));

        drop(guard);
        let _ = std::fs::remove_file(db_path);
    }
}
