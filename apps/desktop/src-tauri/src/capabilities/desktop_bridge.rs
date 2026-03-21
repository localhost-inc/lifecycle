use crate::capabilities::workspaces::environment;
use crate::capabilities::workspaces::git;
use crate::capabilities::workspaces::query;
use crate::platform::db::DbPath;
use crate::shared::errors::LifecycleError;
use crate::WorkspaceControllerRegistryHandle;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

const DESKTOP_BRIDGE_VERSION: u8 = 1;
const DESKTOP_BRIDGE_SHELL_REQUEST_EVENT: &str = "desktop-bridge:shell-request";
const DESKTOP_BRIDGE_SHELL_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Clone)]
pub struct DesktopBridgeState {
    inner: Arc<DesktopBridgeStateInner>,
}

struct DesktopBridgeStateInner {
    endpoint_path: Option<String>,
    pending_shell_requests: StdMutex<
        HashMap<String, oneshot::Sender<Result<DesktopBridgeShellResult, LifecycleError>>>,
    >,
    session_scopes: StdMutex<HashMap<String, DesktopBridgeSessionScope>>,
}

#[derive(Clone)]
struct DesktopBridgeSessionScope {
    terminal_id: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeRequestEnvelope {
    id: String,
    method: String,
    params: Value,
    #[serde(default)]
    session: Option<DesktopBridgeSessionEnvelope>,
    version: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeSessionEnvelope {
    terminal_id: Option<String>,
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeServiceInfoParams {
    service: String,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeServiceListParams {
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeServiceStartParams {
    manifest_fingerprint: String,
    manifest_json: String,
    service_names: Option<Vec<String>>,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeContextParams {
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeTabOpenParams {
    browser_key: Option<String>,
    label: Option<String>,
    #[allow(dead_code)]
    select: Option<bool>,
    split: Option<bool>,
    surface: String,
    url: String,
    workspace_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopBridgeShellRequest {
    browser_key: String,
    kind: &'static str,
    label: String,
    project_id: String,
    request_id: String,
    url: String,
    workspace_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBridgeShellResult {
    project_id: String,
    surface: String,
    tab_key: String,
    url: String,
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBridgeShellFailureInput {
    code: Option<String>,
    message: String,
}

impl DesktopBridgeState {
    pub(crate) fn start(app: AppHandle) -> Result<Self, LifecycleError> {
        #[cfg(unix)]
        {
            let endpoint_path = build_socket_path();
            if endpoint_path.exists() {
                std::fs::remove_file(&endpoint_path)?;
            }

            let listener = UnixListener::bind(&endpoint_path)?;
            let state = Self {
                inner: Arc::new(DesktopBridgeStateInner {
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
            inner: Arc::new(DesktopBridgeStateInner {
                endpoint_path: None,
                pending_shell_requests: StdMutex::new(HashMap::new()),
                session_scopes: StdMutex::new(HashMap::new()),
            }),
        }
    }

    pub(crate) fn endpoint_path(&self) -> Option<String> {
        self.inner.endpoint_path.clone()
    }

    pub(crate) fn register_terminal_session(
        &self,
        workspace_id: &str,
        terminal_id: &str,
    ) -> Option<String> {
        if self.inner.endpoint_path.is_none() {
            return None;
        }

        let token = uuid::Uuid::new_v4().to_string();
        let mut session_scopes = self.inner.session_scopes.lock().unwrap();
        session_scopes.insert(
            token.clone(),
            DesktopBridgeSessionScope {
                terminal_id: terminal_id.to_string(),
                workspace_id: workspace_id.to_string(),
            },
        );
        Some(token)
    }

    #[cfg(unix)]
    fn spawn_accept_loop(&self, app: AppHandle, listener: UnixListener) {
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let state = state.clone();
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = state.handle_connection(app, stream).await {
                                crate::platform::diagnostics::append_error(
                                    "desktop-bridge-connection",
                                    error,
                                );
                            }
                        });
                    }
                    Err(error) => {
                        crate::platform::diagnostics::append_error(
                            "desktop-bridge-listener",
                            LifecycleError::Io(format!("desktop bridge listener failed: {error}")),
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
        let request = match serde_json::from_str::<DesktopBridgeRequestEnvelope>(raw_request) {
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

        if request.version != DESKTOP_BRIDGE_VERSION {
            return serialize_bridge_error(
                request.id,
                request.method,
                LifecycleError::InvalidInput {
                    field: "version".to_string(),
                    reason: format!("unsupported desktop bridge version: {}", request.version),
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
        request: DesktopBridgeRequestEnvelope,
    ) -> Result<Value, LifecycleError> {
        match request.method.as_str() {
            "service.info" => {
                let params: DesktopBridgeServiceInfoParams =
                    deserialize_bridge_params("service.info", request.params)?;
                self.handle_service_info(app, params, request.session).await
            }
            "service.list" => {
                let params: DesktopBridgeServiceListParams =
                    deserialize_bridge_params("service.list", request.params)?;
                self.handle_service_list(app, params, request.session).await
            }
            "service.start" => {
                let params: DesktopBridgeServiceStartParams =
                    deserialize_bridge_params("service.start", request.params)?;
                self.handle_service_start(app, params, request.session)
                    .await
            }
            "context.read" => {
                let params: DesktopBridgeContextParams =
                    deserialize_bridge_params("context.read", request.params)?;
                self.handle_context(app, params, request.session).await
            }
            "tab.open" => {
                let params: DesktopBridgeTabOpenParams =
                    deserialize_bridge_params("tab.open", request.params)?;
                self.handle_tab_open(app, request.id, params, request.session)
                    .await
            }
            method => Err(LifecycleError::InvalidInput {
                field: "method".to_string(),
                reason: format!("unsupported desktop bridge method: {method}"),
            }),
        }
    }

    async fn handle_service_info(
        &self,
        app: &AppHandle,
        params: DesktopBridgeServiceInfoParams,
        session: Option<DesktopBridgeSessionEnvelope>,
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
        params: DesktopBridgeServiceListParams,
        session: Option<DesktopBridgeSessionEnvelope>,
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
        params: DesktopBridgeServiceStartParams,
        session: Option<DesktopBridgeSessionEnvelope>,
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
        params: DesktopBridgeContextParams,
        session: Option<DesktopBridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        let workspace_id = self.resolve_workspace_id(params.workspace_id, session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let lifecycle_cli = app.state::<crate::platform::lifecycle_cli::LifecycleCliState>();
        let workspace = query::get_workspace_by_id(&db_path.0, workspace_id.clone())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.clone()))?;
        let services = query::get_workspace_services(&db_path.0, workspace_id.clone()).await?;
        let terminals = query::list_workspace_terminals(&db_path.0, workspace_id.clone()).await?;

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
                    "browser": true,
                    "commitDiff": false,
                    "file": false,
                    "pullRequest": false,
                    "terminal": false,
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
                "terminalId": session.and_then(|value| value.terminal_id),
                "workspaceId": workspace_id,
            },
            "services": services,
            "terminals": terminals,
            "workspace": workspace,
        }))
    }

    async fn handle_tab_open(
        &self,
        app: &AppHandle,
        request_id: String,
        params: DesktopBridgeTabOpenParams,
        session: Option<DesktopBridgeSessionEnvelope>,
    ) -> Result<Value, LifecycleError> {
        if params.surface != "browser" {
            return Err(LifecycleError::InvalidInput {
                field: "surface".to_string(),
                reason: format!("unsupported tab surface: {}", params.surface),
            });
        }
        if params.split.unwrap_or(false) {
            return Err(LifecycleError::InvalidInput {
                field: "split".to_string(),
                reason: "browser split placement is not implemented yet".to_string(),
            });
        }

        let workspace_id =
            self.require_shell_workspace(params.workspace_id.clone(), session.as_ref())?;
        let db_path = app.state::<DbPath>();
        let workspace = query::get_workspace_by_id(&db_path.0, workspace_id.clone())
            .await?
            .ok_or_else(|| LifecycleError::WorkspaceNotFound(workspace_id.clone()))?;
        let browser_key = params
            .browser_key
            .unwrap_or_else(|| default_browser_key(&params.url));
        let label = params
            .label
            .unwrap_or_else(|| default_browser_label(&params.url));

        let result = self
            .dispatch_shell_request(
                app,
                request_id.clone(),
                DesktopBridgeShellRequest {
                    browser_key,
                    kind: "tab.open.browser",
                    label,
                    project_id: workspace.project_id.clone(),
                    request_id,
                    url: params.url,
                    workspace_id,
                },
            )
            .await?;

        Ok(serde_json::to_value(result).map_err(|error| {
            LifecycleError::Io(format!(
                "failed to serialize desktop bridge shell result: {error}"
            ))
        })?)
    }

    async fn dispatch_shell_request(
        &self,
        app: &AppHandle,
        request_id: String,
        request: DesktopBridgeShellRequest,
    ) -> Result<DesktopBridgeShellResult, LifecycleError> {
        let (sender, receiver) = oneshot::channel();
        self.inner
            .pending_shell_requests
            .lock()
            .unwrap()
            .insert(request_id.clone(), sender);

        if let Err(error) = app.emit(DESKTOP_BRIDGE_SHELL_REQUEST_EVENT, request) {
            self.inner
                .pending_shell_requests
                .lock()
                .unwrap()
                .remove(&request_id);
            return Err(LifecycleError::Io(format!(
                "failed to dispatch desktop shell request: {error}"
            )));
        }

        match tokio::time::timeout(DESKTOP_BRIDGE_SHELL_REQUEST_TIMEOUT, receiver).await {
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
        session: Option<&DesktopBridgeSessionEnvelope>,
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

        let scope = self.lookup_session_scope(token)?;
        if let Some(terminal_id) = session.and_then(|session| session.terminal_id.as_deref()) {
            if terminal_id != scope.terminal_id {
                return Err(LifecycleError::InvalidInput {
                    field: "session.terminalId".to_string(),
                    reason: "session terminal does not match the desktop bridge token".to_string(),
                });
            }
        }

        Ok(scope.workspace_id)
    }

    fn require_shell_workspace(
        &self,
        workspace_id: Option<String>,
        session: Option<&DesktopBridgeSessionEnvelope>,
    ) -> Result<String, LifecycleError> {
        let token = session
            .and_then(|session| session.token.as_deref())
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "session.token".to_string(),
                reason: "desktop shell commands require a session token".to_string(),
            })?;
        let scope = self.lookup_session_scope(token)?;
        if let Some(terminal_id) = session.and_then(|session| session.terminal_id.as_deref()) {
            if terminal_id != scope.terminal_id {
                return Err(LifecycleError::InvalidInput {
                    field: "session.terminalId".to_string(),
                    reason: "session terminal does not match the desktop bridge token".to_string(),
                });
            }
        }

        if let Some(workspace_id) = workspace_id {
            if workspace_id != scope.workspace_id {
                return Err(LifecycleError::InvalidInput {
                    field: "workspaceId".to_string(),
                    reason: "workspace id does not match the current session".to_string(),
                });
            }
        }

        Ok(scope.workspace_id)
    }

    fn lookup_session_scope(
        &self,
        token: &str,
    ) -> Result<DesktopBridgeSessionScope, LifecycleError> {
        self.inner
            .session_scopes
            .lock()
            .unwrap()
            .get(token)
            .cloned()
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "session.token".to_string(),
                reason: "desktop bridge session token is invalid or expired".to_string(),
            })
    }

    fn complete_shell_request(
        &self,
        request_id: &str,
        result: Result<DesktopBridgeShellResult, LifecycleError>,
    ) -> Result<(), LifecycleError> {
        let sender = self
            .inner
            .pending_shell_requests
            .lock()
            .unwrap()
            .remove(request_id)
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "requestId".to_string(),
                reason: format!("unknown desktop bridge shell request: {request_id}"),
            })?;

        sender.send(result).map_err(|_| {
            LifecycleError::Io(format!(
                "desktop bridge shell request receiver was dropped: {request_id}"
            ))
        })
    }
}

#[tauri::command]
pub async fn desktop_bridge_complete_shell_request(
    desktop_bridge: State<'_, DesktopBridgeState>,
    request_id: String,
    result: DesktopBridgeShellResult,
) -> Result<(), LifecycleError> {
    desktop_bridge.complete_shell_request(&request_id, Ok(result))
}

#[tauri::command]
pub async fn desktop_bridge_fail_shell_request(
    desktop_bridge: State<'_, DesktopBridgeState>,
    request_id: String,
    error: DesktopBridgeShellFailureInput,
) -> Result<(), LifecycleError> {
    let reason = if let Some(code) = error.code {
        format!("{code}: {}", error.message)
    } else {
        error.message
    };

    desktop_bridge.complete_shell_request(&request_id, Err(LifecycleError::AttachFailed(reason)))
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
                "failed to serialize desktop bridge error: {serialization_error}"
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

fn default_browser_key(url: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    url.hash(&mut hasher);
    format!("url:{:016x}", hasher.finish())
}

fn default_browser_label(url: &str) -> String {
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
    use super::build_socket_path;

    #[test]
    fn unix_socket_path_stays_short_enough_for_macos() {
        let path = build_socket_path();
        let path_str = path.to_string_lossy();

        assert!(path_str.starts_with("/tmp/"));
        assert!(path_str.len() < 104);
    }
}
