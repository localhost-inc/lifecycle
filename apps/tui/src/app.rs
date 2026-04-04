use ratatui::{
    layout::{Constraint, Layout, Rect},
    Frame,
};

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use crossterm::event::KeyEvent;

use crate::bridge::LifecycleBridgeClient;
use crate::events::{ActivityWorkspace, BridgeEvent, BridgeEventStream};
use crate::panels::environment::EnvironmentPanel;
use crate::panels::version_control::VersionControlPanel;
use crate::selection::{load_workspace_selection, save_workspace_selection};
use crate::shell::{INITIAL_WORKSPACE_ID_ENV, ShellPlan, WorkspaceBinding, WorkspaceHost, WorkspaceScope};
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
        let Some(workspace_id) = ws.id.as_deref() else {
            self.set_status("Selected workspace is missing an id.".to_string(), 5);
            return;
        };

        let repo_name = repo.name.clone();
        let workspace_shell = match self.bridge.workspace_shell(workspace_id) {
            Ok(result) => result,
            Err(error) => {
                self.set_status(error, 5);
                return;
            }
        };

        // Detach the old tmux client cleanly before dropping the PTY.
        // Without this, dropping the PTY kills the child process which sends
        // EOF to the tmux session, showing ^D in the pane.
        if let Some(ref session_name) = self.shell.session_name {
            let _ = std::process::Command::new("tmux")
                .args(["detach-client", "-t", session_name])
                .output();
        }

        self.workspace = workspace_shell.workspace;
        self.shell = workspace_shell.shell;
        self.pty = None;
        self.cached_grid = None;
        save_workspace_selection(Some(workspace_id));

        // Track active workspace and clear its attention state.
        let key = ws_key(&repo_name, &self.workspace.workspace_name);
        self.active_workspace_key = Some(key.clone());
        self.workspace_activity.insert(key, WorkspaceActivity::Idle);

        let (rows, cols) = self.last_canvas_size;
        if rows > 0 && cols > 0 {
            self.init_pty(rows, cols);
        }

        // Refresh right column panels
        self.vc_panel.refresh(self.workspace.cwd.as_deref());
        self.env_panel.refresh(self.workspace.workspace_id.as_deref());

        self.needs_draw = true;
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
                crate::debug::log(format!("init_pty error: {error}"));
            }
        }
    }

    pub fn process_pty(&mut self) {
        if let Some(pty) = &mut self.pty {
            crate::debug::log("process_pty start");
            let (alive, had_data, activity) = pty.process_pending();
            crate::debug::log(format!(
                "process_pty end alive={alive} had_data={had_data} activity={activity:?}"
            ));
            if !alive {
                self.running = false;
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
        let cwd = self
            .workspace
            .cwd
            .clone()
            .or_else(|| self.workspace.worktree_path.clone());
        let tx = self.git_bg_tx.clone();

        std::thread::spawn(move || {
            let dir = cwd.unwrap_or_else(|| ".".to_string());

            // Branch name
            let branch = std::process::Command::new("git")
                .args(["-C", &dir, "rev-parse", "--abbrev-ref", "HEAD"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

            // Porcelain status for file counts
            let status_output = std::process::Command::new("git")
                .args(["-C", &dir, "status", "--porcelain"])
                .output();

            let (mut staged, mut unstaged) = (0usize, 0usize);
            if let Ok(o) = &status_output {
                if o.status.success() {
                    for line in String::from_utf8_lossy(&o.stdout).lines() {
                        if line.len() < 2 {
                            continue;
                        }
                        let idx = line.as_bytes()[0];
                        let wt = line.as_bytes()[1];
                        if idx != b' ' && idx != b'?' {
                            staged += 1;
                        }
                        if wt != b' ' && wt != b'?' {
                            unstaged += 1;
                        }
                    }
                }
            }

            // Diff stats
            let diff_output = std::process::Command::new("git")
                .args(["-C", &dir, "diff", "--cached", "--numstat"])
                .output();

            let (mut ins, mut del) = (0usize, 0usize);
            if let Ok(o) = &diff_output {
                if o.status.success() {
                    for line in String::from_utf8_lossy(&o.stdout).lines() {
                        let parts: Vec<&str> = line.split('\t').collect();
                        if parts.len() >= 2 {
                            ins += parts[0].parse::<usize>().unwrap_or(0);
                            del += parts[1].parse::<usize>().unwrap_or(0);
                        }
                    }
                }
            }

            // Also include unstaged diff stats if no staged changes
            if staged == 0 {
                let unstaged_diff = std::process::Command::new("git")
                    .args(["-C", &dir, "diff", "--numstat"])
                    .output();
                if let Ok(o) = &unstaged_diff {
                    if o.status.success() {
                        for line in String::from_utf8_lossy(&o.stdout).lines() {
                            let parts: Vec<&str> = line.split('\t').collect();
                            if parts.len() >= 2 {
                                ins += parts[0].parse::<usize>().unwrap_or(0);
                                del += parts[1].parse::<usize>().unwrap_or(0);
                            }
                        }
                    }
                }
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
        let cwd = self
            .workspace
            .cwd
            .clone()
            .or_else(|| self.workspace.worktree_path.clone())
            .unwrap_or_else(|| ".".to_string());
        let stage_all = !has_staged && has_unstaged;
        let tx = self.git_bg_tx.clone();

        std::thread::spawn(move || {
            // Stage all if nothing is staged
            if stage_all {
                let _ = std::process::Command::new("git")
                    .args(["-C", &cwd, "add", "-A"])
                    .output();
            }

            let commit = std::process::Command::new("git")
                .args(["-C", &cwd, "commit", "-m", &msg])
                .output();

            let commit_err = match &commit {
                Ok(o) if o.status.success() => None,
                Ok(o) => Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
                Err(e) => Some(e.to_string()),
            };

            if let Some(err) = commit_err {
                let _ = tx.send(GitBgMessage::CommitDone { error: Some(err) });
                return;
            }

            let _ = tx.send(GitBgMessage::CommitDone { error: None });

            if push {
                let push_result = std::process::Command::new("git")
                    .args(["-C", &cwd, "push"])
                    .output();

                let push_err = match &push_result {
                    Ok(o) if o.status.success() => None,
                    Ok(o) => Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
                    Err(e) => Some(e.to_string()),
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
                        self.vc_panel.refresh(self.workspace.cwd.as_deref());
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
        if self.workspace.workspace_id.is_none() {
            self.set_status("Select a workspace first.".to_string(), 3);
            return;
        }

        let running = !self.workspace.services.is_empty()
            && self.workspace.services.iter().any(|s| s.status == "running");

        let action = if running { "down" } else { "up" };
        let ws_name = self.workspace.workspace_name.clone();

        self.set_status(
            format!("Stack {}...", if running { "stopping" } else { "starting" }),
            10,
        );

        std::thread::spawn(move || {
            let _ = std::process::Command::new("lifecycle")
                .args(["stack", action, "--workspace", &ws_name])
                .output();
        });
    }

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    pub fn render(&mut self, frame: &mut Frame) {
        let rows = Layout::vertical([
            Constraint::Length(1), // header
            Constraint::Min(0),   // main body
            Constraint::Length(1), // status bar
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
