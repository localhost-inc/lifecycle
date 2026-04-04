use ratatui::{
    layout::{Constraint, Layout, Rect},
    Frame,
};

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use crate::panels::environment::EnvironmentPanel;
use crate::panels::version_control::VersionControlPanel;
use crate::shell::{ShellRuntime, WorkspaceBinding, WorkspaceHost, WorkspaceScope};
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

// ---------------------------------------------------------------------------
// Activity poller — calls `lifecycle tui activity` in a background thread.
// Host dispatch (local/cloud/docker/remote) is handled by the CLI.
// ---------------------------------------------------------------------------

struct ActivityPoller {
    rx: mpsc::Receiver<HashMap<String, bool>>,
    stop: Arc<AtomicBool>,
}

impl ActivityPoller {
    fn start() -> Self {
        let (tx, rx) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_flag = stop.clone();

        std::thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                let results = poll_workspace_activity_via_cli();
                if tx.send(results).is_err() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(500));
            }
        });

        Self { rx, stop }
    }

    /// Drain and return the most recent poll result, if any.
    fn poll(&self) -> Option<HashMap<String, bool>> {
        let mut last = None;
        while let Ok(val) = self.rx.try_recv() {
            last = Some(val);
        }
        last
    }
}

impl Drop for ActivityPoller {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

/// One CLI call returns activity for all workspaces across all hosts.
fn poll_workspace_activity_via_cli() -> HashMap<String, bool> {
    let output = std::process::Command::new("lifecycle")
        .args(["tui", "activity"])
        .output();

    let mut results = HashMap::new();
    if let Ok(o) = output {
        if o.status.success() {
            if let Ok(payload) =
                serde_json::from_slice::<ActivityPayload>(&o.stdout)
            {
                for ws in payload.workspaces {
                    results.insert(ws_key(&ws.repo, &ws.name), ws.busy);
                }
            }
        }
    }
    results
}

#[derive(serde::Deserialize)]
struct ActivityPayload {
    workspaces: Vec<ActivityEntry>,
}

#[derive(serde::Deserialize)]
struct ActivityEntry {
    repo: String,
    name: String,
    busy: bool,
}

/// Composite key for a workspace: "repo_name\tws_name".
fn ws_key(repo_name: &str, ws_name: &str) -> String {
    format!("{}\t{}", repo_name, ws_name)
}

pub struct App {
    pub running: bool,
    pub focus: Focus,
    pub workspace: WorkspaceScope,
    pub shell: ShellRuntime,
    pub pty: Option<PtySession<ActiveBackend>>,
    pub sidebar_state: SidebarState,
    pub sidebar_width: u16,
    pub extensions_width: u16,
    pub dragging: Option<DragBorder>,
    pub col_rects: [Rect; 3],
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
    activity_poller: ActivityPoller,
    /// Per-workspace activity state, keyed by "repo\tws".
    pub workspace_activity: HashMap<String, WorkspaceActivity>,
    /// Key of the workspace whose PTY is active ("repo\tws").
    active_workspace_key: Option<String>,
}

impl App {
    pub fn new() -> Self {
        let session = crate::lifecycle::resolve_tui_session();
        let workspace = session.workspace;
        let shell = session.shell;

        let mut vc_panel = VersionControlPanel::new();
        vc_panel.refresh(workspace.cwd.as_deref().or(workspace.worktree_path.as_deref()));
        let mut env_panel = EnvironmentPanel::new();
        env_panel.refresh(workspace.workspace_id.as_deref());

        Self {
            running: true,
            focus: Focus::Canvas,
            workspace,
            sidebar_state: SidebarState::new(),
            shell,
            pty: None,
            sidebar_width: DEFAULT_SIDEBAR_WIDTH,
            extensions_width: DEFAULT_EXTENSIONS_WIDTH,
            dragging: None,
            col_rects: [Rect::default(); 3],
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
            activity_poller: ActivityPoller::start(),
            workspace_activity: HashMap::new(),
            active_workspace_key: None,
        }
    }

