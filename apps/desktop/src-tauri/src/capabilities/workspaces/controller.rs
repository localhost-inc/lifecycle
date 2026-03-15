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
    runtime_projection: StdMutex<WorkspaceRuntimeProjectionState>,
    active_mutations: AtomicUsize,
    mutation_drained: Notify,
}

pub(crate) struct WorkspaceMutationGuard {
    controller: ManagedWorkspaceController,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize, Eq, PartialEq)]
pub(crate) struct WorkspaceStepProgressSnapshot {
    pub(crate) name: String,
    pub(crate) output: Vec<String>,
    pub(crate) status: String,
}

#[derive(Clone, Debug, Default)]
struct WorkspaceRuntimeProjectionState {
    activity: Vec<LifecycleEnvelope>,
    environment_tasks: Vec<WorkspaceStepProgressSnapshot>,
    setup: Vec<WorkspaceStepProgressSnapshot>,
}

#[derive(Clone, Debug, Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceRuntimeProjectionSnapshot {
    pub(crate) activity: Vec<LifecycleEnvelope>,
    pub(crate) environment_tasks: Vec<WorkspaceStepProgressSnapshot>,
    pub(crate) setup: Vec<WorkspaceStepProgressSnapshot>,
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
            runtime_projection: StdMutex::new(WorkspaceRuntimeProjectionState::default()),
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
        let mut projection = self
            .runtime_projection
            .lock()
            .expect("workspace runtime projection lock");
        projection.apply_event(&envelope);
    }

    pub(crate) fn runtime_projection_snapshot(&self) -> WorkspaceRuntimeProjectionSnapshot {
        let projection = self
            .runtime_projection
            .lock()
            .expect("workspace runtime projection lock");
        WorkspaceRuntimeProjectionSnapshot {
            activity: projection.activity.clone(),
            environment_tasks: projection.environment_tasks.clone(),
            setup: projection.setup.clone(),
        }
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

impl WorkspaceRuntimeProjectionState {
    fn apply_event(&mut self, envelope: &LifecycleEnvelope) {
        match &envelope.event {
            LifecycleEvent::WorkspaceStatusChanged {
                status,
                failure_reason,
                ..
            } => match status.as_str() {
                "starting" => {
                    self.setup.clear();
                    self.environment_tasks.clear();
                }
                "idle" if failure_reason.is_some() => {
                    normalize_running_steps(&mut self.setup, "failed");
                    normalize_running_steps(&mut self.environment_tasks, "failed");
                }
                _ => {}
            },
            LifecycleEvent::WorkspaceSetupProgress {
                step_name,
                event_kind,
                data,
                ..
            } => apply_step_progress_event(&mut self.setup, step_name, event_kind, data.as_deref()),
            LifecycleEvent::EnvironmentTaskProgress {
                step_name,
                event_kind,
                data,
                ..
            } => apply_step_progress_event(
                &mut self.environment_tasks,
                step_name,
                event_kind,
                data.as_deref(),
            ),
            _ => {}
        }

        if envelope.event.contributes_to_activity() {
            self.activity.retain(|event| event.id != envelope.id);
            self.activity.insert(0, envelope.clone());
            self.activity.truncate(WORKSPACE_ACTIVITY_LIMIT);
        }
    }
}

fn normalize_running_steps(steps: &mut [WorkspaceStepProgressSnapshot], next_status: &str) {
    for step in steps {
        if step.status == "running" {
            step.status = next_status.to_string();
        }
    }
}

fn apply_step_progress_event(
    steps: &mut Vec<WorkspaceStepProgressSnapshot>,
    step_name: &str,
    event_kind: &str,
    data: Option<&str>,
) {
    let index = steps
        .iter()
        .position(|step| step.name == step_name)
        .unwrap_or_else(|| {
            steps.push(WorkspaceStepProgressSnapshot {
                name: step_name.to_string(),
                output: Vec::new(),
                status: "pending".to_string(),
            });
            steps.len() - 1
        });

    let step = &mut steps[index];
    match event_kind {
        "started" => step.status = "running".to_string(),
        "stdout" | "stderr" => step.output.push(data.unwrap_or_default().to_string()),
        "completed" => step.status = "completed".to_string(),
        "failed" => {
            if let Some(data) = data {
                step.output.push(data.to_string());
            }
            step.status = "failed".to_string();
        }
        "timeout" => step.status = "timeout".to_string(),
        _ => {}
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
    async fn runtime_projection_tracks_steps_and_filters_activity_noise() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;

        controller.record_lifecycle_envelope(envelope(
            "event-1",
            LifecycleEvent::WorkspaceStatusChanged {
                workspace_id: "workspace-1".to_string(),
                status: "starting".to_string(),
                failure_reason: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-2",
            LifecycleEvent::WorkspaceSetupProgress {
                workspace_id: "workspace-1".to_string(),
                step_name: "Clone".to_string(),
                event_kind: "started".to_string(),
                data: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-3",
            LifecycleEvent::WorkspaceSetupProgress {
                workspace_id: "workspace-1".to_string(),
                step_name: "Clone".to_string(),
                event_kind: "stdout".to_string(),
                data: Some("fetching".to_string()),
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-4",
            LifecycleEvent::WorkspaceSetupProgress {
                workspace_id: "workspace-1".to_string(),
                step_name: "Clone".to_string(),
                event_kind: "completed".to_string(),
                data: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-5",
            LifecycleEvent::EnvironmentTaskProgress {
                workspace_id: "workspace-1".to_string(),
                step_name: "Install".to_string(),
                event_kind: "failed".to_string(),
                data: Some("npm install failed".to_string()),
            },
        ));

        let snapshot = controller.runtime_projection_snapshot();

        assert_eq!(
            snapshot.setup,
            vec![super::WorkspaceStepProgressSnapshot {
                name: "Clone".to_string(),
                output: vec!["fetching".to_string()],
                status: "completed".to_string(),
            }]
        );
        assert_eq!(
            snapshot.environment_tasks,
            vec![super::WorkspaceStepProgressSnapshot {
                name: "Install".to_string(),
                output: vec!["npm install failed".to_string()],
                status: "failed".to_string(),
            }]
        );
        assert_eq!(
            snapshot
                .activity
                .iter()
                .map(|event| event.id.as_str())
                .collect::<Vec<_>>(),
            vec!["event-5", "event-4", "event-2", "event-1"]
        );
    }

    #[tokio::test]
    async fn runtime_projection_marks_running_steps_failed_when_workspace_returns_to_idle_with_failure()
    {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;

        controller.record_lifecycle_envelope(envelope(
            "event-1",
            LifecycleEvent::WorkspaceStatusChanged {
                workspace_id: "workspace-1".to_string(),
                status: "starting".to_string(),
                failure_reason: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-2",
            LifecycleEvent::WorkspaceSetupProgress {
                workspace_id: "workspace-1".to_string(),
                step_name: "Install".to_string(),
                event_kind: "started".to_string(),
                data: None,
            },
        ));
        controller.record_lifecycle_envelope(envelope(
            "event-3",
            LifecycleEvent::WorkspaceStatusChanged {
                workspace_id: "workspace-1".to_string(),
                status: "idle".to_string(),
                failure_reason: Some("service_start_failed".to_string()),
            },
        ));

        let snapshot = controller.runtime_projection_snapshot();

        assert_eq!(
            snapshot.setup,
            vec![super::WorkspaceStepProgressSnapshot {
                name: "Install".to_string(),
                output: Vec::new(),
                status: "failed".to_string(),
            }]
        );
    }
}
