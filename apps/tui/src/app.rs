use ratatui::{
    layout::{Constraint, Layout, Rect},
    Frame,
};

use std::collections::HashMap;
use std::sync::mpsc;
use std::time::Instant;

use crossterm::event::KeyEvent;

use crate::bridge::LifecycleBridgeClient;
use crate::events::{ActivityWorkspace, BridgeEvent, BridgeEventStream};
use crate::panels::environment::{load_services, EnvironmentPanel, ServiceEntry};
use crate::panels::version_control::{load_git_state, GitState, VersionControlPanel};
use crate::selection::{load_workspace_selection, save_workspace_selection};
use crate::shell::{build_workspace_shell, INITIAL_WORKSPACE_ID_ENV, ShellPlan, WorkspaceBinding, WorkspaceHost, WorkspaceScope, WorkspaceShell};
use crate::sidebar::SidebarState;
use crate::terminal::PtySession;
use crate::vt::{ActiveBackend, VtGrid, VtMouseEvent};

pub const DEFAULT_SIDEBAR_WIDTH: u16 = 34;
pub const DEFAULT_EXTENSIONS_WIDTH: u16 = 38;
pub const MIN_COLUMN_WIDTH: u16 = 10;
pub const MIN_CANVAS_WIDTH: u16 = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Focus {
    Sidebar,
    Canvas,
    Extensions,
}

// ---------------------------------------------------------------------------
// Header dialogs
// ---------------------------------------------------------------------------

pub enum AppDialog {
    None,
    GitCommit(GitDialogState),
}

pub struct GitDialogState {
    pub branch: Option<String>,
    pub staged_count: usize,
    pub unstaged_count: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub commit_message: String,
    pub push_after_commit: bool,
    pub is_busy: bool,
    pub is_loading: bool,
    pub error: Option<String>,
}

pub enum PanelRefreshMessage {
    Loaded {
        workspace_id: Option<String>,
        git: GitState,
        services: Vec<ServiceEntry>,
    },
}

pub enum WorkspaceSwitchMessage {
    Resolved {
        repo_name: String,
        workspace_id: String,
        result: Result<WorkspaceShell, String>,
    },
}

pub enum StackActionMessage {
    Finished {
        workspace_id: String,
        result: Result<Vec<ServiceEntry>, String>,
    },
}