    /// Poll workspace activity and run the state machine.
    /// Returns true if any state changed (needs redraw).
    pub fn poll_workspace_activity(&mut self) -> bool {
        let Some(poll_result) = self.activity_poller.poll() else {
            return false;
        };

        let mut changed = false;
        for (key, busy) in &poll_result {
            let is_active = self.active_workspace_key.as_ref() == Some(key);

            // Skip the active workspace — its activity is tracked via PTY
            // data in process_pty(), not via tmux capture-pane polling.
            // (capture-pane would see the TUI's own rendering and false-positive.)
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

        let repo_name = repo.name.clone();
        let repo_path = repo.path.clone();
        let ws_name = ws.name.clone();
        let host = WorkspaceHost::from_str(&ws.host);
        // Use worktree path if available, fall back to repo path
        let cwd = ws.worktree_path.clone().or(repo_path.clone());

        self.workspace = WorkspaceScope {
            binding: WorkspaceBinding::AdHoc,
            workspace_id: None,
            workspace_name: ws_name,
            repo_name: Some(repo_name.clone()),
            host,
            status: Some(ws.status.clone()),
            source_ref: if ws.source_ref.is_empty() { None } else { Some(ws.source_ref.clone()) },
            cwd: cwd.clone(),
            worktree_path: cwd,
            services: vec![],
            resolution_note: Some(format!("Active workspace in {repo_name}")),
            resolution_error: None,
        };

        // Detach the old tmux client cleanly before dropping the PTY.
        // Without this, dropping the PTY kills the child process which sends
        // EOF to the tmux session, showing ^D in the pane.
        if let Some(ref session_name) = self.shell.session_name {
            let _ = std::process::Command::new("tmux")
                .args(["detach-client", "-t", session_name])
                .output();
        }

        // Rebuild shell runtime and respawn PTY
        self.shell = crate::shell::resolve_shell_runtime(&self.workspace);
        self.pty = None;
        self.cached_grid = None;

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
        let Some(launch) = self.shell.spec.clone() else {
            self.last_canvas_size = (rows, cols);
            return;
        };

        match PtySession::<ActiveBackend>::spawn(rows, cols, &launch) {
            Ok(session) => {
                self.pty = Some(session);
                self.last_canvas_size = (rows, cols);
            }
            Err(error) => {
                self.shell.launch_error = Some(format!("Failed to spawn shell: {error}"));
            }
        }
    }

    pub fn process_pty(&mut self) {
        if let Some(pty) = &mut self.pty {
            let (alive, had_data, activity) = pty.process_pending();
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

    pub fn resize_pty_if_needed(&mut self, rows: u16, cols: u16) {
        if (rows, cols) != self.last_canvas_size && rows > 0 && cols > 0 {
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

    pub fn write_mouse_to_pty(&mut self, event: &VtMouseEvent) {
        if let Some(pty) = &mut self.pty {
            let bytes = pty.encode_mouse(event);
            if !bytes.is_empty() {
                let _ = pty.write(&bytes);
            }
        }
    }

    pub fn canvas_inner_rect(&self) -> Rect {
        let area = self.col_rects[1];
        Rect {
            x: area.x.saturating_add(1),
            y: area.y.saturating_add(1),
            width: area.width.saturating_sub(2),
            height: area.height.saturating_sub(2),
        }
    }

    pub fn pty_snapshot(&mut self) -> VtGrid {
        if let Some(pty) = &mut self.pty {
            if pty.is_dirty() {
                let grid = pty.snapshot();
                self.cached_grid = Some(grid);
            }
            if let Some(ref grid) = self.cached_grid {
                return grid.clone();
            }
        }
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
        if x < self.col_rects[0].right() {
            Some(Focus::Sidebar)
        } else if x < self.col_rects[1].right() {
            Some(Focus::Canvas)
        } else {
            Some(Focus::Extensions)
        }
    }

    pub fn border_at(&self, x: u16) -> Option<DragBorder> {
        let left_border = self.col_rects[0].right();
        let right_border = self.col_rects[1].right();

        if x >= left_border.saturating_sub(1) && x <= left_border {
            Some(DragBorder::Left)
        } else if x >= right_border.saturating_sub(1) && x <= right_border {
            Some(DragBorder::Right)
        } else {
            None
        }
    }

    pub fn handle_drag(&mut self, x: u16, total_width: u16) {
        let Some(border) = self.dragging else {
            return;
        };

        match border {
            DragBorder::Left => {
                let new_sidebar = x.max(MIN_COLUMN_WIDTH);
                let remaining = total_width.saturating_sub(new_sidebar + self.extensions_width);
                if remaining >= MIN_CANVAS_WIDTH {
                    self.sidebar_width = new_sidebar;
                }
            }
            DragBorder::Right => {
                let new_ext = total_width.saturating_sub(x).max(MIN_COLUMN_WIDTH);
                let remaining = total_width.saturating_sub(self.sidebar_width + new_ext);
                if remaining >= MIN_CANVAS_WIDTH {
                    self.extensions_width = new_ext;
                }
            }
        }
    }

    pub fn canvas_notice(&self) -> Option<&str> {
        self.shell
            .launch_error
            .as_deref()
            .or(self.workspace.resolution_note.as_deref())
    }

    pub fn render(&mut self, frame: &mut Frame) {
        let rows = Layout::vertical([
            Constraint::Min(0),
            Constraint::Length(1),
        ])
        .split(frame.area());

        let columns = Layout::horizontal([
            Constraint::Length(self.sidebar_width),
            Constraint::Min(MIN_CANVAS_WIDTH),
            Constraint::Length(self.extensions_width),
        ])
        .split(rows[0]);

        self.col_rects = [columns[0], columns[1], columns[2]];

        let grid = self.pty_snapshot();

        let sidebar_focused = self.focus == Focus::Sidebar;
        let hover_row = self.mouse_row;
        let spinner = self.spinner_char();
        crate::ui::sidebar::render(frame, columns[0], &mut self.sidebar_state, sidebar_focused, hover_row, spinner, &self.workspace_activity);
        crate::ui::canvas::render(frame, columns[1], self, &grid, self.canvas_notice());

        // Right column — split between VC and Environment panels
        let ext_focused = self.focus == Focus::Extensions;
        let right_sections = if self.vc_panel.collapsed && self.env_panel.collapsed {
            Layout::vertical([Constraint::Length(3), Constraint::Length(3), Constraint::Min(0)])
                .split(columns[2])
        } else if self.vc_panel.collapsed {
            Layout::vertical([Constraint::Length(3), Constraint::Min(0)])
                .split(columns[2])
        } else if self.env_panel.collapsed {
            Layout::vertical([Constraint::Min(0), Constraint::Length(3)])
                .split(columns[2])
        } else {
            Layout::vertical([Constraint::Percentage(50), Constraint::Percentage(50)])
                .split(columns[2])
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
            rows[1],
            self.status_message.as_deref(),
            &self.workspace.workspace_name,
            self.workspace.host.label(),
            self.focus,
        );
    }
}
