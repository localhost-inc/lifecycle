use crate::capabilities::workspaces::environment;
use crate::capabilities::workspaces::git;
use crate::capabilities::workspaces::query;
use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::WorkspaceControllerRegistryHandle;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
#[cfg(unix)]
use std::os::unix::net::UnixListener as StdUnixListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

const BRIDGE_VERSION: u8 = 1;
const BRIDGE_SHELL_REQUEST_EVENT: &str = "bridge:shell-request";
const BRIDGE_SHELL_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct BridgeState {
    inner: Arc<BridgeStateInner>,
}

struct BridgeStateInner {
    endpoint_path: Option<String>,
    pending_shell_requests:
        StdMutex<HashMap<String, oneshot::Sender<Result<BridgeShellResult, LifecycleError>>>>,
    session_scopes: StdMutex<HashMap<String, BridgeSessionScope>>,
}

#[derive(Clone)]
struct BridgeSessionScope {
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequestEnvelope {
    id: String,
    method: String,
    params: Value,
    #[serde(default)]
    session: Option<BridgeSessionEnvelope>,
    version: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeSessionEnvelope {
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeServiceInfoParams {
    service: String,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeServiceListParams {
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeServiceStartParams {
    manifest_fingerprint: String,
    manifest_json: String,
    service_names: Option<Vec<String>>,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeContextParams {
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeWorkspaceStatusParams {
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeAgentSessionInspectParams {
    session_id: String,
    _workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTabOpenParams {
    preview_key: Option<String>,
    label: Option<String>,
    #[allow(dead_code)]
    select: Option<bool>,
    split: Option<bool>,
    surface: String,
    url: String,
    workspace_id: Option<String>,
}

// ── Plan + Task bridge params ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgePlanListParams {
    project_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgePlanCreateParams {
    project_id: String,
    workspace_id: Option<String>,
    name: String,
    description: Option<String>,
    body: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgePlanUpdateParams {
    plan_id: String,
    name: Option<String>,
    description: Option<String>,
    body: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgePlanDeleteParams {
    plan_id: String,
    project_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTaskListParams {
    project_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTaskCreateParams {
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
struct BridgeTaskUpdateParams {
    task_id: String,
    name: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTaskDeleteParams {
    task_id: String,
    project_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeTaskDependencyParams {
    task_id: String,
    depends_on_task_id: String,
    project_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeShellRequest {
    kind: &'static str,
    label: String,
    preview_key: String,
    project_id: String,
    request_id: String,
    url: String,
    workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeShellResult {
    project_id: String,
    surface: String,
    tab_key: String,
    url: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeShellFailureInput {
    code: Option<String>,
    message: String,
}

impl BridgeState {
    pub(crate) fn start(app: AppHandle) -> Result<Self, LifecycleError> {
        #[cfg(unix)]
        {
            let endpoint_path = build_socket_path();
            let listener = bind_socket_listener(&endpoint_path)?;
            let state = Self {
                inner: Arc::new(BridgeStateInner {
                    endpoint_path: Some(endpoint_path.to_string_lossy().to_string()),
                    pending_shell_requests: StdMutex::new(HashMap::new()),
                    session_scopes: StdMutex::new(HashMap::new()),
                }),
            };
            state.spawn_accept_loop(app, listener);
            return Ok(state);
        }

        #[allow(unreachable_code)]
        Ok(Self::disabled())
    }

    pub(crate) fn disabled() -> Self {
        Self {
            inner: Arc::new(BridgeStateInner {
                endpoint_path: None,
                pending_shell_requests: StdMutex::new(HashMap::new()),
                session_scopes: StdMutex::new(HashMap::new()),
            }),
        }
    }

    #[cfg(unix)]
    fn spawn_accept_loop(&self, app: AppHandle, listener: StdUnixListener) {
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match UnixListener::from_std(listener) {
                Ok(listener) => listener,
                Err(error) => {
                    crate::platform::diagnostics::append_error(
                        "bridge-listener",
                        LifecycleError::Io(format!("failed to adopt bridge listener: {error}")),
                    );
                    return;
                }
            };
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let state = state.clone();
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = state.handle_connection(app, stream).await {
                                crate::platform::diagnostics::append_error(
                                    "bridge-connection",
                                    error,
                                );
                            }
                        });
                    }
                    Err(error) => {
                        crate::platform::diagnostics::append_error(
                            "bridge-listener",
                            LifecycleError::Io(format!("bridge listener failed: {error}")),
                        );
                        break;
                    }
                }
            }
        });
    }

    #[cfg(unix)]
    async fn handle_connection(
        &self,
        app: AppHandle,
        stream: UnixStream,
    ) -> Result<(), LifecycleError> {
        let (reader, mut writer) = tokio::io::split(stream);
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        let bytes_read = reader.read_line(&mut line).await?;
        if bytes_read == 0 {
            return Ok(());
        }

        let response = self.handle_request(&app, line.trim()).await;
        writer.write_all(response.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
        Ok(())
    }

    async fn handle_request(&self, app: &AppHandle, raw_request: &str) -> String {
        let request = match serde_json::from_str::<BridgeRequestEnvelope>(raw_request) {
            Ok(request) => request,
            Err(error) => {
                return serialize_bridge_error(
                    "unknown".to_string(),
                    "unknown".to_string(),
                    LifecycleError::InvalidInput {
                        field: "request".to_string(),
                        reason: format!("invalid bridge payload: {error}"),
                    },
                )
            }
        };

        if request.version != BRIDGE_VERSION {
            return serialize_bridge_error(
                request.id,
                request.method,
                LifecycleError::InvalidInput {
                    field: "version".to_string(),
                    reason: format!("unsupported bridge version: {}", request.version),
                },
            );
        }

        let request_id = request.id.clone();
        let method = request.method.clone();
        match self.route_request(app, request).await {
            Ok(result) => serialize_bridge_success(request_id, method, result),
            Err(error) => serialize_bridge_error(request_id, method, error),
        }
    }

    async fn route_request(
        &self,
        app: &AppHandle,
        request: BridgeRequestEnvelope,
    ) -> Result<Value, LifecycleError> {
        match request.method.as_str() {
            "service.info" => {
                let params: BridgeServiceInfoParams =
                    deserialize_bridge_params("service.info", request.params)?;
                self.handle_service_info(app, params, request.session).await
            }
            "service.list" => {
                let params: BridgeServiceListParams =
                    deserialize_bridge_params("service.list", request.params)?;
                self.handle_service_list(app, params, request.session).await
            }
            "service.start" => {
                let params: BridgeServiceStartParams =
                    deserialize_bridge_params("service.start", request.params)?;
                self.handle_service_start(app, params, request.session)
                    .await
            }
            "context.read" => {
                let params: BridgeContextParams =
                    deserialize_bridge_params("context.read", request.params)?;
                self.handle_context(app, params, request.session).await
            }
            "workspace.status" => {
                let params: BridgeWorkspaceStatusParams =
                    deserialize_bridge_params("workspace.status", request.params)?;
                self.handle_workspace_status(app, params, request.session)
                    .await
            }
            "tab.open" => {
                let params: BridgeTabOpenParams =
                    deserialize_bridge_params("tab.open", request.params)?;
                self.handle_tab_open(app, request.id, params, request.session)
                    .await
            }
            "agent.session.inspect" => {
                let params: BridgeAgentSessionInspectParams =
                    deserialize_bridge_params("agent.session.inspect", request.params)?;
                self.handle_agent_session_inspect(app, params, request.session)
                    .await
            }
            "plan.list" => {
                let params: BridgePlanListParams =
                    deserialize_bridge_params("plan.list", request.params)?;
                let db_path = app.state::<DbPath>();
                let plans =
                    crate::capabilities::plan::query::list_plans(&db_path.0, params.project_id)
                        .await?;
                Ok(json!({ "plans": plans }))
            }
            "plan.create" => {
                let params: BridgePlanCreateParams =
                    deserialize_bridge_params("plan.create", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                let id = uuid::Uuid::new_v4().to_string();
                let record = crate::capabilities::plan::query::create_plan_sync(
                    &conn,
                    &id,
                    &params.project_id,
                    params.workspace_id.as_deref(),
                    &params.name,
                    params.description.as_deref().unwrap_or(""),
                    params.body.as_deref().unwrap_or(""),
                    params.status.as_deref().unwrap_or("draft"),
                )?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({ "plan": record }))
            }
            "plan.update" => {
                let params: BridgePlanUpdateParams =
                    deserialize_bridge_params("plan.update", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                let record = crate::capabilities::plan::query::update_plan_sync(
                    &conn,
                    &params.plan_id,
                    params.name.as_deref(),
                    params.description.as_deref(),
                    params.body.as_deref(),
                    params.status.as_deref(),
                )?;
                let project_id = record.project_id.clone();
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged { project_id },
                );
                Ok(json!({ "plan": record }))
            }
            "plan.delete" => {
                let params: BridgePlanDeleteParams =
                    deserialize_bridge_params("plan.delete", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                crate::capabilities::plan::query::delete_plan_sync(&conn, &params.plan_id)?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({}))
            }
            "task.list" => {
                let params: BridgeTaskListParams =
                    deserialize_bridge_params("task.list", request.params)?;
                let db_path = app.state::<DbPath>();
                let tasks =
                    crate::capabilities::plan::query::list_tasks(&db_path.0, params.project_id)
                        .await?;
                Ok(json!({ "tasks": tasks }))
            }
            "task.create" => {
                let params: BridgeTaskCreateParams =
                    deserialize_bridge_params("task.create", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                let id = uuid::Uuid::new_v4().to_string();
                let record = crate::capabilities::plan::query::create_task_sync(
                    &conn,
                    &id,
                    &params.plan_id,
                    &params.project_id,
                    params.workspace_id.as_deref(),
                    params.agent_session_id.as_deref(),
                    &params.name,
                    params.description.as_deref().unwrap_or(""),
                    params.status.as_deref().unwrap_or("pending"),
                    params.priority.unwrap_or(2),
                )?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({ "task": record }))
            }
            "task.update" => {
                let params: BridgeTaskUpdateParams =
                    deserialize_bridge_params("task.update", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                let record = crate::capabilities::plan::query::update_task_sync(
                    &conn,
                    &params.task_id,
                    params.name.as_deref(),
                    params.description.as_deref(),
                    params.status.as_deref(),
                    params.priority,
                )?;
                let project_id = record.project_id.clone();
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged { project_id },
                );
                Ok(json!({ "task": record }))
            }
            "task.delete" => {
                let params: BridgeTaskDeleteParams =
                    deserialize_bridge_params("task.delete", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                crate::capabilities::plan::query::delete_task_sync(&conn, &params.task_id)?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({}))
            }
            "task.dependency.add" => {
                let params: BridgeTaskDependencyParams =
                    deserialize_bridge_params("task.dependency.add", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                crate::capabilities::plan::query::add_task_dependency_sync(
                    &conn,
                    &params.task_id,
                    &params.depends_on_task_id,
                )?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({}))
            }
            "task.dependency.remove" => {
                let params: BridgeTaskDependencyParams =
                    deserialize_bridge_params("task.dependency.remove", request.params)?;
                let db_path = app.state::<DbPath>();
                let conn = crate::platform::db::open_db(&db_path.0)?;
                crate::capabilities::plan::query::remove_task_dependency_sync(
                    &conn,
                    &params.task_id,
                    &params.depends_on_task_id,
                )?;
                crate::shared::lifecycle_events::publish_lifecycle_event(
                    app,
                    crate::shared::lifecycle_events::LifecycleEvent::PlanChanged {
                        project_id: params.project_id,
                    },
                );
                Ok(json!({}))
            }
            method => Err(LifecycleError::InvalidInput {
                field: "method".to_string(),
                reason: format!("unsupported bridge method: {method}"),
            }),
        }
    }

    async fn handle_service_info(
        &self,
        app: &AppHandle,
        params: BridgeServiceInfoParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let services = query::get_workspace_services(&db_path.0, workspace_id.clone()).await?;
        let service = services
            .into_iter()
            .find(|service| service.name == params.service)
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "service".to_string(),
                reason: format!(
                    "workspace {} does not have a service named {}",
                    workspace_id, params.service
                ),
            })?;

        Ok(json!({
            "service": service,
        }))
    }

    async fn handle_service_list(
        &self,
        app: &AppHandle,
        params: BridgeServiceListParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let services = query::get_workspace_services(&db_path.0, workspace_id).await?;

        Ok(json!({
            "services": services,
        }))
    }

    async fn handle_service_start(
        &self,
        app: &AppHandle,
        params: BridgeServiceStartParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let started_services = params.service_names.clone().unwrap_or_default();

        environment::start_workspace_services(
            app.clone(),
            app.state::<DbPath>(),
            app.state::<WorkspaceControllerRegistryHandle>(),
            workspace_id.clone(),
            params.manifest_json,
            params.manifest_fingerprint,
            params.service_names,
        )
        .await?;

        let db_path = app.state::<DbPath>();
        let services = query::get_workspace_services(&db_path.0, workspace_id.clone()).await?;

        Ok(json!({
            "services": services,
            "startedServices": started_services,
            "workspaceId": workspace_id,
        }))
    }

    async fn handle_context(
        &self,
        app: &AppHandle,
        params: BridgeContextParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let lifecycle_cli = app.state::<crate::platform::lifecycle_cli::LifecycleCliState>();
        let workspace = query::get_workspace_by_id(&db_path.0, workspace_id.clone())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.clone()))?;
        let services = query::get_workspace_services(&db_path.0, workspace_id.clone()).await?;

        let ready_service_count = services
            .iter()
            .filter(|service| service.status == "ready")
            .count();
        let git = match git::get_workspace_git_status(&db_path.0, workspace_id.clone()).await {
            Ok(status) => json!({
                "available": true,
                "status": status,
            }),
            Err(error) => json!({
                "available": false,
                "error": serialize_lifecycle_error(&error),
                "status": Value::Null,
            }),
        };

        Ok(json!({
            "capabilities": {
                "browser": {
                    "reload": false,
                    "snapshot": false,
                },
                "cliInstalled": lifecycle_cli.binary_path().is_some(),
                "context": true,
                "service": {
                    "health": false,
                    "info": true,
                    "list": true,
                    "logs": false,
                    "set": false,
                    "start": true,
                    "stop": false,
                },
                "tab": {
                    "commitDiff": false,
                    "file": false,
                    "preview": true,
                    "pullRequest": false,
                },
            },
            "cli": {
                "path": lifecycle_cli.binary_path(),
            },
            "commands": crate::platform::lifecycle_cli::wired_commands(),
            "bridge": {
                "available": self.inner.endpoint_path.is_some(),
                "session": session
                    .as_ref()
                    .and_then(|value| value.token.as_ref())
                    .is_some(),
            },
            "environment": {
                "healthy": ready_service_count == services.len(),
                "readyServiceCount": ready_service_count,
                "totalServiceCount": services.len(),
            },
            "git": git,
            "provider": {
                "name": "local",
                "shellBridge": self.inner.endpoint_path.is_some(),
            },
            "session": {
                "workspaceId": workspace_id,
            },
            "services": services,
            "workspace": workspace,
        }))
    }

    async fn handle_workspace_status(
        &self,
        app: &AppHandle,
        params: BridgeWorkspaceStatusParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let workspace = query::get_workspace_by_id(&db_path.0, workspace_id.clone())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.clone()))?;
        let services = query::get_workspace_services(&db_path.0, workspace_id).await?;

        Ok(json!({
            "services": services,
            "workspace": workspace,
        }))
    }

    async fn handle_tab_open(
        &self,
        app: &AppHandle,
        request_id: String,
        params: BridgeTabOpenParams,
        session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        if params.surface != "preview" {
            return Err(LifecycleError::InvalidInput {
                field: "surface".to_string(),
                reason: format!("unsupported tab surface: {}", params.surface),
            });
        }
        if params.split.unwrap_or(false) {
            return Err(LifecycleError::InvalidInput {
                field: "split".to_string(),
                reason: "preview split placement is not implemented yet".to_string(),
            });
        }

        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let workspace = query::get_workspace_by_id(&db_path.0, workspace_id.clone())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.clone()))?;
        let preview_key = params
            .preview_key
            .unwrap_or_else(|| default_preview_key(&params.url));
        let label = params
            .label
            .unwrap_or_else(|| default_preview_label(&params.url));

        let result = self
            .dispatch_shell_request(
                app,
                request_id.clone(),
                BridgeShellRequest {
                    kind: "tab.open.preview",
                    label,
                    preview_key,
                    project_id: workspace.project_id.clone(),
                    request_id,
                    url: params.url,
                    workspace_id,
                },
            )
            .await?;

        Ok(serde_json::to_value(result).map_err(|error| {
            LifecycleError::Io(format!("failed to serialize bridge shell result: {error}"))
        })?)
    }

    async fn handle_agent_session_inspect(
        &self,
        app: &AppHandle,
        params: BridgeAgentSessionInspectParams,
        _session: Option<BridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let db_path = app.state::<DbPath>();
        let conn = crate::platform::db::open_db(&db_path.0)?;

        let session: Value = conn
            .query_row(
                "SELECT id, workspace_id, provider,
                        provider_session_id, title, status,
                        last_message_at, created_at, updated_at
                 FROM agent_session WHERE id = ?1",
                rusqlite::params![params.session_id],
                |row| {
                    Ok(json!({
                        "id": row.get::<_, String>(0)?,
                        "workspace_id": row.get::<_, String>(1)?,
                        "provider": row.get::<_, String>(2)?,
                        "provider_session_id": row.get::<_, Option<String>>(3)?,
                        "title": row.get::<_, String>(4)?,
                        "status": row.get::<_, String>(5)?,
                        "last_message_at": row.get::<_, Option<String>>(6)?,
                        "created_at": row.get::<_, String>(7)?,
                        "updated_at": row.get::<_, String>(8)?,
                    }))
                },
            )
            .map_err(|error| match error {
                rusqlite::Error::QueryReturnedNoRows => LifecycleError::InvalidInput {
                    field: "sessionId".to_string(),
                    reason: format!("agent session not found: {}", params.session_id),
                },
                other => LifecycleError::Database(other.to_string()),
            })?;

        let mut stmt = conn
            .prepare(
                "SELECT m.id, m.session_id, m.role, m.text, m.turn_id, m.created_at,
                        p.id, p.part_index, p.part_type, p.text, p.data, p.created_at
                 FROM agent_message m
                 LEFT JOIN agent_message_part p ON p.message_id = m.id
                 WHERE m.session_id = ?1
                 ORDER BY m.created_at ASC, m.id ASC, p.part_index ASC",
            )
            .map_err(|error| LifecycleError::Database(error.to_string()))?;

        let mut messages_map: Vec<(String, Value, Vec<Value>)> = Vec::new();

        let rows = stmt
            .query_map(rusqlite::params![params.session_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<i64>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                ))
            })
            .map_err(|error| LifecycleError::Database(error.to_string()))?;

        for row in rows {
            let (
                msg_id,
                session_id,
                role,
                text,
                turn_id,
                created_at,
                part_id,
                part_index,
                part_type,
                part_text,
                part_data,
                part_created_at,
            ) = row.map_err(|error| LifecycleError::Database(error.to_string()))?;

            let needs_new = messages_map.is_empty() || messages_map.last().unwrap().0 != msg_id;

            if needs_new {
                messages_map.push((
                    msg_id.clone(),
                    json!({
                        "id": msg_id,
                        "session_id": session_id,
                        "role": role,
                        "text": text,
                        "turn_id": turn_id,
                        "created_at": created_at,
                    }),
                    Vec::new(),
                ));
            }

            if let Some(pid) = part_id {
                let entry = messages_map.last_mut().unwrap();
                entry.2.push(json!({
                    "id": pid,
                    "message_id": entry.0,
                    "session_id": params.session_id,
                    "part_index": part_index.unwrap_or(0),
                    "part_type": part_type,
                    "text": part_text,
                    "data": part_data,
                    "created_at": part_created_at.unwrap_or_default(),
                }));
            }
        }

        let messages: Vec<Value> = messages_map
            .into_iter()
            .map(|(_, mut msg, parts)| {
                msg.as_object_mut()
                    .unwrap()
                    .insert("parts".to_string(), json!(parts));
                msg
            })
            .collect();

        Ok(json!({
            "session": session,
            "messages": messages,
        }))
    }

    async fn dispatch_shell_request(
        &self,
        app: &AppHandle,
        request_id: String,
        request: BridgeShellRequest,
    ) -> Result<BridgeShellResult, LifecycleError> {
        let (sender, receiver) = oneshot::channel();
        self.inner
            .pending_shell_requests
            .lock()
            .unwrap()
            .insert(request_id.clone(), sender);

        if let Err(error) = app.emit(BRIDGE_SHELL_REQUEST_EVENT, request) {
            self.inner
                .pending_shell_requests
                .lock()
                .unwrap()
                .remove(&request_id);
            return Err(LifecycleError::Io(format!(
                "failed to dispatch desktop shell request: {error}"
            )));
        }

        match tokio::time::timeout(BRIDGE_SHELL_REQUEST_TIMEOUT, receiver).await {
            Ok(Ok(Ok(result))) => Ok(result),
            Ok(Ok(Err(error))) => Err(error),
            Ok(Err(_)) => Err(LifecycleError::Io(
                "desktop shell request channel closed unexpectedly".to_string(),
            )),
            Err(_) => {
                self.inner
                    .pending_shell_requests
                    .lock()
                    .unwrap()
                    .remove(&request_id);
                Err(LifecycleError::Io(
                    "desktop shell request timed out".to_string(),
                ))
            }
        }
    }

    fn resolve_workspace_id(
        &self,
        workspace_id: Option<String>,
        session: Option<&BridgeSessionEnvelope>,
    ) -> Result<String, LifecycleError> {
        if let Some(workspace_id) = workspace_id {
            return Ok(workspace_id);
        }

        let token = session
            .and_then(|session| session.token.as_deref())
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "workspaceId".to_string(),
                reason: "workspace id is required when no session token is available".to_string(),
            })?;

        Ok(self.lookup_session_scope(token)?.workspace_id)
    }

    fn lookup_session_scope(&self, token: &str) -> Result<BridgeSessionScope, LifecycleError> {
        self.inner
            .session_scopes
            .lock()
            .unwrap()
            .get(token)
            .cloned()
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "session.token".to_string(),
                reason: "bridge session token is invalid or expired".to_string(),
            })
    }

    fn complete_shell_request(
        &self,
        request_id: &str,
        result: Result<BridgeShellResult, LifecycleError>,
    ) -> Result<(), LifecycleError> {
        let sender = self
            .inner
            .pending_shell_requests
            .lock()
            .unwrap()
            .remove(request_id)
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "requestId".to_string(),
                reason: format!("unknown bridge shell request: {request_id}"),
            })?;

        sender.send(result).map_err(|_| {
            LifecycleError::Io(format!(
                "bridge shell request receiver was dropped: {request_id}"
            ))
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeCreateAgentSessionRequest {
    workspace_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeAgentSession {
    socket_path: String,
    session_token: String,
}

#[tauri::command]
pub fn bridge_create_agent_session(
    bridge: State<'_, BridgeState>,
    request: BridgeCreateAgentSessionRequest,
) -> Result<BridgeAgentSession, LifecycleError> {
    let endpoint_path = bridge
        .inner
        .endpoint_path
        .as_ref()
        .ok_or_else(|| LifecycleError::AttachFailed("Bridge is not available.".to_string()))?
        .clone();

    let token = uuid::Uuid::new_v4().to_string();
    bridge.inner.session_scopes.lock().unwrap().insert(
        token.clone(),
        BridgeSessionScope {
            workspace_id: request.workspace_id,
        },
    );

    Ok(BridgeAgentSession {
        socket_path: endpoint_path,
        session_token: token,
    })
}

#[tauri::command]
pub async fn bridge_complete_shell_request(
    bridge: State<'_, BridgeState>,
    request_id: String,
    result: BridgeShellResult,
) -> Result<(), LifecycleError> {
    bridge.complete_shell_request(&request_id, Ok(result))
}

#[tauri::command]
pub async fn bridge_fail_shell_request(
    bridge: State<'_, BridgeState>,
    request_id: String,
    error: BridgeShellFailureInput,
) -> Result<(), LifecycleError> {
    let reason = if let Some(code) = error.code {
        format!("{code}: {}", error.message)
    } else {
        error.message
    };

    bridge.complete_shell_request(&request_id, Err(LifecycleError::AttachFailed(reason)))
}

#[cfg(unix)]
fn bind_socket_listener(endpoint_path: &Path) -> Result<StdUnixListener, LifecycleError> {
    if endpoint_path.exists() {
        std::fs::remove_file(endpoint_path)?;
    }

    let listener = StdUnixListener::bind(endpoint_path)?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

fn build_socket_path() -> PathBuf {
    #[cfg(unix)]
    {
        return PathBuf::from("/tmp").join(format!("lf-{}.sock", uuid::Uuid::new_v4().simple()));
    }

    #[allow(unreachable_code)]
    std::env::temp_dir().join(format!(
        "lifecycle-desktop-{}.sock",
        uuid::Uuid::new_v4().simple()
    ))
}

fn deserialize_bridge_params<T>(field: &str, value: Value) -> Result<T, LifecycleError>
where
    T: for<'de> Deserialize<'de>,
{
    serde_json::from_value(value).map_err(|error| LifecycleError::InvalidInput {
        field: field.to_string(),
        reason: error.to_string(),
    })
}

fn serialize_bridge_success(request_id: String, method: String, result: Value) -> String {
    json!({
        "id": request_id,
        "method": method,
        "ok": true,
        "result": result,
    })
    .to_string()
}

fn serialize_lifecycle_error(error: &LifecycleError) -> Value {
    serde_json::to_value(error).unwrap_or_else(|serialization_error| {
        json!({
            "code": "internal_error",
            "message": format!(
                "failed to serialize bridge error: {serialization_error}"
            ),
            "retryable": false,
        })
    })
}

fn serialize_bridge_error(request_id: String, method: String, error: LifecycleError) -> String {
    json!({
        "id": request_id,
        "method": method,
        "ok": false,
        "error": serialize_lifecycle_error(&error),
    })
    .to_string()
}

fn default_preview_key(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    format!("url:{:016x}", hasher.finish())
}

fn default_preview_label(url: &str) -> String {
    if let Ok(parsed) = reqwest::Url::parse(url) {
        if let Some(host) = parsed.host_str() {
            if let Some(port) = parsed.port() {
                return format!("{host}:{port}");
            }
            return host.to_string();
        }
    }

    url.to_string()
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    use super::bind_socket_listener;
    use super::{build_socket_path, BridgeSessionEnvelope, BridgeSessionScope, BridgeState};
    #[cfg(unix)]
    use std::io::ErrorKind;

    #[test]
    fn unix_socket_path_stays_short_enough_for_macos() {
        let path = build_socket_path();
        let path_str = path.to_string_lossy();

        assert!(path_str.starts_with("/tmp/"));
        assert!(path_str.len() < 104);
    }

    #[cfg(unix)]
    #[test]
    fn bridge_socket_listener_is_nonblocking() {
        let path = build_socket_path();
        let listener = bind_socket_listener(&path).expect("bind bridge socket");

        let accept_result = listener.accept();
        assert_eq!(
            accept_result
                .expect_err("listener should be nonblocking")
                .kind(),
            ErrorKind::WouldBlock
        );

        std::fs::remove_file(path).expect("remove bridge socket");
    }

    #[test]
    fn resolve_workspace_id_accepts_explicit_workspace_without_session_token() {
        let bridge = BridgeState::disabled();

        let workspace_id = bridge
            .resolve_workspace_id(Some("ws_123".to_string()), None)
            .expect("resolve workspace id");

        assert_eq!(workspace_id, "ws_123");
    }

    #[test]
    fn resolve_workspace_id_uses_session_scope_when_workspace_id_is_omitted() {
        let bridge = BridgeState::disabled();
        bridge.inner.session_scopes.lock().unwrap().insert(
            "session-token".to_string(),
            BridgeSessionScope {
                workspace_id: "ws_123".to_string(),
            },
        );

        let workspace_id = bridge
            .resolve_workspace_id(
                None,
                Some(&BridgeSessionEnvelope {
                    token: Some("session-token".to_string()),
                }),
            )
            .expect("resolve workspace id from session");

        assert_eq!(workspace_id, "ws_123");
    }
}
