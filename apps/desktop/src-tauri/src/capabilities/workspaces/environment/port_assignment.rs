use crate::capabilities::workspaces::manifest::{LifecycleConfig, ServiceConfig};
use crate::platform::db::open_db;
use crate::shared::errors::LifecycleError;
use rusqlite::params;

use super::super::ports::resolve_assigned_port;

fn set_port_env(env: &mut Option<std::collections::HashMap<String, String>>, port: u16) {
    let vars = env.get_or_insert_with(std::collections::HashMap::new);
    vars.insert("PORT".to_string(), port.to_string());
}

fn apply_assigned_port(service: &mut ServiceConfig, port: u16) {
    match service {
        ServiceConfig::Process(process) => {
            set_port_env(&mut process.env, port);
        }
        ServiceConfig::Image(image) => {
            image.resolved_port = Some(port);
        }
    }
}

pub(super) fn config_with_assigned_ports(
    db_path: &str,
    workspace_id: &str,
    config: &LifecycleConfig,
) -> Result<LifecycleConfig, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn
        .prepare("SELECT name, assigned_port FROM service WHERE environment_id = ?1")
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let mut next = config.clone();
    for row in rows {
        let (name, assigned_port) =
            row.map_err(|error| LifecycleError::Database(error.to_string()))?;
        eprintln!("[lifecycle:assigned_ports] service={name} assigned_port={assigned_port:?}");
        let Some(assigned_port) = assigned_port else {
            continue;
        };
        let Ok(assigned_port) = u16::try_from(assigned_port) else {
            continue;
        };
        let Some(service) = next.service_mut(&name) else {
            eprintln!("[lifecycle:assigned_ports] service_mut returned None for {name}");
            continue;
        };
        apply_assigned_port(service, assigned_port);
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

    for name in service_names {
        if !config
            .declared_services()
            .any(|(declared_name, _)| declared_name == name)
        {
            continue;
        }

        let (service_status, current_assigned_port) = tx
            .query_row(
                "SELECT status, assigned_port
                 FROM service
                 WHERE environment_id = ?1 AND name = ?2",
                params![workspace_id, name],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, Option<i64>>(1)?,
                    ))
                },
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;
        let assigned_port = resolve_assigned_port(
            &tx,
            workspace_id,
            name,
            current_assigned_port,
            matches!(service_status.as_str(), "ready" | "starting"),
        )?;

        tx.execute(
            "UPDATE service
             SET assigned_port = ?1,
                 updated_at = datetime('now')
             WHERE environment_id = ?2 AND name = ?3",
            params![Some(assigned_port), workspace_id, name],
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
    use crate::platform::preview_proxy::workspace_host_label;

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
            "CREATE TABLE service (
                id TEXT PRIMARY KEY NOT NULL,
                environment_id TEXT NOT NULL,
                name TEXT NOT NULL,
                status TEXT NOT NULL,
                status_reason TEXT,
                assigned_port INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT
            );",
        )
        .expect("create service");
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
        let (name, source_ref, _workspace_label) = managed_workspace_identity("ws_start");
        conn.execute(
            "INSERT INTO workspace (id, name, source_ref, kind) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_start", name, source_ref, "managed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, NULL, datetime('now'))",
            params!["svc_web", "ws_start", "web", "stopped"],
        )
        .expect("insert service");
        drop(conn);

        let config_json = r#"{
                "workspace": { "prepare": [] },
                "environment": {
                    "web": { "kind": "service", "runtime": "process", "command": "bun run dev" }
                }
            }"#;
        let config = serde_json::from_str::<LifecycleConfig>(&config_json).expect("valid config");

        assign_ports_for_start(&db_path, "ws_start", &config, &["web".to_string()])
            .expect("assign ports");

        let conn = open_db(&db_path).expect("re-open db");
        let assigned_port: Option<i64> = conn
            .query_row(
                "SELECT assigned_port
                 FROM service
                 WHERE environment_id = ?1 AND name = ?2",
                params!["ws_start", "web"],
                |row| row.get(0),
            )
            .expect("query service");
        assert!(assigned_port.is_some());

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
        let (name, source_ref, _workspace_label) = managed_workspace_identity("ws_start");
        conn.execute(
            "INSERT INTO workspace (id, name, source_ref, kind) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_start", name, source_ref, "managed"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (
                id, environment_id, name, status, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, NULL, datetime('now'))",
            params!["svc_api", "ws_start", "api", "stopped"],
        )
        .expect("insert service");
        drop(conn);

        let config_json = r#"{
                "workspace": { "prepare": [] },
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
                "SELECT assigned_port FROM service WHERE environment_id = ?1 AND name = ?2",
                params!["ws_start", "api"],
                |row| row.get(0),
            )
            .expect("query service");
        assert!(matches!(assigned_port, Some(port) if port != occupied_port));

        drop(guard);
        let _ = std::fs::remove_file(db_path);
    }
}
