use crate::platform::db::open_db;
use crate::shared::errors::{
    LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType, WorkspaceStatus,
};
use rusqlite::params;
use std::collections::HashSet;

use super::super::harness::default_harness_terminal_label;
use super::super::query::TerminalRecord;
use super::super::rename::TitleOrigin;

pub(crate) struct WorkspaceRuntime {
    pub(crate) status: WorkspaceStatus,
    pub(crate) project_path: String,
    pub(crate) worktree_path: String,
}

pub(crate) fn next_terminal_label(
    db_path: &str,
    workspace_id: &str,
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
) -> Result<String, LifecycleError> {
    let conn = open_db(db_path)?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM terminal WHERE workspace_id = ?1",
        params![workspace_id],
        |row| row.get(0),
    )?;
    let sequence = count + 1;

    let label = match (launch_type, harness_provider) {
        (TerminalType::Harness, _) => default_harness_terminal_label(harness_provider, sequence),
        _ => format!("Terminal {sequence}"),
    };

    Ok(label)
}

pub(crate) fn insert_terminal_record(
    db_path: &str,
    terminal_id: &str,
    workspace_id: &str,
    launch_type: &TerminalType,
    harness_provider: Option<&str>,
    harness_session_id: Option<&str>,
    label: &str,
    label_origin: TitleOrigin,
    status: TerminalStatus,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "INSERT INTO terminal (id, workspace_id, launch_type, harness_provider, harness_session_id, label, label_origin, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            terminal_id,
            workspace_id,
            launch_type.as_str(),
            harness_provider,
            harness_session_id,
            label,
            label_origin.as_str(),
            status.as_str()
        ],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::Database("terminal insert did not persist".to_string()))
}

pub(crate) fn delete_terminal_record(
    db_path: &str,
    terminal_id: &str,
) -> Result<(), LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute("DELETE FROM terminal WHERE id = ?1", params![terminal_id])?;
    Ok(())
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
        "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
         FROM terminal
         WHERE id = ?1
         LIMIT 1",
    )?;

    let row = stmt.query_row(params![terminal_id], |row| {
        Ok(TerminalRecord {
            id: row.get(0)?,
            workspace_id: row.get(1)?,
            launch_type: row.get(2)?,
            harness_provider: row.get(3)?,
            harness_session_id: row.get(4)?,
            created_by: row.get(5)?,
            label: row.get(6)?,
            label_origin: row.get(7)?,
            status: row.get(8)?,
            failure_reason: row.get(9)?,
            exit_code: row.get(10)?,
            started_at: row.get(11)?,
            last_active_at: row.get(12)?,
            ended_at: row.get(13)?,
        })
    });

    match row {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub(crate) fn workspace_has_interactive_terminal_context(workspace: &WorkspaceRuntime) -> bool {
    let _ = workspace.status;
    !workspace.worktree_path.is_empty() || !workspace.project_path.is_empty()
}

pub(crate) fn load_workspace_runtime(
    db_path: &str,
    workspace_id: &str,
) -> Result<WorkspaceRuntime, LifecycleError> {
    let conn = open_db(db_path)?;
    let (status, project_path, worktree_path): (String, String, Option<String>) = conn
        .query_row(
            "SELECT workspace.status, project.path, workspace.worktree_path
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

    Ok(WorkspaceRuntime {
        status: WorkspaceStatus::from_str(&status)?,
        project_path,
        worktree_path: worktree_path.unwrap_or_default(),
    })
}

pub(crate) fn load_claimed_harness_session_ids(
    db_path: &str,
    workspace_id: &str,
    harness_provider: &str,
    exclude_terminal_id: &str,
) -> Result<HashSet<String>, LifecycleError> {
    let conn = open_db(db_path)?;
    let mut stmt = conn.prepare(
        "SELECT harness_session_id
         FROM terminal
         WHERE workspace_id = ?1
           AND harness_provider = ?2
           AND id != ?3
           AND harness_session_id IS NOT NULL
           AND harness_session_id != ''",
    )?;
    let rows = stmt.query_map(
        params![workspace_id, harness_provider, exclude_terminal_id],
        |row| row.get::<_, String>(0),
    )?;

    let mut claimed = HashSet::new();
    for row in rows {
        claimed.insert(row?);
    }

    Ok(claimed)
}

pub(crate) fn update_terminal_harness_session_id(
    db_path: &str,
    terminal_id: &str,
    harness_session_id: &str,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET harness_session_id = ?1
         WHERE id = ?2
           AND (harness_session_id IS NULL OR harness_session_id = '')",
        params![harness_session_id, terminal_id],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
}

#[cfg(test)]
mod tests {
    use crate::shared::errors::WorkspaceStatus;

    use super::{workspace_has_interactive_terminal_context, WorkspaceRuntime};

    #[test]
    fn interactive_terminal_context_requires_worktree_lifecycle_to_exist() {
        let interactive_statuses = [
            WorkspaceStatus::Idle,
            WorkspaceStatus::Starting,
            WorkspaceStatus::Active,
            WorkspaceStatus::Stopping,
        ];

        for status in interactive_statuses {
            assert!(workspace_has_interactive_terminal_context(
                &WorkspaceRuntime {
                    status,
                    project_path: String::new(),
                    worktree_path: "/tmp/worktree".to_string(),
                }
            ));
        }

        assert!(!workspace_has_interactive_terminal_context(
            &WorkspaceRuntime {
                status: WorkspaceStatus::Idle,
                project_path: String::new(),
                worktree_path: String::new(),
            }
        ));
        assert!(!workspace_has_interactive_terminal_context(
            &WorkspaceRuntime {
                status: WorkspaceStatus::Stopping,
                project_path: String::new(),
                worktree_path: String::new(),
            }
        ));
    }
}
