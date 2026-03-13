use crate::platform::runtime::supervisor::Supervisor;
use crate::shared::errors::LifecycleError;
use crate::ManagedSupervisor;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::SystemTime;
use tokio::sync::{watch, Mutex as AsyncMutex, Notify};

pub(crate) type ManagedWorkspaceController = Arc<WorkspaceController>;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct WorkspaceTerminalSession {
    pub(crate) command_line: String,
    pub(crate) launched_at: SystemTime,
    pub(crate) working_directory: String,
}

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
    terminal_sessions: AsyncMutex<HashMap<String, WorkspaceTerminalSession>>,
    active_mutations: AtomicUsize,
    mutation_drained: Notify,
}

pub(crate) struct WorkspaceMutationGuard {
    controller: ManagedWorkspaceController,
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
            terminal_sessions: AsyncMutex::new(HashMap::new()),
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

    pub(crate) async fn register_terminal_session(
        &self,
        terminal_id: &str,
        session: WorkspaceTerminalSession,
    ) {
        let mut terminal_sessions = self.terminal_sessions.lock().await;
        terminal_sessions.insert(terminal_id.to_string(), session);
    }

    pub(crate) async fn session_for_terminal(
        &self,
        terminal_id: &str,
    ) -> Option<WorkspaceTerminalSession> {
        let terminal_sessions = self.terminal_sessions.lock().await;
        terminal_sessions.get(terminal_id).cloned()
    }

    pub(crate) async fn remove_terminal_session(
        &self,
        terminal_id: &str,
    ) -> Option<WorkspaceTerminalSession> {
        let mut terminal_sessions = self.terminal_sessions.lock().await;
        terminal_sessions.remove(terminal_id)
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
    controllers: AsyncMutex<HashMap<String, ManagedWorkspaceController>>,
}

impl WorkspaceControllerRegistry {
    pub(crate) fn new() -> Self {
        Self {
            controllers: AsyncMutex::new(HashMap::new()),
        }
    }

    pub(crate) async fn get_or_create(&self, workspace_id: &str) -> ManagedWorkspaceController {
        let mut controllers = self.controllers.lock().await;
        controllers
            .entry(workspace_id.to_string())
            .or_insert_with(|| Arc::new(WorkspaceController::new()))
            .clone()
    }

    pub(crate) async fn get(&self, workspace_id: &str) -> Option<ManagedWorkspaceController> {
        let controllers = self.controllers.lock().await;
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
        let mut controllers = self.controllers.lock().await;
        controllers.remove(workspace_id)
    }
}

#[cfg(test)]
mod tests {
    use super::{WorkspaceControllerRegistry, WorkspaceTerminalSession};
    use std::sync::Arc;
    use std::time::SystemTime;

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
    async fn register_terminal_session_tracks_runtime_sessions() {
        let registry = WorkspaceControllerRegistry::new();
        let controller = registry.get_or_create("workspace-1").await;
        let launched_at = SystemTime::now();

        controller
            .register_terminal_session(
                "terminal-1",
                WorkspaceTerminalSession {
                    command_line: "exec codex".to_string(),
                    launched_at,
                    working_directory: "/tmp/workspace".to_string(),
                },
            )
            .await;

        let session = controller
            .session_for_terminal("terminal-1")
            .await
            .expect("session");
        assert_eq!(session.command_line, "exec codex");
        assert_eq!(session.working_directory, "/tmp/workspace");
        assert_eq!(session.launched_at, launched_at);

        assert!(controller
            .remove_terminal_session("terminal-1")
            .await
            .is_some());
        assert!(controller
            .session_for_terminal("terminal-1")
            .await
            .is_none());
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
}
