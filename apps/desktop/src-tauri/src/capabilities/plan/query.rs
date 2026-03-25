use crate::platform::db::{database_error, run_blocking_db_read};
use crate::shared::errors::LifecycleError;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanRecord {
    pub id: String,
    pub project_id: String,
    pub workspace_id: Option<String>,
    pub name: String,
    pub description: String,
    pub body: String,
    pub status: String,
    pub position: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRecord {
    pub id: String,
    pub plan_id: String,
    pub project_id: String,
    pub workspace_id: Option<String>,
    pub agent_session_id: Option<String>,
    pub name: String,
    pub description: String,
    pub status: String,
    pub priority: i64,
    pub position: i64,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn map_plan_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<PlanRecord> {
    Ok(PlanRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        workspace_id: row.get(2)?,
        name: row.get(3)?,
        description: row.get(4)?,
        body: row.get(5)?,
        status: row.get(6)?,
        position: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_task_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<TaskRecord> {
    Ok(TaskRecord {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        project_id: row.get(2)?,
        workspace_id: row.get(3)?,
        agent_session_id: row.get(4)?,
        name: row.get(5)?,
        description: row.get(6)?,
        status: row.get(7)?,
        priority: row.get(8)?,
        position: row.get(9)?,
        completed_at: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

const PLAN_COLUMNS: &str =
    "id, project_id, workspace_id, name, description, body, status, position, created_at, updated_at";

const TASK_COLUMNS: &str =
    "id, plan_id, project_id, workspace_id, agent_session_id, name, description, status, priority, position, completed_at, created_at, updated_at";

// ── Plan queries ──

pub async fn list_plans(
    db_path: &str,
    project_id: String,
) -> Result<Vec<PlanRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "list_plans", move |conn| {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {PLAN_COLUMNS} FROM plan WHERE project_id = ?1 ORDER BY position"
            ))
            .map_err(database_error)?;
        let rows = stmt
            .query_map(params![project_id], map_plan_record)
            .map_err(database_error)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(database_error)?);
        }
        Ok(result)
    })
    .await
}

pub fn create_plan_sync(
    conn: &rusqlite::Connection,
    id: &str,
    project_id: &str,
    workspace_id: Option<&str>,
    name: &str,
    description: &str,
    body: &str,
    status: &str,
) -> Result<PlanRecord, LifecycleError> {
    conn.execute(
        "INSERT INTO plan (id, project_id, workspace_id, name, description, body, status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![id, project_id, workspace_id, name, description, body, status],
    )
    .map_err(database_error)?;

    let mut stmt = conn
        .prepare(&format!("SELECT {PLAN_COLUMNS} FROM plan WHERE id = ?1"))
        .map_err(database_error)?;
    stmt.query_row(params![id], map_plan_record)
        .map_err(database_error)
}

pub fn update_plan_sync(
    conn: &rusqlite::Connection,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    body: Option<&str>,
    status: Option<&str>,
) -> Result<PlanRecord, LifecycleError> {
    let mut sets = vec!["updated_at = datetime('now')".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(v) = name {
        sets.push(format!("name = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }
    if let Some(v) = description {
        sets.push(format!("description = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }
    if let Some(v) = body {
        sets.push(format!("body = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }
    if let Some(v) = status {
        sets.push(format!("status = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }

    let id_param = format!("?{idx}");
    param_values.push(Box::new(id.to_string()));

    let sql = format!(
        "UPDATE plan SET {} WHERE id = {id_param}",
        sets.join(", ")
    );
    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice()).map_err(database_error)?;

    let mut stmt = conn
        .prepare(&format!("SELECT {PLAN_COLUMNS} FROM plan WHERE id = ?1"))
        .map_err(database_error)?;
    stmt.query_row(rusqlite::params![id], map_plan_record)
        .map_err(database_error)
}

pub fn delete_plan_sync(conn: &rusqlite::Connection, id: &str) -> Result<(), LifecycleError> {
    conn.execute("DELETE FROM plan WHERE id = ?1", params![id])
        .map_err(database_error)?;
    Ok(())
}

// ── Task queries ──

pub async fn list_tasks(
    db_path: &str,
    project_id: String,
) -> Result<Vec<TaskRecord>, LifecycleError> {
    run_blocking_db_read(db_path.to_string(), "list_tasks", move |conn| {
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {TASK_COLUMNS} FROM task WHERE project_id = ?1 ORDER BY position"
            ))
            .map_err(database_error)?;
        let rows = stmt
            .query_map(params![project_id], map_task_record)
            .map_err(database_error)?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row.map_err(database_error)?);
        }
        Ok(result)
    })
    .await
}

pub fn create_task_sync(
    conn: &rusqlite::Connection,
    id: &str,
    plan_id: &str,
    project_id: &str,
    workspace_id: Option<&str>,
    agent_session_id: Option<&str>,
    name: &str,
    description: &str,
    status: &str,
    priority: i64,
) -> Result<TaskRecord, LifecycleError> {
    conn.execute(
        "INSERT INTO task (id, plan_id, project_id, workspace_id, agent_session_id, name, description, status, priority)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![id, plan_id, project_id, workspace_id, agent_session_id, name, description, status, priority],
    )
    .map_err(database_error)?;

    let mut stmt = conn
        .prepare(&format!("SELECT {TASK_COLUMNS} FROM task WHERE id = ?1"))
        .map_err(database_error)?;
    stmt.query_row(params![id], map_task_record)
        .map_err(database_error)
}

pub fn update_task_sync(
    conn: &rusqlite::Connection,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    status: Option<&str>,
    priority: Option<i64>,
) -> Result<TaskRecord, LifecycleError> {
    let mut sets = vec!["updated_at = datetime('now')".to_string()];
    let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(v) = name {
        sets.push(format!("name = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }
    if let Some(v) = description {
        sets.push(format!("description = ?{idx}"));
        param_values.push(Box::new(v.to_string()));
        idx += 1;
    }
    if let Some(v) = status {
        if v == "completed" {
            sets.push(format!("status = ?{idx}"));
            param_values.push(Box::new(v.to_string()));
            idx += 1;
            sets.push(format!("completed_at = datetime('now')"));
        } else {
            sets.push(format!("status = ?{idx}"));
            param_values.push(Box::new(v.to_string()));
            idx += 1;
            sets.push("completed_at = NULL".to_string());
        }
    }
    if let Some(v) = priority {
        sets.push(format!("priority = ?{idx}"));
        param_values.push(Box::new(v));
        idx += 1;
    }

    let id_param = format!("?{idx}");
    param_values.push(Box::new(id.to_string()));

    let sql = format!(
        "UPDATE task SET {} WHERE id = {id_param}",
        sets.join(", ")
    );
    let params: Vec<&dyn rusqlite::types::ToSql> = param_values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params.as_slice()).map_err(database_error)?;

    let mut stmt = conn
        .prepare(&format!("SELECT {TASK_COLUMNS} FROM task WHERE id = ?1"))
        .map_err(database_error)?;
    stmt.query_row(rusqlite::params![id], map_task_record)
        .map_err(database_error)
}

pub fn delete_task_sync(conn: &rusqlite::Connection, id: &str) -> Result<(), LifecycleError> {
    conn.execute("DELETE FROM task WHERE id = ?1", params![id])
        .map_err(database_error)?;
    Ok(())
}

// ── Task dependency queries ──

pub fn add_task_dependency_sync(
    conn: &rusqlite::Connection,
    task_id: &str,
    depends_on_task_id: &str,
) -> Result<(), LifecycleError> {
    conn.execute(
        "INSERT OR IGNORE INTO task_dependency (task_id, depends_on_task_id) VALUES (?1, ?2)",
        params![task_id, depends_on_task_id],
    )
    .map_err(database_error)?;
    Ok(())
}

pub fn remove_task_dependency_sync(
    conn: &rusqlite::Connection,
    task_id: &str,
    depends_on_task_id: &str,
) -> Result<(), LifecycleError> {
    conn.execute(
        "DELETE FROM task_dependency WHERE task_id = ?1 AND depends_on_task_id = ?2",
        params![task_id, depends_on_task_id],
    )
    .map_err(database_error)?;
    Ok(())
}