impl Focus {
    pub fn next(self) -> Self {
        match self {
            Self::Sidebar => Self::Canvas,
            Self::Canvas => Self::Extensions,
            Self::Extensions => Self::Sidebar,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            Self::Sidebar => Self::Extensions,
            Self::Canvas => Self::Sidebar,
            Self::Extensions => Self::Canvas,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DragBorder {
    Left,
    Right,
}

/// Braille spinner frames for shell activity indicator.
const SPINNER_FRAMES: &[char] = &['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/// How often the spinner frame advances.
const SPINNER_INTERVAL_MS: u64 = 80;

// ---------------------------------------------------------------------------
// Workspace activity — per-workspace state machine driven by tmux polling.
//
//   Idle ──[command starts]──▶ Busy (spinner)
//     ▲                          │
//     │ [user enters ws]         │ [command ends, ws not active]
//     │                          ▼
//     └───────────────────── Attention (yellow dot)
//
// If the command ends while the workspace IS active → straight to Idle.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceActivity {
    Idle,
    Busy,
    Attention,
}


/// Composite key for a workspace: "repo_name\tws_name".
fn ws_key(repo_name: &str, ws_name: &str) -> String {
    format!("{}\t{}", repo_name, ws_name)
}

fn empty_workspace() -> WorkspaceScope {
    WorkspaceScope {
        binding: WorkspaceBinding::AdHoc,
        workspace_id: None,
        workspace_name: "No workspace selected".to_string(),
        repo_name: None,
        host: WorkspaceHost::Unknown,
        status: None,
        source_ref: None,
        cwd: None,
        worktree_path: None,
        services: vec![],
        resolution_note: Some("Select a workspace from the sidebar to open its shell.".to_string()),
        resolution_error: None,
    }
}

fn empty_shell() -> ShellPlan {
    ShellPlan {
        backend_label: "none".to_string(),
        launch_error: None,
        persistent: false,
        session_name: None,
        prepare: None,
        spec: None,
    }
}

fn command_available(command: &str) -> bool {
    std::process::Command::new(command)
        .arg("-V")
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Git background operations
// ---------------------------------------------------------------------------

pub enum GitBgMessage {
    StatusLoaded {
        branch: Option<String>,
        staged_count: usize,
        unstaged_count: usize,
        insertions: usize,
        deletions: usize,
    },
    CommitDone {
        error: Option<String>,
    },
    PushDone {
        error: Option<String>,
    },
}

pub struct App {
    pub running: bool,
    pub focus: Focus,
    bridge: LifecycleBridgeClient,
    pub workspace: WorkspaceScope,
    pub shell: ShellPlan,
    pub pty: Option<PtySession<ActiveBackend>>,
    pub sidebar_state: SidebarState,
    pub sidebar_width: u16,
    pub extensions_width: u16,
    pub dragging: Option<DragBorder>,
    pub col_rects: [Rect; 3],
    pub divider_rects: [Rect; 2],
    pub vc_panel_rect: Rect,
    pub env_panel_rect: Rect,
    last_canvas_size: (u16, u16),
    pub needs_draw: bool,
    cached_grid: Option<VtGrid>,
    pub mouse_row: Option<u16>,
    /// Status bar message + optional expiry.
    pub status_message: Option<String>,
    status_expires: Option<Instant>,
    pub vc_panel: VersionControlPanel,
    pub env_panel: EnvironmentPanel,
    /// Current spinner animation frame index.
    spinner_frame: usize,
    /// Last time the spinner frame advanced.
    spinner_last_tick: Instant,
    /// Background activity poller — dispatches through WorkspaceHost.
    bridge_events: BridgeEventStream,
    /// Per-workspace activity state, keyed by "repo\tws".
    pub workspace_activity: HashMap<String, WorkspaceActivity>,
    /// Key of the workspace whose PTY is active ("repo\tws").
    active_workspace_key: Option<String>,
    /// Active header dialog (git commit, org switcher, etc.).
    pub dialog: AppDialog,
    /// Screen rect of the Git header button (for click detection).
    pub git_button_rect: Rect,
    /// Screen rect of the Stack header button (for click detection).
    pub stack_button_rect: Rect,
    /// Receiver for git dialog background results.
    git_bg_rx: mpsc::Receiver<GitBgMessage>,
    git_bg_tx: mpsc::Sender<GitBgMessage>,
    panel_refresh_rx: mpsc::Receiver<PanelRefreshMessage>,
    panel_refresh_tx: mpsc::Sender<PanelRefreshMessage>,
    workspace_switch_rx: mpsc::Receiver<WorkspaceSwitchMessage>,
    workspace_switch_tx: mpsc::Sender<WorkspaceSwitchMessage>,
    stack_action_rx: mpsc::Receiver<StackActionMessage>,
    stack_action_tx: mpsc::Sender<StackActionMessage>,
    pending_workspace_switch: Option<String>,
    tmux_available: bool,
}

impl App {
    pub fn new() -> Result<Self, String> {
        let bridge = LifecycleBridgeClient::from_env().ok_or_else(|| {
            "Lifecycle bridge connection is missing. Launch the TUI through `lifecycle` or set LIFECYCLE_BRIDGE_URL.".to_string()
        })?;
        let mut vc_panel = VersionControlPanel::new();
        let mut env_panel = EnvironmentPanel::new();
        vc_panel.refresh(None);
        env_panel.refresh(None);

        let (git_bg_tx, git_bg_rx) = mpsc::channel();
        let (panel_refresh_tx, panel_refresh_rx) = mpsc::channel();
        let (workspace_switch_tx, workspace_switch_rx) = mpsc::channel();
        let (stack_action_tx, stack_action_rx) = mpsc::channel();
        let mut app = Self {
            running: true,
            focus: Focus::Sidebar,
            bridge: bridge.clone(),
            workspace: empty_workspace(),
            sidebar_state: SidebarState::new(),
            shell: empty_shell(),
            pty: None,
            sidebar_width: DEFAULT_SIDEBAR_WIDTH,
            extensions_width: DEFAULT_EXTENSIONS_WIDTH,
            dragging: None,
            col_rects: [Rect::default(); 3],
            divider_rects: [Rect::default(); 2],
            vc_panel_rect: Rect::default(),
            env_panel_rect: Rect::default(),
            last_canvas_size: (0, 0),
            needs_draw: true,
            cached_grid: None,
            mouse_row: None,
            vc_panel,
            env_panel,
            status_message: None,
            status_expires: None,
            spinner_frame: 0,
            spinner_last_tick: Instant::now(),
            bridge_events: BridgeEventStream::connect(bridge.base_url()),
            workspace_activity: HashMap::new(),
            active_workspace_key: None,
            dialog: AppDialog::None,
            git_button_rect: Rect::default(),
            stack_button_rect: Rect::default(),
            git_bg_rx,
            git_bg_tx,
            panel_refresh_rx,
            panel_refresh_tx,
            workspace_switch_rx,
            workspace_switch_tx,
            stack_action_rx,
            stack_action_tx,
            pending_workspace_switch: None,
            tmux_available: command_available("tmux"),
        };

        let restored_workspace_id = std::env::var(INITIAL_WORKSPACE_ID_ENV)
            .ok()
            .or_else(|| std::env::var("LIFECYCLE_WORKSPACE_ID").ok())
            .filter(|value| !value.trim().is_empty())
            .or_else(load_workspace_selection);

        if let Some(workspace_id) = restored_workspace_id {
            if app.sidebar_state.select_workspace_by_id(&workspace_id) {
                app.activate_selected_workspace();
                app.focus = Focus::Canvas;
            }
        }

        Ok(app)
    }

    /// Drain bridge events and dispatch them.
    /// Returns true if any state changed (needs redraw).
    pub fn poll_bridge_events(&mut self) -> bool {
        let events = self.bridge_events.drain();
        if events.is_empty() {
            return false;
        }

        let mut changed = false;
        for event in events {
            match event {
                BridgeEvent::Activity { workspaces } => {
                    changed |= self.apply_activity_update(&workspaces);
                }
                BridgeEvent::Connected { client_id } => {
                    crate::debug::log(format!("bridge connected as {client_id}"));
                }
                BridgeEvent::ServiceStarted {
                    workspace_id,
                    service,
                } => {
                    if self.workspace.workspace_id.as_deref() == Some(workspace_id.as_str()) {
                        self.refresh_workspace_panels_async();
                        self.set_status(format!("Service ready: {service}"), 3);
                    }
                    changed = true;
                }
                BridgeEvent::ServiceStopped {
                    workspace_id,
                    service,
                } => {
                    if self.workspace.workspace_id.as_deref() == Some(workspace_id.as_str()) {
                        self.refresh_workspace_panels_async();
                        self.set_status(format!("Service stopped: {service}"), 3);
                    }
                    changed = true;
                }
                BridgeEvent::ServiceFailed {
                    workspace_id,
                    service,
                    error,
                } => {
                    if self.workspace.workspace_id.as_deref() == Some(workspace_id.as_str()) {
                        self.refresh_workspace_panels_async();
                        let message = error
                            .map(|detail| format!("Service failed: {service} ({detail})"))
                            .unwrap_or_else(|| format!("Service failed: {service}"));
                        self.set_status(message, 5);
                    }
                    changed = true;
                }
                _ => {
                    crate::debug::log(format!("bridge event: {:?}", event));
                    changed = true;
                }
            }
        }
        changed
    }

    fn apply_activity_update(&mut self, workspaces: &[ActivityWorkspace]) -> bool {
        let mut changed = false;
        let mut activity: HashMap<String, bool> = HashMap::new();
        for ws in workspaces {
            activity.insert(ws_key(&ws.repo, &ws.name), ws.busy);
        }

        for (key, busy) in &activity {
            let is_active = self.active_workspace_key.as_ref() == Some(key);
            if is_active {
                continue;
            }

            let current = self
                .workspace_activity
                .get(key)
                .copied()
                .unwrap_or(WorkspaceActivity::Idle);

            let next = match (current, *busy) {
                (_, true) => WorkspaceActivity::Busy,
                (WorkspaceActivity::Busy, false) => WorkspaceActivity::Attention,
                (other, false) => other,
            };

            if next != current {
                self.workspace_activity.insert(key.clone(), next);
                changed = true;
            }
        }
        changed
    }

    /// Switch the active workspace based on sidebar selection.
    pub fn activate_selected_workspace(&mut self) {
        let Some((repo, ws)) = self.sidebar_state.selected_workspace() else {
            return;
        };
        let Some(workspace_id) = ws.id.as_deref().map(str::to_string) else {
            self.set_status("Selected workspace is missing an id.".to_string(), 5);
            return;
        };
        let repo_name = repo.name.clone();
        let workspace_name = ws.name.clone();
        let workspace_host = ws.host.clone();
        let workspace_status = ws.status.clone();
        let workspace_source_ref = ws.source_ref.clone();
        let workspace_path = ws.worktree_path.clone();

        if self.pending_workspace_switch.as_deref() == Some(workspace_id.as_str()) {
            return;
        }
        if self.workspace.workspace_id.as_deref() == Some(workspace_id.as_str()) && self.pty.is_some() {
            self.focus = Focus::Canvas;
            return;
        }

        save_workspace_selection(Some(&workspace_id));

        let mut workspace_scope = WorkspaceScope {
            binding: WorkspaceBinding::Bound,
            workspace_id: Some(workspace_id.to_string()),
            workspace_name,
            repo_name: Some(repo_name.clone()),
            host: match workspace_host.as_str() {
                "local" => WorkspaceHost::Local,
                "docker" => WorkspaceHost::Docker,
                "cloud" => WorkspaceHost::Cloud,
                "remote" => WorkspaceHost::Remote,
                _ => WorkspaceHost::Unknown,
            },
            status: Some(workspace_status),
            source_ref: Some(workspace_source_ref),
            cwd: workspace_path.clone(),
            worktree_path: workspace_path,
            services: vec![],
            resolution_note: Some("Opening workspace shell…".to_string()),
            resolution_error: None,
        };

        let key = ws_key(&repo_name, &workspace_scope.workspace_name);
        self.active_workspace_key = Some(key.clone());
        self.workspace_activity.insert(key, WorkspaceActivity::Idle);

        // Refresh right column panels in the background so workspace switching
        // stays responsive even when git/service lookups are slow.
        self.vc_panel.set_loading();
        self.env_panel.set_loading();
        self.refresh_workspace_panels_async();

        if matches!(workspace_scope.host, WorkspaceHost::Local) {
            workspace_scope.resolution_note = None;
            self.pending_workspace_switch = None;
            self.apply_workspace_shell(repo_name, build_workspace_shell(workspace_scope, self.tmux_available));
        } else {
            self.pending_workspace_switch = Some(workspace_id.to_string());
            self.workspace = workspace_scope;
            self.shell = empty_shell();
            self.pty = None;
            self.cached_grid = None;
            self.resolve_workspace_shell_async(repo_name, workspace_id);
        }

        self.needs_draw = true;
    }

    fn resolve_workspace_shell_async(&self, repo_name: String, workspace_id: String) {
        let bridge = self.bridge.clone();
        let tx = self.workspace_switch_tx.clone();
        std::thread::spawn(move || {
            let result = bridge.workspace_shell(&workspace_id);
            let _ = tx.send(WorkspaceSwitchMessage::Resolved {
                repo_name,
                workspace_id,
                result,
            });
        });
    }

    pub fn poll_workspace_switch(&mut self) -> bool {
        let mut changed = false;

        while let Ok(message) = self.workspace_switch_rx.try_recv() {
            match message {
                WorkspaceSwitchMessage::Resolved {
                    repo_name,
                    workspace_id,
                    result,
                } => {
                    if self.pending_workspace_switch.as_deref() != Some(workspace_id.as_str()) {
                        continue;
                    }

                    self.pending_workspace_switch = None;

                    let workspace_shell = match result {
                        Ok(result) => result,
                        Err(error) => {
                            self.workspace.resolution_note = None;
                            self.workspace.resolution_error = Some(error.clone());
                            self.shell.launch_error = Some(error.clone());
                            self.shell.spec = None;
                            self.set_status(error, 5);
                            changed = true;
                            continue;
                        }
                    };

                    self.apply_workspace_shell(repo_name, workspace_shell);
                    changed = true;
                }
            }
        }

        changed
    }

    fn apply_workspace_shell(&mut self, repo_name: String, workspace_shell: WorkspaceShell) {
        let old_session_name = self.shell.session_name.clone();
        self.workspace = workspace_shell.workspace;
        self.shell = workspace_shell.shell;
        self.pty = None;
        self.cached_grid = None;

        if let Some(session_name) = old_session_name {
            if self.shell.session_name.as_deref() != Some(session_name.as_str()) {
                std::thread::spawn(move || {
                    let _ = std::process::Command::new("tmux")
                        .args(["detach-client", "-t", &session_name])
                        .output();
                });
            }
        }

        let key = ws_key(&repo_name, &self.workspace.workspace_name);
        self.active_workspace_key = Some(key.clone());
        self.workspace_activity.insert(key, WorkspaceActivity::Idle);

        let (rows, cols) = self.last_canvas_size;
        if rows > 0 && cols > 0 {
            self.init_pty(rows, cols);
        }
    }

    pub fn init_pty(&mut self, rows: u16, cols: u16) {
        crate::debug::log(format!("init_pty rows={rows} cols={cols}"));
        let Some(launch) = self.shell.spec.clone() else {
            self.last_canvas_size = (rows, cols);
            crate::debug::log("init_pty skipped: no launch spec");
            return;
        };

        match PtySession::<ActiveBackend>::spawn(rows, cols, &launch) {
            Ok(session) => {
                self.pty = Some(session);
                self.last_canvas_size = (rows, cols);
                crate::debug::log("init_pty ok");
            }
            Err(error) => {
                self.shell.launch_error = Some(format!("Failed to spawn shell: {error}"));
                self.shell.spec = None;
                crate::debug::log(format!("init_pty error: {error}"));
            }
        }
    }

    pub fn process_pty(&mut self) {
        let mut shell_exited = false;

        if let Some(pty) = &mut self.pty {
            crate::debug::log("process_pty start");
            let (alive, had_data, activity) = pty.process_pending();
            crate::debug::log(format!(
                "process_pty end alive={alive} had_data={had_data} activity={activity:?}"
            ));
            if !alive {
                shell_exited = true;
            }
            if had_data {
                self.needs_draw = true;

                // Use OSC 133 shell integration for precise command tracking.
                // No fallback to raw PTY data — key echoes would false-positive.
                if let Some(ref key) = self.active_workspace_key {
                    if let Some(act) = activity {
                        use crate::terminal::ShellActivity;
                        let next = match act {
                            ShellActivity::CommandStarted => WorkspaceActivity::Busy,
                            ShellActivity::CommandFinished => WorkspaceActivity::Idle,
                        };
                        let current = self
                            .workspace_activity
                            .get(key)
                            .copied()
                            .unwrap_or(WorkspaceActivity::Idle);
                        if next != current {
                            self.workspace_activity.insert(key.clone(), next);
                        }
                    }
                }
            }
        }

        if shell_exited {
            crate::debug::log("process_pty shell exited");
            let workspace_name = self.workspace.workspace_name.clone();
            self.pty = None;
            self.cached_grid = None;
            self.shell.launch_error = Some(format!(
                "Shell exited for workspace \"{workspace_name}\"."
            ));
            self.shell.spec = None;
            if let Some(key) = self.active_workspace_key.clone() {
                self.workspace_activity.insert(key, WorkspaceActivity::Idle);
            }
            self.set_status(
                format!("Shell exited for {workspace_name}. Re-select the workspace to reopen it."),
                8,
            );
        }
    }

    /// Advance the spinner animation. Returns true if the frame changed.
    pub fn tick_spinner(&mut self) -> bool {
        let any_busy = self.workspace_activity.values().any(|a| *a == WorkspaceActivity::Busy);
        if !any_busy {
            return false;
        }
        let now = Instant::now();
        if now.duration_since(self.spinner_last_tick).as_millis() >= SPINNER_INTERVAL_MS as u128 {
            self.spinner_frame = (self.spinner_frame + 1) % SPINNER_FRAMES.len();
            self.spinner_last_tick = now;
            true
        } else {
            false
        }
    }

    /// Set a status bar message that auto-clears after a duration.
    pub fn set_status(&mut self, message: String, duration_secs: u64) {
        self.status_message = Some(message);
        self.status_expires = Some(Instant::now() + std::time::Duration::from_secs(duration_secs));
        self.needs_draw = true;
    }

    /// Tick the status bar expiry. Returns true if message was cleared.
    pub fn tick_status(&mut self) -> bool {
        if let Some(expires) = self.status_expires {
            if Instant::now() >= expires {
                self.status_message = None;
                self.status_expires = None;
                return true;
            }
        }
        false
    }

    /// Current spinner character (if any workspace is busy).
    pub fn spinner_char(&self) -> Option<char> {
        let any_busy = self.workspace_activity.values().any(|a| *a == WorkspaceActivity::Busy);
        if any_busy {
            Some(SPINNER_FRAMES[self.spinner_frame])
        } else {
            None
        }
    }

    pub fn ensure_canvas_pty(&mut self, rows: u16, cols: u16) {
        if rows == 0 || cols == 0 {
            crate::debug::log(format!("ensure_canvas_pty ignored zero size rows={rows} cols={cols}"));
            return;
        }

        if self.pty.is_none() {
            crate::debug::log("ensure_canvas_pty initializing pty");
            self.init_pty(rows, cols);
            return;
        }

        if (rows, cols) != self.last_canvas_size {
            crate::debug::log(format!(
                "ensure_canvas_pty resize {}x{} -> {}x{}",
                self.last_canvas_size.1, self.last_canvas_size.0, cols, rows
            ));
            self.last_canvas_size = (rows, cols);

            if self.dragging.is_some() {
                return;
            }

            if let Some(pty) = &mut self.pty {
                pty.resize(rows, cols);
            }
        }
    }

    pub fn flush_pending_resize(&mut self) {
        let (rows, cols) = self.last_canvas_size;
        if rows > 0 && cols > 0 {
            if let Some(pty) = &mut self.pty {
                pty.resize(rows, cols);
            }
        }
    }

    fn refresh_workspace_panels_async(&self) {
        let workspace_id = self.workspace.workspace_id.clone();
        let tx = self.panel_refresh_tx.clone();

        std::thread::spawn(move || {
            let git = load_git_state(workspace_id.as_deref());
            let services = load_services(workspace_id.as_deref());
            let _ = tx.send(PanelRefreshMessage::Loaded {
                workspace_id,
                git,
                services,
            });
        });
    }

    pub fn poll_panel_refresh(&mut self) -> bool {
        let mut changed = false;

        while let Ok(message) = self.panel_refresh_rx.try_recv() {
            match message {
                PanelRefreshMessage::Loaded {
                    workspace_id,
                    git,
                    services,
                } => {
                    if workspace_id == self.workspace.workspace_id {
                        self.vc_panel.git = git;
                        self.workspace.services = services
                            .iter()
                            .map(|service| crate::shell::ServiceSummary {
                                name: service.name.clone(),
                                preview_url: service.preview_url.clone(),
                                status: service.status.clone(),
                            })
                            .collect();
                        self.env_panel.services = services;
                        changed = true;
                    }
                }
            }
        }

        changed
    }

    pub fn write_to_pty(&mut self, bytes: &[u8]) {
        if let Some(pty) = &mut self.pty {
            let _ = pty.write(bytes);
        }
    }

    pub fn write_key_to_pty(&mut self, key: KeyEvent) -> bool {
        if let Some(pty) = &mut self.pty {
            crate::debug::log(format!("encode_key request: {:?}", key));
            let bytes = pty.encode_key(key);
            if !bytes.is_empty() {
                crate::debug::log(format!("encode_key wrote {} bytes", bytes.len()));
                let _ = pty.write(&bytes);
                return true;
            }
            crate::debug::log("encode_key produced 0 bytes");
        }
        false
    }

    pub fn write_mouse_to_pty(&mut self, event: &VtMouseEvent) {
        if let Some(pty) = &mut self.pty {
            crate::debug::log(format!("encode_mouse request: {:?}", event));
            let bytes = pty.encode_mouse(event);
            if !bytes.is_empty() {
                crate::debug::log(format!("encode_mouse wrote {} bytes", bytes.len()));
                let _ = pty.write(&bytes);
            } else {
                crate::debug::log("encode_mouse produced 0 bytes");
            }
        }
    }

    pub fn canvas_inner_rect(&self) -> Rect {
        self.col_rects[1]
    }

    pub fn pty_snapshot(&mut self) -> VtGrid {
        if let Some(pty) = &mut self.pty {
            crate::debug::log("pty_snapshot start");
            if pty.is_dirty() {
                crate::debug::log("pty_snapshot dirty");
                let grid = pty.snapshot();
                crate::debug::log(format!("pty_snapshot rows={} cols={}", grid.rows, grid.cols));
                self.cached_grid = Some(grid);
            }
            if let Some(ref grid) = self.cached_grid {
                crate::debug::log("pty_snapshot returning cached grid");
                return grid.clone();
            }
        }
        crate::debug::log("pty_snapshot returning empty grid");
        VtGrid {
            rows: 0,
            cols: 0,
            cursor_row: 0,
            cursor_col: 0,
            cursor_visible: false,
            cells: vec![],
        }
    }

    pub fn focus_at(&self, x: u16, _y: u16) -> Option<Focus> {
        if x < self.divider_rects[0].x {
            Some(Focus::Sidebar)
        } else if x <= self.divider_rects[1].x {
            Some(Focus::Canvas)
        } else {
            Some(Focus::Extensions)
        }
    }

    pub fn border_at(&self, x: u16) -> Option<DragBorder> {
        if x == self.divider_rects[0].x {
            Some(DragBorder::Left)
        } else if x == self.divider_rects[1].x {
            Some(DragBorder::Right)
        } else {
            None
        }
    }

    pub fn handle_drag(&mut self, x: u16, total_width: u16) {
        let Some(border) = self.dragging else {
            return;
        };

        // 2 divider columns (1 cell each) are reserved from available space
        let dividers: u16 = 2;

        match border {
            DragBorder::Left => {
                let new_sidebar = x.max(MIN_COLUMN_WIDTH);
                let remaining = total_width.saturating_sub(new_sidebar + self.extensions_width + dividers);
                if remaining >= MIN_CANVAS_WIDTH {
                    self.sidebar_width = new_sidebar;
                }
            }
            DragBorder::Right => {
                let new_ext = total_width.saturating_sub(x).max(MIN_COLUMN_WIDTH);
                let remaining = total_width.saturating_sub(self.sidebar_width + new_ext + dividers);
                if remaining >= MIN_CANVAS_WIDTH {
                    self.extensions_width = new_ext;
                }
            }
        }
    }

    pub fn canvas_notice(&self) -> Option<&str> {
        if self.workspace.workspace_id.is_none() {
            return Some("Select a workspace from the sidebar.");
        }
        self.shell
            .launch_error
            .as_deref()
            .or(self.workspace.resolution_note.as_deref())
    }

    // -----------------------------------------------------------------------
    // Git dialog
    // -----------------------------------------------------------------------

    /// Open the git commit dialog and kick off a background status fetch.
    pub fn open_git_dialog(&mut self) {
        if self.workspace.workspace_id.is_none() {
            self.set_status("Select a workspace first.".to_string(), 3);
            return;
        }

        let state = GitDialogState {
            branch: None,
            staged_count: 0,
            unstaged_count: 0,
            insertions: 0,
            deletions: 0,
            commit_message: String::new(),
            push_after_commit: true,
            is_busy: false,
            is_loading: true,
            error: None,
        };
        self.dialog = AppDialog::GitCommit(state);
        self.refresh_git_status();
    }

    /// Fetch git status in a background thread.
    fn refresh_git_status(&self) {
        let workspace_id = self.workspace.workspace_id.clone();
        let bridge = self.bridge.clone();
        let tx = self.git_bg_tx.clone();

        std::thread::spawn(move || {
            let Some(workspace_id) = workspace_id else {
                return;
            };
            let Ok(payload) = bridge.workspace_git(&workspace_id) else {
                return;
            };

            let branch = payload.status.branch.clone();
            let mut staged = 0usize;
            let mut unstaged = 0usize;
            let mut ins = 0usize;
            let mut del = 0usize;
            for file in payload.status.files {
                if file.staged {
                    staged += 1;
                }
                if file.unstaged {
                    unstaged += 1;
                }
                ins += file.stats.insertions.unwrap_or(0) as usize;
                del += file.stats.deletions.unwrap_or(0) as usize;
            }

            let _ = tx.send(GitBgMessage::StatusLoaded {
                branch,
                staged_count: staged,
                unstaged_count: unstaged,
                insertions: ins,
                deletions: del,
            });
        });
    }

    /// Execute the git commit (and optionally push) in a background thread.
    pub fn execute_git_commit(&mut self) {
        let state = match &mut self.dialog {
            AppDialog::GitCommit(s) => s,
            _ => return,
        };

        let msg = state.commit_message.trim().to_string();
        if msg.is_empty() {
            return;
        }

        let has_staged = state.staged_count > 0;
        let has_unstaged = state.unstaged_count > 0;
        if !has_staged && !has_unstaged {
            return;
        }

        state.is_busy = true;
        state.error = None;

        let push = state.push_after_commit;
        let Some(workspace_id) = self.workspace.workspace_id.clone() else {
            return;
        };
        let stage_all = !has_staged && has_unstaged;
        let bridge = self.bridge.clone();
        let tx = self.git_bg_tx.clone();

        std::thread::spawn(move || {
            let result = bridge.workspace_git_commit(&workspace_id, &msg, push, stage_all);

            let commit_err = match &result {
                Ok(_) => None,
                Err(error) => Some(error.clone()),
            };

            if let Some(err) = commit_err {
                let _ = tx.send(GitBgMessage::CommitDone { error: Some(err) });
                return;
            }

            let _ = tx.send(GitBgMessage::CommitDone { error: None });

            if push {
                let push_err = match result {
                    Ok(payload) => {
                        if payload.push.is_some() {
                            None
                        } else {
                            Some("Push did not complete.".to_string())
                        }
                    }
                    Err(error) => Some(error),
                };
                let _ = tx.send(GitBgMessage::PushDone { error: push_err });
            }
        });
    }

    /// Poll for git background task completions.
    pub fn poll_git_bg(&mut self) -> bool {
        let mut changed = false;
        while let Ok(msg) = self.git_bg_rx.try_recv() {
            changed = true;
            match msg {
                GitBgMessage::StatusLoaded {
                    branch,
                    staged_count,
                    unstaged_count,
                    insertions,
                    deletions,
                } => {
                    if let AppDialog::GitCommit(ref mut state) = self.dialog {
                        state.branch = branch;
                        state.staged_count = staged_count;
                        state.unstaged_count = unstaged_count;
                        state.insertions = insertions;
                        state.deletions = deletions;
                        state.is_loading = false;
                    }
                }
                GitBgMessage::CommitDone { error } => {
                    if let Some(ref err) = error {
                        if let AppDialog::GitCommit(ref mut state) = self.dialog {
                            state.error = Some(err.clone());
                            state.is_busy = false;
                        }
                    } else {
                        // Commit succeeded — refresh VC panel
                        self.vc_panel.refresh(self.workspace.workspace_id.as_deref());
                        // If not pushing, close the dialog
                        if let AppDialog::GitCommit(ref state) = self.dialog {
                            if !state.push_after_commit {
                                self.dialog = AppDialog::None;
                                self.set_status("Committed".to_string(), 3);
                            }
                        }
                    }
                }
                GitBgMessage::PushDone { error } => {
                    if let Some(ref err) = error {
                        if let AppDialog::GitCommit(ref mut state) = self.dialog {
                            state.error = Some(err.clone());
                            state.is_busy = false;
                        }
                    } else {
                        self.dialog = AppDialog::None;
                        self.set_status("Committed and pushed".to_string(), 3);
                    }
                }
            }
        }
        changed
    }

    // -----------------------------------------------------------------------
    // Stack control
    // -----------------------------------------------------------------------

    pub fn toggle_stack(&mut self) {
        let Some(workspace_id) = self.workspace.workspace_id.clone() else {
            self.set_status("Select a workspace first.".to_string(), 3);
            return;
        };

        let running = self
            .env_panel
            .services
            .iter()
            .any(|service| matches!(service.status.as_str(), "starting" | "ready"));
        let bridge = self.bridge.clone();
        let tx = self.stack_action_tx.clone();
        let action_label = if running { "stopping" } else { "starting" };

        self.env_panel.set_loading();
        self.workspace.services = vec![];
        self.set_status(format!("Stack {action_label}..."), 10);
        self.needs_draw = true;

        std::thread::spawn(move || {
            let result = if running {
                bridge.service_stop(&workspace_id, &[])
            } else {
                bridge.service_start(&workspace_id, &[])
            }
            .map(|payload| {
                payload
                    .services
                    .into_iter()
                    .map(|service| ServiceEntry {
                        name: service.name,
                        status: service.status,
                        port: service.assigned_port,
                        preview_url: service.preview_url,
                    })
                    .collect::<Vec<_>>()
            });
            let _ = tx.send(StackActionMessage::Finished { workspace_id, result });
        });
    }

    pub fn poll_stack_action(&mut self) -> bool {
        let mut changed = false;

        while let Ok(message) = self.stack_action_rx.try_recv() {
            match message {
                StackActionMessage::Finished { workspace_id, result } => {
                    if self.workspace.workspace_id.as_deref() != Some(workspace_id.as_str()) {
                        continue;
                    }

                    match result {
                        Ok(services) => {
                            self.workspace.services = services
                                .iter()
                                .map(|service| crate::shell::ServiceSummary {
                                    name: service.name.clone(),
                                    preview_url: service.preview_url.clone(),
                                    status: service.status.clone(),
                                })
                                .collect();
                            self.env_panel.services = services;
                            self.set_status("Stack updated.".to_string(), 3);
                        }
                        Err(error) => {
                            self.set_status(error, 5);
                            self.refresh_workspace_panels_async();
                        }
                    }
                    changed = true;
                }
            }
        }

        changed
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    pub fn render(&mut self, frame: &mut Frame) {
        let rows = Layout::vertical([
            Constraint::Length(2), // header + bottom border
            Constraint::Min(0),   // main body
            Constraint::Length(2), // status bar + top border
        ])
        .split(frame.area());

        // Header — split into sidebar portion and route portion
        let header_cols = Layout::horizontal([
            Constraint::Length(self.sidebar_width),
            Constraint::Length(1), // divider
            Constraint::Min(0),
        ])
        .split(rows[0]);

        crate::ui::header::render_org(frame, header_cols[0], self);
        let (git_rect, stack_rect) =
            crate::ui::header::render_route(frame, header_cols[2], self);
        self.git_button_rect = git_rect;
        self.stack_button_rect = stack_rect;

        // Main body — 5 columns: sidebar | divider | canvas | divider | extensions
        let columns = Layout::horizontal([
            Constraint::Length(self.sidebar_width),
            Constraint::Length(1),  // left divider
            Constraint::Min(MIN_CANVAS_WIDTH),
            Constraint::Length(1),  // right divider
            Constraint::Length(self.extensions_width),
        ])
        .split(rows[1]);

        self.col_rects = [columns[0], columns[2], columns[4]];
        self.divider_rects = [columns[1], columns[3]];

        let divider_xs = [columns[1].x, columns[3].x];
        render_horizontal_rule(frame, Rect::new(rows[0].x, rows[0].bottom().saturating_sub(1), rows[0].width, 1), &divider_xs, '┬');
        render_horizontal_rule(frame, Rect::new(rows[2].x, rows[2].y, rows[2].width, 1), &divider_xs, '┴');

        // Render dividers
        render_divider(frame, columns[1], self.dragging == Some(DragBorder::Left));
        render_divider(frame, columns[3], self.dragging == Some(DragBorder::Right));

        let grid = self.pty_snapshot();

        let sidebar_focused = self.focus == Focus::Sidebar;
        let hover_row = self.mouse_row;
        let spinner = self.spinner_char();
        crate::ui::sidebar::render(frame, columns[0], &mut self.sidebar_state, sidebar_focused, hover_row, spinner, &self.workspace_activity);
        crate::ui::canvas::render(frame, columns[2], self, &grid, self.canvas_notice());

        // Right column — split between VC and Environment panels
        let ext_focused = self.focus == Focus::Extensions;
        let right_sections = if self.vc_panel.collapsed && self.env_panel.collapsed {
            Layout::vertical([Constraint::Length(2), Constraint::Length(2), Constraint::Min(0)])
                .split(columns[4])
        } else if self.vc_panel.collapsed {
            Layout::vertical([Constraint::Length(2), Constraint::Min(0)])
                .split(columns[4])
        } else if self.env_panel.collapsed {
            Layout::vertical([Constraint::Min(0), Constraint::Length(2)])
                .split(columns[4])
        } else {
            Layout::vertical([Constraint::Percentage(50), Constraint::Percentage(50)])
                .split(columns[4])
        };

        self.vc_panel_rect = right_sections[0];
        crate::panels::version_control::render::render(frame, right_sections[0], &self.vc_panel, ext_focused);
        if right_sections.len() > 1 {
            self.env_panel_rect = right_sections[1];
            crate::panels::environment::render::render(frame, right_sections[1], &self.env_panel, ext_focused);
        }

        // Status bar
        crate::ui::status_bar::render(
            frame,
            rows[2],
            self.status_message.as_deref(),
            &self.workspace.workspace_name,
            self.workspace.host.label(),
            self.focus,
        );

        // Git dialog overlay (rendered last so it's on top)
        if let AppDialog::GitCommit(ref state) = self.dialog {
            crate::ui::git_dialog::render(frame, frame.area(), state);
        }
    }
}

/// Render a 1-cell-wide vertical divider line.
fn render_divider(frame: &mut Frame, area: Rect, active: bool) {
    use ratatui::style::{Color, Style};
    let style = if active {
        Style::default().fg(Color::Cyan)
    } else {
        Style::default().fg(Color::DarkGray)
    };
    let buf = frame.buffer_mut();
    for y in area.y..area.bottom() {
        if let Some(cell) = buf.cell_mut((area.x, y)) {
            cell.set_char('│').set_style(style);
        }
    }
}

fn render_horizontal_rule(frame: &mut Frame, area: Rect, divider_xs: &[u16], junction: char) {
    use ratatui::style::{Color, Style};

    if area.width == 0 || area.height == 0 {
        return;
    }

    let style = Style::default().fg(Color::DarkGray);
    let buf = frame.buffer_mut();
    let y = area.y;

    for x in area.x..area.right() {
        if let Some(cell) = buf.cell_mut((x, y)) {
            cell.set_char('─').set_style(style);
        }
    }

    for &x in divider_xs {
        if x >= area.x && x < area.right() {
            if let Some(cell) = buf.cell_mut((x, y)) {
                cell.set_char(junction).set_style(style);
            }
        }
    }
}
