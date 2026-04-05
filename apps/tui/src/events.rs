use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::Duration;

use crate::bridge::{current_bridge_url_from_registration, LifecycleBridgeClient};

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

fn to_ws_url(base_url: &str) -> String {
    base_url
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        + "/ws"
}

impl BridgeEventStream {
    pub fn connect(bridge: &LifecycleBridgeClient) -> Self {
        let (tx, rx) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = stop.clone();
        let bridge_for_thread = bridge.clone();

        let mut ws_url = to_ws_url(&bridge.base_url());

        std::thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                // Check if the file watcher already detected a new URL.
                if let Some(new_base) = bridge_for_thread.poll_url_changed() {
                    let next = to_ws_url(&new_base);
                    if next != ws_url {
                        crate::debug::log(format!(
                            "bridge ws: registration watcher detected new endpoint: {next}"
                        ));
                        ws_url = next;
                    }
                }

                match tungstenite::connect(&ws_url) {
                    Ok((mut socket, _)) => {
                        crate::debug::log(format!("bridge ws connected to {ws_url}"));

                        // Set a read timeout so we periodically wake up to
                        // check for registration file changes.
                        if let tungstenite::stream::MaybeTlsStream::Plain(ref tcp) =
                            socket.get_ref()
                        {
                            let _ = tcp.set_read_timeout(Some(Duration::from_secs(2)));
                        }

                        while !stop_flag.load(Ordering::Relaxed) {
                            // Between reads, check for watcher-driven URL changes.
                            if let Some(new_base) = bridge_for_thread.poll_url_changed() {
                                let next = to_ws_url(&new_base);
                                if next != ws_url {
                                    crate::debug::log(format!(
                                        "bridge ws: registration changed while connected, reconnecting to {next}"
                                    ));
                                    ws_url = next;
                                    let _ = socket.close(None);
                                    break;
                                }
                            }

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
                                Err(tungstenite::Error::Io(ref e))
                                    if e.kind() == std::io::ErrorKind::WouldBlock
                                        || e.kind() == std::io::ErrorKind::TimedOut =>
                                {
                                    // Read timeout — loop back to check for URL changes.
                                    continue;
                                }
                                Err(_) => break,
                                _ => {}
                            }
                        }
                    }
                    Err(e) => {
                        crate::debug::log(format!("bridge ws connect failed: {e}"));
                        if let Some(next_base_url) = current_bridge_url_from_registration() {
                            let next_ws_url = to_ws_url(&next_base_url);
                            if next_ws_url != ws_url {
                                crate::debug::log(format!(
                                    "bridge ws rediscovered new endpoint: {next_ws_url}"
                                ));
                                ws_url = next_ws_url;
                            }
                        }
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
