use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{publish_lifecycle_event, LifecycleEvent};
use serde::Deserialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

use super::query;

// ── Plan commands ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePlanInput {
    project_id: String,
    workspace_id: Option<String>,
    name: String,
    description: Option<String>,
    body: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePlanInput {
    id: String,
    name: Option<String>,
    description: Option<String>,
    body: Option<String>,
    status: Option<String>,
}

#[tauri::command]
pub async fn list_plans(
    db_path: State<'_, DbPath>,
    project_id: String,
) -> Result<Vec<query::PlanRecord>, LifecycleError> {
    query::list_plans(&db_path.0, project_id).await
}

#[tauri::command]
pub async fn create_plan(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    input: CreatePlanInput,
) -> Result<query::PlanRecord, LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    let id = Uuid::new_v4().to_string();
    let project_id = input.project_id.clone();
    let record = query::create_plan_sync(
        &conn,
        &id,
        &input.project_id,
        input.workspace_id.as_deref(),
        &input.name,
        input.description.as_deref().unwrap_or(""),
        input.body.as_deref().unwrap_or(""),
        input.status.as_deref().unwrap_or("draft"),
    )?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(record)
}

#[tauri::command]
pub async fn update_plan(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    input: UpdatePlanInput,
) -> Result<query::PlanRecord, LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    let record = query::update_plan_sync(
        &conn,
        &input.id,
        input.name.as_deref(),
        input.description.as_deref(),
        input.body.as_deref(),
        input.status.as_deref(),
    )?;
    let project_id = record.project_id.clone();
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(record)
}

#[tauri::command]
pub async fn delete_plan(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    plan_id: String,
    project_id: String,
) -> Result<(), LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    query::delete_plan_sync(&conn, &plan_id)?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(())
}

// ── Task commands ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    plan_id: String,
    project_id: String,
    workspace_id: Option<String>,
    agent_session_id: Option<String>,
    name: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTaskInput {
    id: String,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
}

#[tauri::command]
pub async fn list_tasks(
    db_path: State<'_, DbPath>,
    project_id: String,
) -> Result<Vec<query::TaskRecord>, LifecycleError> {
    query::list_tasks(&db_path.0, project_id).await
}

#[tauri::command]
pub async fn create_task(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    input: CreateTaskInput,
) -> Result<query::TaskRecord, LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    let id = Uuid::new_v4().to_string();
    let project_id = input.project_id.clone();
    let record = query::create_task_sync(
        &conn,
        &id,
        &input.plan_id,
        &input.project_id,
        input.workspace_id.as_deref(),
        input.agent_session_id.as_deref(),
        &input.name,
        input.description.as_deref().unwrap_or(""),
        input.status.as_deref().unwrap_or("pending"),
        input.priority.unwrap_or(2),
    )?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(record)
}

#[tauri::command]
pub async fn update_task(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    input: UpdateTaskInput,
) -> Result<query::TaskRecord, LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    let record = query::update_task_sync(
        &conn,
        &input.id,
        input.name.as_deref(),
        input.description.as_deref(),
        input.status.as_deref(),
        input.priority,
    )?;
    let project_id = record.project_id.clone();
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(record)
}

#[tauri::command]
pub async fn delete_task(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    task_id: String,
    project_id: String,
) -> Result<(), LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    query::delete_task_sync(&conn, &task_id)?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(())
}

// ── Task dependency commands ──

#[tauri::command]
pub async fn add_task_dependency(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    task_id: String,
    depends_on_task_id: String,
    project_id: String,
) -> Result<(), LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    query::add_task_dependency_sync(&conn, &task_id, &depends_on_task_id)?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(())
}

#[tauri::command]
pub async fn remove_task_dependency(
    app: AppHandle,
    db_path: State<'_, DbPath>,
    task_id: String,
    depends_on_task_id: String,
    project_id: String,
) -> Result<(), LifecycleError> {
    let conn = crate::platform::db::open_db(&db_path.0)?;
    query::remove_task_dependency_sync(&conn, &task_id, &depends_on_task_id)?;
    publish_lifecycle_event(&app, LifecycleEvent::PlanChanged { project_id });
    Ok(())
}
