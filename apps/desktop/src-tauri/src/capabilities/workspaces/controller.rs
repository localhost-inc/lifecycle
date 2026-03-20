use crate::platform::runtime::supervisor::Supervisor;
use crate::shared::errors::LifecycleError;
use crate::shared::lifecycle_events::{LifecycleEnvelope, LifecycleEvent};
use crate::ManagedSupervisor;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{watch, Mutex as AsyncMutex, Notify};

pub(crate) type ManagedWorkspaceController = Arc<WorkspaceController>;
const WORKSPACE_ACTIVITY_LIMIT: usize = 32;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WorkspaceControllerOperation {
    DestroyRequested,
    Idle,
    Starting,
    StopRequested,
}

#[derive(Debug)]
struct WorkspaceControllerState {
    generation: u64,
    operation: WorkspaceControllerOperation,
}

#[derive(Clone, Debug)]
pub(crate) struct WorkspaceControllerToken {
    cancellation_rx: watch::Receiver<u64>,
    generation: u64,
}

impl WorkspaceControllerToken {
    pub(crate) async fn cancelled(&mut self) {
        while *self.cancellation_rx.borrow() == self.generation {
            if self.cancellation_rx.changed().await.is_err() {
                break;
            }
        }
    }

    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }

    pub(crate) fn is_cancelled(&self) -> bool {
        *self.cancellation_rx.borrow() != self.generation
    }
}

pub(crate) struct WorkspaceController {
    cancellation_tx: watch::Sender<u64>,
    state: AsyncMutex<WorkspaceControllerState>,
    supervisor: ManagedSupervisor,
    activity: StdMutex<WorkspaceActivityStore>,
    service_logs: StdMutex<WorkspaceServiceLogStore>,
    active_mutations: AtomicUsize,
    mutation_drained: Notify,
}

