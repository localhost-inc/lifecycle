use crate::platform::db::open_db;
use crate::shared::errors::{LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType};
use rusqlite::params;

use super::super::query::TerminalRecord;
use super::super::rename::TitleOrigin;

pub(crate) const DOCKER_SANDBOX_WORKTREE_PATH: &str = "/workspace";

pub(crate) struct TerminalWorkspaceContext {
    pub(crate) project_path: String,
    pub(crate) target: String,
    pub(crate) worktree_path: String,
}

pub(crate) fn next_terminal_label(
    db_path: &str,
    workspace_id: &str,
) -> Result<String, LifecycleError> {
    let conn = open_db(db_path)?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM terminal WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;
    let sequence = count + 1;
    Ok(format!("Terminal {sequence}"))
}

pub(crate) fn insert_terminal_record(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    launch_type: &TerminalType,
    label: &str,
    label_origin: TitleOrigin,
    status: TerminalStatus,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "INSERT INTO terminal (id, workspace_id, launch_type, label, label_origin, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            terminal_id,
            workspace_id,
            launch_type.as_str(),
            label,
            label_origin.as_str(),
            status.as_str()
        ],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::Database("terminal insert did not persist".to_string()))
}

pub(crate) fn update_terminal_state(
    db_path: &str,
    terminal_id: &str,
    status: TerminalStatus,
    failure_reason: Option<&TerminalFailureReason>,
    exit_code: Option<i64>,
    ended: bool,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET status = ?1,
             failure_reason = ?2,
             exit_code = ?3,
             ended_at = CASE WHEN ?4 THEN datetime('now') ELSE ended_at END,
             last_active_at = datetime('now')
         WHERE id = ?5",
        params![
            status.as_str(),
            failure_reason.map(|reason| reason.as_str()),
            exit_code,
            ended,
            terminal_id
        ],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
}

pub(crate) fn load_terminal_record(
    db_path: &str,
    terminal_id: &str,
) -> Result<Option<TerminalRecord>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT id, workspace_id, launch_type, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
         FROM terminal
         WHERE id = ?1
         LIMIT 1",
    )?;

    let row = stmt.query_row(params![terminal_id], |row| {
        Ok(TerminalRecord {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            launch_type: row.get(2)?,
            created_by: row.get(3)?,
            label: row.get(4)?,
            label_origin: row.get(5)?,
            status: row.get(6)?,
            failure_reason: row.get(7)?,
            exit_code: row.get(8)?,
            started_at: row.get(9)?,
            last_active_at: row.get(10)?,
            ended_at: row.get(11)?,
        })
    });

    match row {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub(crate) fn workspace_has_interactive_terminal_context(
    workspace: &TerminalWorkspaceContext,
) -> bool {
    !workspace.worktree_path.is_empty() || !workspace.project_path.is_empty()
}

pub(crate) fn load_terminal_workspace_context(
    db_path: &str,
    workspace_id: &str,
) -> Result<TerminalWorkspaceContext, LifecycleError> {
    let conn = open_db(db_path)?;
    let (project_path, worktree_path, target): (String, Option<String>, String) = conn
        .query_row(
            "SELECT project.path, workspace.worktree_path, workspace.target
             FROM workspace
             INNER JOIN project ON project.id = workspace.project_id
             WHERE workspace.id = ?1
             LIMIT 1",
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(workspace_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;

    Ok(TerminalWorkspaceContext {
        project_path,
        target,
        worktree_path: worktree_path.unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use crate::capabilities::workspaces::rename::TitleOrigin;
    use crate::platform::db::{apply_test_schema, open_db};
    use crate::shared::errors::{TerminalStatus, TerminalType};

    use super::{
        insert_terminal_record, next_terminal_label, workspace_has_interactive_terminal_context,
        TerminalWorkspaceContext,
    };

    fn temp_db_path() -> String {
        std::env::temp_dir()
            .join(format!(
                "lifecycle-terminal-persistence-{}.db",
                uuid::Uuid::new_v4()
            ))
            .to_string_lossy()
            .into_owned()
    }

    fn seed_workspace(db_path: &str, workspace_id: &str) {
        apply_test_schema(db_path);
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, name, source_ref, worktree_path, target, checkout_type, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                workspace_id,
                "project_1",
                "Workspace 1",
                "lifecycle/test",
                "/tmp/project_1",
                "local",
                "root",
                "active",
            ],
        )
        .expect("insert workspace");
    }

    #[test]
    fn interactive_terminal_context_requires_worktree_or_project_path() {
        assert!(workspace_has_interactive_terminal_context(
            &TerminalWorkspaceContext {
                project_path: String::new(),
                target: "local".to_string(),
                worktree_path: "/tmp/worktree".to_string(),
            }
        ));

        assert!(!workspace_has_interactive_terminal_context(
            &TerminalWorkspaceContext {
                project_path: String::new(),
                target: "cloud".to_string(),
                worktree_path: String::new(),
            }
        ));
    }

    #[test]
    fn terminal_labels_increment_per_workspace() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");

        assert_eq!(
            next_terminal_label(&db_path, "workspace_1").expect("first label"),
            "Terminal 1"
        );

        insert_terminal_record(
            &db_path,
            "terminal_1",
            "workspace_1",
            &TerminalType::Shell,
            "Terminal 1",
            TitleOrigin::Default,
            TerminalStatus::Detached,
        )
        .expect("insert terminal");

        assert_eq!(
            next_terminal_label(&db_path, "workspace_1").expect("second label"),
            "Terminal 2"
        );

        let _ = std::fs::remove_file(db_path);
    }
}
