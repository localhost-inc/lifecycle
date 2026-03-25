use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::platform::db::open_db;
use crate::platform::preview_proxy;
use crate::shared::errors::LifecycleError;
use rusqlite::params;

pub(super) fn uppercase_env_key(value: &str) -> String {
    let mut result = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_uppercase());
            last_was_separator = false;
        } else if !last_was_separator {
            result.push('_');
            last_was_separator = true;
        }
    }

    result.trim_matches('_').to_string()
}

pub(super) fn slugify_workspace_value(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_separator = false;
        } else if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    slug.trim_matches('-').to_string()
}

pub(crate) fn build_runtime_env(
    db_path: &str,
    workspace_id: &str,
    worktree_path: &str,
) -> Result<HashMap<String, String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let (workspace_name, source_ref, workspace_checkout_type): (String, String, String) = conn
        .query_row(
            "SELECT name, source_ref, checkout_type FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let workspace_label = preview_proxy::workspace_host_label(
        workspace_id,
        &workspace_checkout_type,
        &workspace_name,
        &source_ref,
    );

    let mut env = HashMap::from([
        (
            "LIFECYCLE_WORKSPACE_ID".to_string(),
            workspace_id.to_string(),
        ),
        (
            "LIFECYCLE_WORKSPACE_NAME".to_string(),
            workspace_name.clone(),
        ),
        ("LIFECYCLE_WORKSPACE_SOURCE_REF".to_string(), source_ref),
        (
            "LIFECYCLE_WORKSPACE_PATH".to_string(),
            worktree_path.to_string(),
        ),
        (
            "LIFECYCLE_WORKSPACE_SLUG".to_string(),
            slugify_workspace_value(&workspace_name),
        ),
    ]);

    let mut stmt = conn
        .prepare(
            "SELECT name, assigned_port
             FROM service
             WHERE workspace_id = ?1",
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    for row in rows {
        let (name, assigned_port) =
            row.map_err(|error| LifecycleError::Database(error.to_string()))?;
        let key = uppercase_env_key(&name);
        if key.is_empty() {
            continue;
        }

        env.insert(
            format!("LIFECYCLE_SERVICE_{key}_HOST"),
            "127.0.0.1".to_string(),
        );

        if let Some(port) = assigned_port {
            env.insert(format!("LIFECYCLE_SERVICE_{key}_PORT"), port.to_string());
            env.insert(
                format!("LIFECYCLE_SERVICE_{key}_ADDRESS"),
                format!("127.0.0.1:{port}"),
            );
            env.insert(
                format!("LIFECYCLE_SERVICE_{key}_URL"),
                preview_proxy::service_url(&workspace_label, &name),
            );
        }
    }

    Ok(env)
}

pub(crate) fn workspace_log_dir(
    db_path: &str,
    workspace_id: &str,
) -> Result<PathBuf, LifecycleError> {
    let root = workspace_volume_root(db_path, workspace_id)?;
    let log_dir = root.join("logs");
    std::fs::create_dir_all(&log_dir).map_err(|error| {
        LifecycleError::Io(format!(
            "failed to create workspace log dir '{}': {error}",
            log_dir.display()
        ))
    })?;
    Ok(log_dir)
}

pub(crate) fn workspace_volume_root(
    db_path: &str,
    workspace_id: &str,
) -> Result<PathBuf, LifecycleError> {
    let base_dir = Path::new(db_path).parent().ok_or_else(|| {
        LifecycleError::Io(format!(
            "failed to resolve workspace volume root for workspace '{workspace_id}'"
        ))
    })?;
    let root = base_dir.join("volumes").join(workspace_id);
    std::fs::create_dir_all(&root).map_err(|error| {
        LifecycleError::Io(format!(
            "failed to create workspace volume root '{}': {error}",
            root.display()
        ))
    })?;
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::open_db;
    use crate::platform::git::worktree::{short_workspace_id, slugify_workspace_name};
    use crate::platform::preview_proxy::{service_url, workspace_host_label};

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
                workspace_id TEXT NOT NULL,
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
                checkout_type TEXT NOT NULL
            );",
        )
        .expect("create workspace");
    }

    fn worktree_workspace_identity(workspace_id: &str) -> (String, String, String) {
        let name = workspace_id.replace('_', " ");
        let source_ref = format!(
            "lifecycle/{}-{}",
            slugify_workspace_name(&name),
            short_workspace_id(workspace_id)
        );
        let label = workspace_host_label(workspace_id, "worktree", &name, &source_ref);
        (name, source_ref, label)
    }

    #[test]
    fn build_runtime_env_includes_stable_service_urls_and_direct_bind_details() {
        let db_path = temp_db_path();
        init_workspace_table(&db_path);
        init_workspace_service_tables(&db_path);

        let conn = open_db(&db_path).expect("open db");
        let (name, source_ref, workspace_label) = worktree_workspace_identity("ws_env");
        conn.execute(
            "INSERT INTO workspace (id, name, source_ref, checkout_type) VALUES (?1, ?2, ?3, ?4)",
            params!["ws_env", name, source_ref, "worktree"],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (
                id, workspace_id, name, status, assigned_port, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
            params!["svc_api", "ws_env", "api", "ready", Some(43123_i64),],
        )
        .expect("insert service");
        drop(conn);

        let env = build_runtime_env(&db_path, "ws_env", "/tmp/workspace-env").expect("build env");

        assert_eq!(
            env.get("LIFECYCLE_SERVICE_API_HOST").map(String::as_str),
            Some("127.0.0.1")
        );
        assert_eq!(
            env.get("LIFECYCLE_SERVICE_API_PORT").map(String::as_str),
            Some("43123")
        );
        assert_eq!(
            env.get("LIFECYCLE_SERVICE_API_ADDRESS").map(String::as_str),
            Some("127.0.0.1:43123")
        );
        assert_eq!(
            env.get("LIFECYCLE_SERVICE_API_URL").map(String::as_str),
            Some(service_url(&workspace_label, "api").as_str())
        );

        let _ = std::fs::remove_file(db_path);
    }
}
