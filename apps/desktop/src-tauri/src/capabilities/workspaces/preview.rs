use crate::platform::preview_proxy;
use crate::shared::errors::LifecycleError;
use rusqlite::params;

pub(crate) fn preview_url_for_service(
    conn: &rusqlite::Connection,
    workspace_id: &str,
    name: &str,
) -> Result<Option<String>, LifecycleError> {
    let (kind, workspace_name, source_ref): (String, String, String) = conn
        .query_row(
            "SELECT kind, name, source_ref FROM workspace WHERE id = ?1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| LifecycleError::Database(error.to_string()))?;

    let workspace_label =
        preview_proxy::workspace_host_label(workspace_id, &kind, &workspace_name, &source_ref);
    Ok(Some(preview_proxy::local_preview_url(&workspace_label, name)))
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

    #[test]
    fn preview_url_uses_stable_proxy_url_for_service() {
        let db_path = temp_db_path();
        let conn = open_db(&db_path).expect("open db");
        conn.execute_batch(
            "CREATE TABLE workspace (
                id TEXT PRIMARY KEY NOT NULL,
                kind TEXT NOT NULL,
                name TEXT NOT NULL,
                source_ref TEXT NOT NULL
            );",
        )
        .expect("create workspace table");

        let workspace_label = preview_proxy::workspace_host_label(
            "ws_preview",
            "managed",
            "Frost beacon",
            "lifecycle/frost-beacon-wsprevie",
        );
        conn.execute(
            "INSERT INTO workspace (id, kind, name, source_ref) VALUES (?1, ?2, ?3, ?4)",
            params![
                "ws_preview",
                "managed",
                "Frost beacon",
                "lifecycle/frost-beacon-wsprevie"
            ],
        )
        .expect("insert workspace");

        let preview_url =
            preview_url_for_service(&conn, "ws_preview", "www").expect("preview url");

        assert_eq!(
            preview_url,
            Some(preview_proxy::local_preview_url(&workspace_label, "www"))
        );
    }
}
