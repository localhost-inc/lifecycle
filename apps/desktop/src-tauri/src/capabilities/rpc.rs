use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::net::UnixListener as StdUnixListener;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};
use tauri::State;
#[cfg(unix)]
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
#[cfg(unix)]
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::oneshot;

const DESKTOP_RPC_VERSION: u8 = 1;

#[derive(Clone)]
pub struct DesktopRpcState {
    inner: Arc<DesktopRpcStateInner>,
}

struct DesktopRpcStateInner {
    endpoint_path: Option<String>,
    pending_shell_requests:
        StdMutex<std::collections::HashMap<String, oneshot::Sender<Result<DesktopRpcShellResult, LifecycleError>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRpcRequestEnvelope {
    id: String,
    method: String,
    version: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRpcShellResult {
    project_id: String,
    surface: String,
    tab_key: String,
    url: String,
    context_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRpcShellFailureInput {
    code: Option<String>,
    message: String,
}

impl DesktopRpcState {
    pub(crate) fn start(app: tauri::AppHandle) -> Result<Self, LifecycleError> {
        #[cfg(unix)]
        {
            let endpoint_path = build_socket_path();
            let listener = bind_socket_listener(&endpoint_path)?;
            let state = Self {
                inner: Arc::new(DesktopRpcStateInner {
                    endpoint_path: Some(endpoint_path.to_string_lossy().to_string()),
                    pending_shell_requests: StdMutex::new(std::collections::HashMap::new()),
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
            inner: Arc::new(DesktopRpcStateInner {
                endpoint_path: None,
                pending_shell_requests: StdMutex::new(std::collections::HashMap::new()),
            }),
        }
    }

    #[cfg(unix)]
    fn spawn_accept_loop(&self, app: tauri::AppHandle, listener: StdUnixListener) {
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            let listener = match UnixListener::from_std(listener) {
                Ok(listener) => listener,
                Err(error) => {
                    crate::platform::diagnostics::append_error(
                        "desktop-rpc-listener",
                        LifecycleError::Io(format!("failed to adopt desktop rpc listener: {error}")),
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
                                    "desktop-rpc-connection",
                                    error,
                                );
                            }
                        });
                    }
                    Err(error) => {
                        crate::platform::diagnostics::append_error(
                            "desktop-rpc-listener",
                            LifecycleError::Io(format!("desktop rpc listener failed: {error}")),
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
        _app: tauri::AppHandle,
        stream: UnixStream,
    ) -> Result<(), LifecycleError> {
        let (reader, mut writer) = tokio::io::split(stream);
        let mut reader = BufReader::new(reader);
        let mut line = String::new();
        let bytes_read = reader.read_line(&mut line).await?;
        if bytes_read == 0 {
            return Ok(());
        }

        let response = self.handle_request(line.trim());
        writer.write_all(response.as_bytes()).await?;
        writer.write_all(b"\n").await?;
        writer.flush().await?;
        Ok(())
    }

    fn handle_request(&self, raw_request: &str) -> String {
        let request = match serde_json::from_str::<DesktopRpcRequestEnvelope>(raw_request) {
            Ok(request) => request,
            Err(error) => {
                return serialize_desktop_rpc_error(
                    "unknown".to_string(),
                    "unknown".to_string(),
                    LifecycleError::InvalidInput {
                        field: "request".to_string(),
                        reason: format!("invalid desktop rpc payload: {error}"),
                    },
                );
            }
        };

        if request.version != DESKTOP_RPC_VERSION {
            return serialize_desktop_rpc_error(
                request.id,
                request.method,
                LifecycleError::InvalidInput {
                    field: "version".to_string(),
                    reason: format!("unsupported desktop rpc version: {}", request.version),
                },
            );
        }

        serialize_desktop_rpc_error(
            request.id,
            request.method,
            LifecycleError::InvalidInput {
                field: "method".to_string(),
                reason: "native desktop rpc no longer serves control-plane requests".to_string(),
            },
        )
    }

    fn complete_shell_request(
        &self,
        request_id: &str,
        result: Result<DesktopRpcShellResult, LifecycleError>,
    ) -> Result<(), LifecycleError> {
        let sender = self
            .inner
            .pending_shell_requests
            .lock()
            .unwrap()
            .remove(request_id)
            .ok_or_else(|| LifecycleError::InvalidInput {
                field: "requestId".to_string(),
                reason: format!("unknown desktop rpc shell request: {request_id}"),
            })?;

        sender.send(result).map_err(|_| {
            LifecycleError::Io(format!(
                "desktop rpc shell request receiver was dropped: {request_id}"
            ))
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRpcCreateAgentSessionRequest {
    context_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRpcAgentSession {
    socket_path: String,
    session_token: String,
}

#[tauri::command]
pub fn desktop_rpc_create_agent_session(
    gateway: State<'_, DesktopRpcState>,
    request: DesktopRpcCreateAgentSessionRequest,
) -> Result<DesktopRpcAgentSession, LifecycleError> {
    let endpoint_path = gateway
        .inner
        .endpoint_path
        .as_ref()
        .ok_or_else(|| LifecycleError::AttachFailed("Desktop RPC is not available.".to_string()))?
        .clone();

    let token = uuid::Uuid::new_v4().to_string();
    let _ = request.context_id;

    Ok(DesktopRpcAgentSession {
        socket_path: endpoint_path,
        session_token: token,
    })
}

#[tauri::command]
pub async fn desktop_rpc_complete_shell_request(
    gateway: State<'_, DesktopRpcState>,
    request_id: String,
    result: DesktopRpcShellResult,
) -> Result<(), LifecycleError> {
    gateway.complete_shell_request(&request_id, Ok(result))
}

#[tauri::command]
pub async fn desktop_rpc_fail_shell_request(
    gateway: State<'_, DesktopRpcState>,
    request_id: String,
    error: DesktopRpcShellFailureInput,
) -> Result<(), LifecycleError> {
    let reason = if let Some(code) = error.code {
        format!("{code}: {}", error.message)
    } else {
        error.message
    };

    gateway.complete_shell_request(&request_id, Err(LifecycleError::AttachFailed(reason)))
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

fn serialize_desktop_rpc_error(
    request_id: String,
    method: String,
    error: LifecycleError,
) -> String {
    serde_json::json!({
        "id": request_id,
        "method": method,
        "ok": false,
        "error": error,
    })
    .to_string()
}
