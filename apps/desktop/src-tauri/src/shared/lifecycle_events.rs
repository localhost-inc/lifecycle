use serde::Serialize;
use tauri::{AppHandle, Emitter};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

pub const LIFECYCLE_EVENT_NAME: &str = "lifecycle:event";

#[derive(Debug, Clone, Serialize)]
pub struct LifecycleEnvelope {
    pub id: String,
    pub occurred_at: String,
    #[serde(flatten)]
    pub event: LifecycleEvent,
}

/// Generic infrastructure events emitted by the Rust backend.
/// Generic infrastructure events. Application-scoped events are constructed in TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind")]
pub enum LifecycleEvent {
    #[serde(rename = "file.changed")]
    FileChanged {
        root_path: String,
        file_path: String,
    },
}

pub fn publish_lifecycle_event(app: &AppHandle, event: LifecycleEvent) {
    let occurred_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let envelope = LifecycleEnvelope {
        id: Uuid::new_v4().to_string(),
        occurred_at,
        event,
    };

    let _ = app.emit(LIFECYCLE_EVENT_NAME, envelope);
}
