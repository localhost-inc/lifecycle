use crate::platform::db::{open_db, DbPath};
use crate::platform::git::worktree;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use crate::RootGitWatcherMap;
use crate::WorkspaceControllerRegistryHandle;
use rusqlite::params;
use tauri::{AppHandle, State};

use super::checkout_type::is_root_workspace_checkout_type;

/// All policy decisions (remove_worktree, attachment_path) are pre-computed
/// by TypeScript. Rust only executes the infrastructure operations.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveWorkspaceRequest {
    pub(crate) workspace_id: String,
    pub(crate) remove_worktree: bool,
    pub(crate) attachment_path: Option<String>,
}

struct ArchiveWorkspaceContext {
    checkout_type: String,
    project_path: String,
    worktree_path: Option<String>,
}

fn load_archive_workspace_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<ArchiveWorkspaceContext, LifecycleError> {
    let conn = open_db(db_path)?;
    let (checkout_type, project_path, worktree_path) = conn
        .query_row(
            "SELECT workspace.checkout_type, project.path, workspace.worktree_path
             FROM workspace
             INNER JOIN project ON project.id = workspace.project_id
             WHERE workspace.id = ?1
             LIMIT 1",
            params![workspace_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;
    Ok(ArchiveWorkspaceContext {
        checkout_type,
        project_path,
        worktree_path,
    })
}

fn delete_workspace_record(db_path: &str, workspace_id: &str) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute("DELETE FROM workspace WHERE id = ?1", params![workspace_id])
        .map_err(|error| LifecycleError::Database(error.to_string()))?;
    Ok(())
}

fn emit_workspace_archived(app: &AppHandle, workspace_id: &str) {
    publish_lifecycle_event(
        app,
        LifecycleEvent::WorkspaceArchived {
            workspace_id: workspace_id.to_string(),
        },
    );
}

pub async fn archive_workspace(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    root_git_watchers: State<'_, RootGitWatcherMap>,
    workspace_controllers: State<'_, WorkspaceControllerRegistryHandle>,
    request: ArchiveWorkspaceRequest,
) -> Result<(), LifecycleError> {
    let workspace_id = &request.workspace_id;
    let controller = workspace_controllers.get_or_create(workspace_id).await;
    controller.request_archive().await;
    let context = match load_archive_workspace_context(&db_path.0, workspace_id) {
        Ok(context) => context,
        Err(error) => {
            let _ = workspace_controllers.remove(workspace_id).await;
            return Err(error);
        }
    };

    if is_root_workspace_checkout_type(&context.checkout_type) {
        super::git_watcher::stop_root_git_watcher(&root_git_watchers, workspace_id);
    }

    controller.stop_runtime().await;

    if request.remove_worktree {
        if let Some(worktree_path) = context.worktree_path.as_deref() {
            worktree::remove_worktree(&context.project_path, worktree_path).await?;
        }
    }

    delete_workspace_record(&db_path.0, workspace_id)?;
    let _ = workspace_controllers.remove(workspace_id).await;

    if let Some(ref attachment_path) = request.attachment_path {
        let _ = std::fs::remove_dir_all(attachment_path);
    }

    emit_workspace_archived(&app, workspace_id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::platform::db::apply_test_schema;

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-archive-workspace-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn seed_workspace(db_path: &str) {
        apply_test_schema(db_path);
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (
                id, project_id, name, checkout_type, source_ref, worktree_path, host, status
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                "workspace_1",
                "project_1",
                "Workspace 1",
                "worktree",
                "lifecycle/test",
                "/tmp/project_1/.worktrees/workspace_1",
                "local",
                "active",
            ],
        )
        .expect("insert workspace");
        conn.execute(
            "INSERT INTO service (id, workspace_id, name)
             VALUES (?1, ?2, ?3)",
            params!["service_1", "workspace_1", "web"],
        )
        .expect("insert service");
    }

    #[test]
    fn load_archive_workspace_context_reads_project_state() {
        let db_path = temp_db_path();
        seed_workspace(&db_path);

        let context =
            load_archive_workspace_context(&db_path, "workspace_1").expect("load archive context");

        assert_eq!(context.checkout_type, "worktree");
        assert_eq!(context.project_path, "/tmp/project_1");
        assert_eq!(
            context.worktree_path.as_deref(),
            Some("/tmp/project_1/.worktrees/workspace_1")
        );
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn delete_workspace_record_cascades_services() {
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
                "SELECT COUNT(*) FROM service WHERE workspace_id = ?1",
                params!["workspace_1"],
                |row| row.get(0),
            )
            .expect("count services");

        assert_eq!(workspace_count, 0);
        assert_eq!(service_count, 0);

        let _ = std::fs::remove_file(db_path);
    }
}