pub(crate) struct WorkspaceMutationGuard {
    controller: ManagedWorkspaceController,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceLogLine {
    pub(crate) stream: String,
    pub(crate) text: String,
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ServiceLogSnapshot {
    pub(crate) name: String,
    pub(crate) lines: Vec<ServiceLogLine>,
}

const SERVICE_LOG_LINE_LIMIT: usize = 5000;

#[derive(Clone, Debug, Default)]
struct WorkspaceActivityStore {
    items: Vec<LifecycleEnvelope>,
}

#[derive(Clone, Debug, Default)]
struct WorkspaceServiceLogStore {
    logs: Vec<ServiceLogSnapshot>,
}

impl Drop for WorkspaceMutationGuard {
    fn drop(&mut self) {
        if self
            .controller
            .active_mutations
            .fetch_sub(1, Ordering::AcqRel)
            == 1
        {
            self.controller.mutation_drained.notify_waiters();
        }
    }
}

impl WorkspaceController {
    pub(crate) fn new() -> Self {
        let (cancellation_tx, _) = watch::channel(0_u64);
        Self {
            cancellation_tx,
            state: AsyncMutex::new(WorkspaceControllerState {
                generation: 0,
                operation: WorkspaceControllerOperation::Idle,
            }),
            supervisor: Arc::new(AsyncMutex::new(Supervisor::new())),
            activity: StdMutex::new(WorkspaceActivityStore::default()),
            service_logs: StdMutex::new(WorkspaceServiceLogStore::default()),
            active_mutations: AtomicUsize::new(0),
            mutation_drained: Notify::new(),
        }
    }

    pub(crate) async fn acquire_mutation_guard(
        self: &ManagedWorkspaceController,
    ) -> Result<WorkspaceMutationGuard, LifecycleError> {
        self.begin_mutation().await?;
        Ok(WorkspaceMutationGuard {
            controller: self.clone(),
        })
    }

    pub(crate) async fn begin_start(&self) -> Result<WorkspaceControllerToken, LifecycleError> {
        self.bump_generation(WorkspaceControllerOperation::Starting, true)
            .await
    }

    pub(crate) async fn finish_start(&self, token: &WorkspaceControllerToken) {
        let mut state = self.state.lock().await;
        if state.generation == token.generation() {
            state.operation = WorkspaceControllerOperation::Idle;
        }
    }

    pub(crate) async fn request_destroy(&self) {
        let _ = self
            .bump_generation(WorkspaceControllerOperation::DestroyRequested, false)
            .await;
        self.wait_for_mutations().await;
    }

    pub(crate) async fn request_stop(&self) {
        let _ = self
            .bump_generation(WorkspaceControllerOperation::StopRequested, false)
            .await;
    }

    pub(crate) fn supervisor(&self) -> ManagedSupervisor {
        self.supervisor.clone()
    }

    pub(crate) fn record_lifecycle_envelope(&self, envelope: LifecycleEnvelope) {
        self.activity
            .lock()
            .expect("workspace activity lock")
            .record(&envelope);
        self.service_logs
            .lock()
            .expect("workspace service logs lock")
            .record(&envelope);
    }

    pub(crate) fn activity(&self) -> Vec<LifecycleEnvelope> {
        self.activity
            .lock()
            .expect("workspace activity lock")
            .snapshot()
    }

    pub(crate) fn service_logs(&self) -> Vec<ServiceLogSnapshot> {
        self.service_logs
            .lock()
            .expect("workspace service logs lock")
            .snapshot()
    }

    pub(crate) async fn stop_runtime(&self) {
        let mut supervisor = self.supervisor.lock().await;
        supervisor.stop_all().await;
    }

    async fn begin_mutation(&self) -> Result<(), LifecycleError> {
        let state = self.state.lock().await;
        if matches!(
            state.operation,
            WorkspaceControllerOperation::DestroyRequested
        ) {
            return Err(LifecycleError::WorkspaceMutationLocked {
                status: "destroying".to_string(),
            });
        }
        self.active_mutations.fetch_add(1, Ordering::AcqRel);
        drop(state);
        Ok(())
    }

    async fn bump_generation(
        &self,
        operation: WorkspaceControllerOperation,
        reject_if_destroying: bool,
    ) -> Result<WorkspaceControllerToken, LifecycleError> {
        let mut state = self.state.lock().await;
        if reject_if_destroying
            && matches!(
                state.operation,
                WorkspaceControllerOperation::DestroyRequested
            )
        {
            return Err(LifecycleError::WorkspaceMutationLocked {
                status: "destroying".to_string(),
            });
        }
        state.generation += 1;
        state.operation = operation;
        let generation = state.generation;
        drop(state);

        let cancellation_rx = self.cancellation_tx.subscribe();
        let _ = self.cancellation_tx.send(generation);
        Ok(WorkspaceControllerToken {
            cancellation_rx,
            generation,
        })
    }

    async fn wait_for_mutations(&self) {
        loop {
            if self.active_mutations.load(Ordering::Acquire) == 0 {
                return;
            }

            self.mutation_drained.notified().await;
        }
    }
}

pub(crate) struct WorkspaceControllerRegistry {
    controllers: StdMutex<HashMap<String, ManagedWorkspaceController>>,
}

impl WorkspaceControllerRegistry {
    pub(crate) fn new() -> Self {
        Self {
            controllers: StdMutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn get_or_create(&self, workspace_id: &str) -> ManagedWorkspaceController {
        let mut controllers = self.controllers.lock().expect("workspace controller lock");
        controllers
            .entry(workspace_id.to_string())
            .or_insert_with(|| Arc::new(WorkspaceController::new()))
            .clone()
    }

    pub(crate) async fn get(&self, workspace_id: &str) -> Option<ManagedWorkspaceController> {
        let controllers = self.controllers.lock().expect("workspace controller lock");
        controllers.get(workspace_id).cloned()
    }

    pub(crate) async fn acquire_mutation_guard(
        &self,
        workspace_id: &str,
    ) -> Result<WorkspaceMutationGuard, LifecycleError> {
        let controller = self.get_or_create(workspace_id).await;
        controller.acquire_mutation_guard().await
    }

    pub(crate) async fn remove(&self, workspace_id: &str) -> Option<ManagedWorkspaceController> {
        let mut controllers = self.controllers.lock().expect("workspace controller lock");
        controllers.remove(workspace_id)
    }

    pub(crate) async fn stop_all_runtimes(&self) {
        let controllers: Vec<ManagedWorkspaceController> = {
            let controllers = self.controllers.lock().expect("workspace controller lock");
            controllers.values().cloned().collect()
        };
        for controller in controllers {
            controller.request_stop().await;
            controller.stop_runtime().await;
        }
    }

    pub(crate) fn record_lifecycle_envelope(
        &self,
        workspace_id: &str,
        envelope: LifecycleEnvelope,
    ) {
        let controller = {
            let mut controllers = self.controllers.lock().expect("workspace controller lock");
            controllers
                .entry(workspace_id.to_string())
                .or_insert_with(|| Arc::new(WorkspaceController::new()))
                .clone()
        };
        controller.record_lifecycle_envelope(envelope);
    }
}

impl WorkspaceActivityStore {
    fn record(&mut self, envelope: &LifecycleEnvelope) {
        if !envelope.event.contributes_to_activity() {
            return;
        }

        self.items.retain(|event| event.id != envelope.id);
        self.items.insert(0, envelope.clone());
        self.items.truncate(WORKSPACE_ACTIVITY_LIMIT);
    }

    fn snapshot(&self) -> Vec<LifecycleEnvelope> {
        self.items.clone()
    }
}

impl WorkspaceServiceLogStore {
    fn record(&mut self, envelope: &LifecycleEnvelope) {
        match &envelope.event {
            LifecycleEvent::EnvironmentStatusChanged { status, .. }
                if status == "preparing" || status == "starting" =>
            {
                self.logs.clear();
            }
            LifecycleEvent::ServiceLogLine {
                name,
                stream,
                line,
                ..
            } => {
                let log_line = ServiceLogLine {
                    stream: stream.clone(),
                    text: line.clone(),
                };
                let entry = self
                    .logs
                    .iter_mut()
                    .find(|existing| existing.name == *name);
                if let Some(entry) = entry {
                    entry.lines.push(log_line);
                    if entry.lines.len() > SERVICE_LOG_LINE_LIMIT {
                        let excess = entry.lines.len() - SERVICE_LOG_LINE_LIMIT;
                        entry.lines.drain(..excess);
                    }
                } else {
                    self.logs.push(ServiceLogSnapshot {
                        name: name.clone(),
                        lines: vec![log_line],
                    });
                }
            }
            _ => {}
        }
    }

    fn snapshot(&self) -> Vec<ServiceLogSnapshot> {
        self.logs.clone()
    }
}

#[cfg(test)]
mod tests {
    use super::WorkspaceControllerRegistry;
    use crate::shared::lifecycle_events::{LifecycleEnvelope, LifecycleEvent};
    use std::sync::Arc;

    fn envelope(id: &str, event: LifecycleEvent) -> LifecycleEnvelope {
        LifecycleEnvelope {
            id: id.to_string(),
            occurred_at: "2026-03-13T12:00:00Z".to_string(),
            event,
        }
    }

    #[tokio::test]
    async fn get_or_create_reuses_controller_for_workspace() {
        let registry = WorkspaceControllerRegistry::new();

        let first = registry.get_or_create("workspace-1").await;
        let second = registry.get_or_create("workspace-1").await;

        assert!(Arc::ptr_eq(&first, &second));
    }

    #[tokio::test]
    async fn remove_only_drops_requested_workspace_controller() {
        let registry = WorkspaceControllerRegistry::new();

        let retained = registry.get_or_create("workspace-1").await;
        let removed = registry.get_or_create("workspace-2").await;

        let removed_again = registry.remove("workspace-2").await;

        assert!(removed_again.is_some());
        assert!(Arc::ptr_eq(
            &removed,
            removed_again.as_ref().expect("removed controller"),
        ));
        assert!(registry.get("workspace-2").await.is_none());
        assert!(Arc::ptr_eq(
            &retained,
            &registry
                .get("workspace-1")
                .await
                .expect("retained controller"),
        ));
    }

    #[tokio::test]
    async fn stop_request_cancels_inflight_controller_token() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;
        let token = controller.begin_start().await.expect("start token");

        assert!(!token.is_cancelled());

        controller.request_stop().await;

        assert!(token.is_cancelled());
    }

    #[tokio::test]
    async fn destroy_request_rejects_mutations() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;

        controller.request_destroy().await;

        assert!(matches!(
            controller.acquire_mutation_guard().await,
            Err(crate::shared::errors::LifecycleError::WorkspaceMutationLocked { status })
                if status == "destroying"
        ));
    }

    #[tokio::test]
    async fn destroy_request_waits_for_inflight_mutation_guards() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;
        let mutation_guard = controller
            .acquire_mutation_guard()
            .await
            .expect("mutation guard");

        let destroy_controller = controller.clone();
        let destroy_task = tokio::spawn(async move {
            destroy_controller.request_destroy().await;
        });

        tokio::task::yield_now().await;
        assert!(!destroy_task.is_finished());

        drop(mutation_guard);
        destroy_task.await.expect("destroy task");
        assert!(matches!(
            controller.begin_start().await,
            Err(crate::shared::errors::LifecycleError::WorkspaceMutationLocked { status })
                if status == "destroying"
        ));
    }

    #[tokio::test]
    async fn controller_selectors_filter_activity_noise() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;

        controller.record_lifecycle_envelope(envelope(
            "event-1",
            LifecycleEvent::EnvironmentStatusChanged {
                workspace_id: "workspace-1".to_string(),
                status: "starting".to_string(),
                failure_reason: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-2",
            LifecycleEvent::ServiceLogLine {
                workspace_id: "workspace-1".to_string(),
                name: "api".to_string(),
                stream: "stdout".to_string(),
                line: "booting".to_string(),
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-3",
            LifecycleEvent::TerminalUpdated {
                workspace_id: "workspace-1".to_string(),
                terminal: crate::capabilities::workspaces::query::TerminalRecord {
                    id: "terminal-1".to_string(),
                    workspace_id: "workspace-1".to_string(),
                    launch_type: "shell".to_string(),
                    harness_provider: None,
                    harness_session_id: None,
                    harness_launch_mode: "new".to_string(),
                    created_by: None,
                    label: "Shell".to_string(),
                    label_origin: Some("default".to_string()),
                    status: "active".to_string(),
                    failure_reason: None,
                    exit_code: None,
                    started_at: "2026-03-15 10:00:00".to_string(),
                    last_active_at: "2026-03-15 10:00:00".to_string(),
                    ended_at: None,
                },
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-4",
            LifecycleEvent::ServiceStatusChanged {
                workspace_id: "workspace-1".to_string(),
                name: "api".to_string(),
                status: "ready".to_string(),
                status_reason: None,
            },
        ));

        let activity = controller.activity();
        assert_eq!(
            activity
                .iter()
                .map(|event| event.id.as_str())
                .collect::<Vec<_>>(),
            vec!["event-4", "event-1"]
        );
    }
}
