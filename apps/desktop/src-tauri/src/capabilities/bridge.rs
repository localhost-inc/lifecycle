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

const BRIDGE_VERSION: u8 = 1;

#[derive(Clone)]
pub struct BridgeState {
    inner: Arc<BridgeStateInner>,
}

struct BridgeStateInner {
    endpoint_path: Option<String>,
    pending_shell_requests:
        StdMutex<std::collections::HashMap<String, oneshot::Sender<Result<BridgeShellResult, LifecycleError>>>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeRequestEnvelope {
    id: String,
    method: String,
    version: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeShellResult {
    project_id: String,
    surface: String,
    tab_key: String,
    url: String,
    context_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeShellFailureInput {
    code: Option<String>,
    message: String,
}

impl BridgeState {
    pub(crate) fn start(app: tauri::AppHandle) -> Result<Self, LifecycleError> {
        #[cfg(unix)]
        {
            let endpoint_path = build_socket_path();
            let listener = bind_socket_listener(&endpoint_path)?;
            let state = Self {
                inner: Arc::new(BridgeStateInner {
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
            inner: Arc::new(BridgeStateInner {
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
                );
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

        serialize_bridge_error(
            request.id,
            request.method,
            LifecycleError::InvalidInput {
                field: "method".to_string(),
                reason: "native bridge no longer serves control-plane requests".to_string(),
            },
        )
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
    context_id: String,
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
    let _ = request.context_id;

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

fn serialize_bridge_error(request_id: String, method: String, error: LifecycleError) -> String {
    serde_json::json!({
        "id": request_id,
        "method": method,
        "ok": false,
        "error": error,
    })
    .to_string()
}
