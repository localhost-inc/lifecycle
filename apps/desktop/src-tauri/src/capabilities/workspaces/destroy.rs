use crate::platform::db::{open_db, DbPath};
use crate::platform::git::worktree;
use crate::platform::lifecycle_root::resolve_lifecycle_root;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use crate::RootGitWatcherMap;
use crate::SupervisorMap;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::kind::is_root_workspace_kind;

struct DestroyWorkspaceContext {
    kind: String,
    mode: String,
    project_path: String,
    terminal_ids: Vec<String>,
    worktree_path: Option<String>,
}

fn load_destroy_workspace_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<DestroyWorkspaceContext, LifecycleError> {
    let conn = open_db(db_path)?;
    let (kind, mode, project_path, worktree_path) = conn
        .query_row(
            "SELECT workspace.kind, workspace.mode, project.path, workspace.worktree_path
             FROM workspace
             INNER JOIN project ON project.id = workspace.project_id
             WHERE workspace.id = ?1
             LIMIT 1",
            params![workspace_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;
    let mut stmt = conn
        .prepare("SELECT id FROM terminal WHERE workspace_id = ?1")
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let rows = stmt
        .query_map(params![workspace_id], |row| row.get::<_, String>(0))
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    let mut terminal_ids = Vec::new();
    for row in rows {
        terminal_ids.push(row.map_err(|error| LifecycleError::Database(error.to_string()))?);
    }

    Ok(DestroyWorkspaceContext {
        kind,
        mode,
        project_path,
        terminal_ids,
        worktree_path,
    })
}

fn delete_workspace_record(db_path: &str, workspace_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute("DELETE FROM workspace WHERE id = ?1", params![workspace_id])
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

fn destroy_native_terminal_surfaces(app: &AppHandle, terminal_ids: &[String]) {
    if !crate::platform::native_terminal::is_available() {
        return;
    }

    for terminal_id in terminal_ids {
        let _ = crate::platform::native_terminal::destroy_surface(app, terminal_id);
    }
}

fn remove_workspace_attachments(workspace_id: &str) {
    let Ok(lifecycle_root) = resolve_lifecycle_root() else {
        return;
    };

    let _ = std::fs::remove_dir_all(lifecycle_root.join("attachments").join(workspace_id));
}

fn emit_workspace_deleted(app: &AppHandle, workspace_id: &str) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::WorkspaceDeleted {
            workspace_id: workspace_id.to_string(),
        },
    );
}

pub async fn destroy_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    supervisors: State<'_, SupervisorMap>,
    workspace_id: String,
) -> Result<(), LifecycleError> {
    let context = load_destroy_workspace_context(&db_path.0, &workspace_id)?;

    if is_root_workspace_kind(&context.kind) {
        super::git_watcher::stop_root_git_watcher(&root_git_watchers, &workspace_id);
    }

    {
        let mut supervisors = supervisors.lock().await;
        if let Some(supervisor) = supervisors.remove(&workspace_id) {
            let mut supervisor = supervisor.lock().await;
            supervisor.stop_all().await;
        }
    }

    destroy_native_terminal_surfaces(&app, &context.terminal_ids);

    if context.mode == "local" && !is_root_workspace_kind(&context.kind) {
        if let Some(worktree_path) = context.worktree_path.as_deref() {
            worktree::remove_worktree(&context.project_path, worktree_path).await?;
        }
    }

    delete_workspace_record(&db_path.0, &workspace_id)?;
    remove_workspace_attachments(&workspace_id);
    emit_workspace_deleted(&app, &workspace_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::run_migrations;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-destroy-workspace-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn seed_workspace(db_path: &str) {
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, kind, source_ref, worktree_path, mode, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                "workspace_1",
                "project_1",
                "managed",
                "lifecycle/test",
                "/tmp/project_1/.worktrees/workspace_1",
                "local",
                "active"
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO workspace_service (id, workspace_id, service_name)
             VALUES (?1, ?2, ?3)",
            params!["service_1", "workspace_1", "web"],
        )
        .expect("insert workspace service");
        conn.execute(
            "INSERT INTO terminal (id, workspace_id, label, status)
             VALUES (?1, ?2, ?3, ?4)",
            params!["terminal_1", "workspace_1", "Terminal 1", "detached"],
        )
        .expect("insert terminal");
    }

    #[test]
    fn load_destroy_workspace_context_reads_project_and_terminal_state() {
        let db_path = temp_db_path();
        seed_workspace(&db_path);

        let context =
            load_destroy_workspace_context(&db_path, "workspace_1").expect("load destroy context");

        assert_eq!(context.kind, "managed");
        assert_eq!(context.mode, "local");
        assert_eq!(context.project_path, "/tmp/project_1");
        assert_eq!(
            context.worktree_path.as_deref(),
            Some("/tmp/project_1/.worktrees/workspace_1")
        );
        assert_eq!(context.terminal_ids, vec!["terminal_1".to_string()]);

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn delete_workspace_record_cascades_services_and_terminals() {
        let db_path = temp_db_path();
        seed_workspace(&db_path);

        delete_workspace_record(&db_path, "workspace_1").expect("delete workspace record");

        let conn = open_db(&db_path).expect("open db");
        let workspace_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspace WHERE id = ?1",
                params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("count workspaces");
        let service_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM workspace_service WHERE workspace_id = ?1",
                params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("count services");
        let terminal_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM terminal WHERE workspace_id = ?1",
                params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("count terminals");

        assert_eq!(workspace_count, 0);
        assert_eq!(service_count, 0);
        assert_eq!(terminal_count, 0);

        let _ = std::fs::remove_file(db_path);
    }
}
