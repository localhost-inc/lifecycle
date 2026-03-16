use crate::capabilities::workspaces::harness::HarnessLaunchConfig;
use crate::platform::db::open_db;
use crate::shared::errors::{
    LifecycleError, TerminalFailureReason, TerminalStatus, TerminalType, WorkspaceStatus,
};
use rusqlite::params;

use super::super::harness::default_harness_terminal_label;
use super::super::query::TerminalRecord;
use super::super::rename::TitleOrigin;
use super::launch::HarnessLaunchMode;

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
    harness_launch_mode: HarnessLaunchMode,
    harness_launch_config: Option<&HarnessLaunchConfig>,
    label: &str,
    label_origin: TitleOrigin,
    status: TerminalStatus,
) -> Result<TerminalRecord, LifecycleError> {
    let harness_launch_config = serialize_harness_launch_config(harness_launch_config)?;
    let conn = open_db(db_path)?;
    conn.execute(
        "INSERT INTO terminal (id, workspace_id, launch_type, harness_provider, harness_session_id, harness_launch_mode, harness_launch_config, label, label_origin, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            terminal_id,
            workspace_id,
            launch_type.as_str(),
            harness_provider,
            harness_session_id,
            harness_launch_mode.as_str(),
            harness_launch_config,
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
        "SELECT id, workspace_id, launch_type, harness_provider, harness_session_id, harness_launch_mode, created_by, label, label_origin, status, failure_reason, exit_code, started_at, last_active_at, ended_at
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
            harness_launch_mode: row.get(5)?,
            created_by: row.get(6)?,
            label: row.get(7)?,
            label_origin: row.get(8)?,
            status: row.get(9)?,
            failure_reason: row.get(10)?,
            exit_code: row.get(11)?,
            started_at: row.get(12)?,
            last_active_at: row.get(13)?,
            ended_at: row.get(14)?,
        })
    });

    match row {
        Ok(row) => Ok(Some(row)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(error) => Err(LifecycleError::Database(error.to_string())),
    }
}

pub(crate) fn load_terminal_harness_launch_config(
    db_path: &str,
    terminal_id: &str,
) -> Result<Option<HarnessLaunchConfig>, LifecycleError> {
    let conn = open_db(db_path)?;
    let config_json = conn
        .query_row(
            "SELECT harness_launch_config
             FROM terminal
             WHERE id = ?1
             LIMIT 1",
            params![terminal_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                LifecycleError::WorkspaceNotFound(terminal_id.to_string())
            }
            _ => LifecycleError::Database(error.to_string()),
        })?;

    deserialize_harness_launch_config(config_json.as_deref())
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

pub(crate) fn update_terminal_harness_session_capture(
    db_path: &str,
    terminal_id: &str,
    harness_session_id: &str,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET harness_session_id = ?1,
             harness_launch_mode = ?2
         WHERE id = ?3
           AND (harness_session_id IS NULL OR harness_session_id = '')",
        params![
            harness_session_id,
            HarnessLaunchMode::Resume.as_str(),
            terminal_id
        ],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
}

pub(crate) fn update_terminal_harness_launch_mode(
    db_path: &str,
    terminal_id: &str,
    harness_launch_mode: HarnessLaunchMode,
) -> Result<TerminalRecord, LifecycleError> {
    let conn = open_db(db_path)?;
    conn.execute(
        "UPDATE terminal
         SET harness_launch_mode = ?1
         WHERE id = ?2",
        params![harness_launch_mode.as_str(), terminal_id],
    )?;

    load_terminal_record(db_path, terminal_id)?
        .ok_or_else(|| LifecycleError::WorkspaceNotFound(terminal_id.to_string()))
}

fn serialize_harness_launch_config(
    config: Option<&HarnessLaunchConfig>,
) -> Result<Option<String>, LifecycleError> {
    config
        .map(|config| {
            serde_json::to_string(config)
                .map_err(|error| LifecycleError::Database(error.to_string()))
        })
        .transpose()
}

fn deserialize_harness_launch_config(
    config_json: Option<&str>,
) -> Result<Option<HarnessLaunchConfig>, LifecycleError> {
    config_json
        .map(|config_json| {
            serde_json::from_str(config_json)
                .map_err(|error| LifecycleError::Database(error.to_string()))
        })
        .transpose()
}

#[cfg(test)]
mod tests {
    use crate::capabilities::workspaces::harness::{
        CodexApprovalPolicy, CodexLaunchConfig, CodexSandboxMode, HarnessLaunchConfig,
        HarnessPreset,
    };
    use crate::capabilities::workspaces::rename::TitleOrigin;
    use crate::platform::db::{open_db, run_migrations};
    use crate::shared::errors::{TerminalStatus, TerminalType, WorkspaceStatus};

    use super::super::launch::HarnessLaunchMode;
    use super::{
        insert_terminal_record, load_terminal_harness_launch_config,
        workspace_has_interactive_terminal_context, WorkspaceRuntime,
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
        run_migrations(db_path).expect("run migrations");
        let conn = open_db(db_path).expect("open db");
        conn.execute(
            "INSERT INTO project (id, path, name) VALUES (?1, ?2, ?3)",
            rusqlite::params!["project_1", "/tmp/project_1", "Project 1"],
        )
        .expect("insert project");
        conn.execute(
            "INSERT INTO workspace (id, project_id, source_ref, worktree_path, mode, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![
                workspace_id,
                "project_1",
                "lifecycle/test",
                "/tmp/project_1",
                "local",
                "active"
            ],
        )
        .expect("insert workspace");
    }

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

    #[test]
    fn stores_and_loads_harness_launch_config_per_terminal_record() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");
        let config = HarnessLaunchConfig::Codex {
            config: CodexLaunchConfig {
                preset: HarnessPreset::Guarded,
                sandbox_mode: CodexSandboxMode::WorkspaceWrite,
                approval_policy: CodexApprovalPolicy::Untrusted,
                dangerous_bypass: false,
            },
        };

        insert_terminal_record(
            &db_path,
            "terminal_1",
            "workspace_1",
            &TerminalType::Harness,
            Some("codex"),
            Some("session_1"),
            HarnessLaunchMode::Resume,
            Some(&config),
            "Codex · Session 1",
            TitleOrigin::Default,
            TerminalStatus::Detached,
        )
        .expect("insert terminal");

        let stored_config = load_terminal_harness_launch_config(&db_path, "terminal_1")
            .expect("load harness launch config");

        assert_eq!(stored_config, Some(config));

        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn returns_none_when_terminal_record_has_no_harness_launch_config() {
        let db_path = temp_db_path();
        seed_workspace(&db_path, "workspace_1");

        insert_terminal_record(
            &db_path,
            "terminal_1",
            "workspace_1",
            &TerminalType::Shell,
            None,
            None,
            HarnessLaunchMode::New,
            None,
            "Terminal 1",
            TitleOrigin::Default,
            TerminalStatus::Detached,
        )
        .expect("insert terminal");

        let stored_config = load_terminal_harness_launch_config(&db_path, "terminal_1")
            .expect("load harness launch config");

        assert!(stored_config.is_none());

        let _ = std::fs::remove_file(db_path);
    }
}
