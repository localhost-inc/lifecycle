use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

/// Events pushed from the bridge over WebSocket.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(tag = "type")]
pub enum BridgeEvent {
    #[serde(rename = "connected")]
    Connected {
        #[serde(rename = "clientId")]
        client_id: String,
    },
    #[serde(rename = "activity")]
    Activity {
        workspaces: Vec<ActivityWorkspace>,
    },
    #[serde(rename = "service.started")]
    ServiceStarted {
        workspace_id: String,
        service: String,
    },
    #[serde(rename = "service.stopped")]
    ServiceStopped {
        workspace_id: String,
        service: String,
    },
    #[serde(rename = "service.failed")]
    ServiceFailed {
        workspace_id: String,
        service: String,
        error: Option<String>,
    },
    #[serde(rename = "workspace.provisioning")]
    WorkspaceProvisioning { workspace_id: String },
    #[serde(rename = "workspace.ready")]
    WorkspaceReady { workspace_id: String },
    #[serde(rename = "workspace.failed")]
    WorkspaceFailed {
        workspace_id: String,
        error: Option<String>,
    },
    #[serde(rename = "pong")]
    Pong,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct ActivityWorkspace {
    pub repo: String,
    pub name: String,
    pub busy: bool,
}

pub struct BridgeEventStream {
    rx: mpsc::Receiver<BridgeEvent>,
    stop: Arc<AtomicBool>,
}

impl BridgeEventStream {
    pub fn connect(base_url: &str) -> Self {
        let (tx, rx) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = stop.clone();

        let ws_url = base_url
            .replace("http://", "ws://")
            .replace("https://", "wss://")
            + "/ws";

        std::thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match tungstenite::connect(&ws_url) {
                    Ok((mut socket, _)) => {
                        crate::debug::log(format!("bridge ws connected to {ws_url}"));
                        while !stop_flag.load(Ordering::Relaxed) {
                            match socket.read() {
                                Ok(tungstenite::Message::Text(text)) => {
                                    if let Ok(event) =
                                        serde_json::from_str::<BridgeEvent>(&text)
                                    {
                                        if tx.send(event).is_err() {
                                            return;
                                        }
                                    }
                                }
                                Ok(tungstenite::Message::Ping(data)) => {
                                    let _ = socket.send(tungstenite::Message::Pong(data));
                                }
                                Ok(tungstenite::Message::Close(_)) => break,
                                Err(_) => break,
                                _ => {}
                            }
                        }
                    }
                    Err(e) => {
                        crate::debug::log(format!("bridge ws connect failed: {e}"));
                    }
                }
                if !stop_flag.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        });

        Self { rx, stop }
    }

    /// Drain all pending events.
    pub fn drain(&self) -> Vec<BridgeEvent> {
        let mut events = Vec::new();
        while let Ok(event) = self.rx.try_recv() {
            events.push(event);
        }
        events
    }
}

impl Drop for BridgeEventStream {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
