use notify::{recommended_watcher, EventKind, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc;
use std::thread;

use crate::bridge::LifecycleBridgeClient;

#[derive(Debug, Clone)]
pub struct SidebarRepo {
    pub name: String,
    pub source: RepoSource,
    pub path: Option<String>,
    pub workspaces: Vec<SidebarWorkspace>,
    pub expanded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RepoSource {
    Local,
    Cloud,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SidebarWorkspace {
    pub id: Option<String>,
    pub name: String,
    pub slug: Option<String>,
    pub status: String,
    pub source_ref: String,
    pub host: String,
    pub workspace_root: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidebarSelection {
    Repo(usize),
    Workspace(usize, usize),
}

/// Which inline dialog is active in the sidebar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SidebarDialog {
    /// Text input for new workspace name under repo at index.
    NewWorkspace { repo_index: usize, input: String },
    /// Confirmation to delete a workspace with uncommitted changes.
    ConfirmDelete { repo_index: usize, ws_index: usize, message: String },
}

/// Messages from background threads back to the sidebar.
pub enum SidebarMessage {
    Reload,
    ConfirmDelete { repo_index: usize, ws_index: usize, ws_name: String },
    Error(String),
}

pub struct SidebarState {
    pub repos: Vec<SidebarRepo>,
    pub selected: Option<SidebarSelection>,
    pub dialog: Option<SidebarDialog>,
    /// Row of the [+] add-repo button (header).
    pub add_repo_button_row: Option<u16>,
    /// Screen row for each repo's [+] button: (repo_index, row).
    pub repo_button_rows: Vec<(usize, u16)>,
    /// Screen row for each workspace: (repo_index, ws_index, row).
    pub workspace_rows: Vec<(usize, usize, u16)>,
    /// Receiver for background task results.
    bg_rx: mpsc::Receiver<SidebarMessage>,
    bg_tx: mpsc::Sender<SidebarMessage>,
    /// Keep the watcher alive so it doesn't get dropped.
    _watcher: Option<notify::RecommendedWatcher>,
}

impl SidebarState {
    pub fn new() -> Self {
        let repos = load_repos();
        let selected = None;
        let (bg_tx, bg_rx) = mpsc::channel();

        // Watch ~/.lifecycle/config.json for changes
        let watcher = Self::start_config_watcher(bg_tx.clone());

        Self {
            repos,
            selected,
            dialog: None,
            add_repo_button_row: None,
            repo_button_rows: Vec::new(),
            workspace_rows: Vec::new(),
            bg_rx,
            bg_tx,
            _watcher: watcher,
        }
    }

    fn start_config_watcher(tx: mpsc::Sender<SidebarMessage>) -> Option<notify::RecommendedWatcher> {
        let config_path = config_file_path()?;
        let watch_dir = config_path.parent()?.to_path_buf();
        let file_name = config_path.file_name()?.to_owned();

        let mut watcher = recommended_watcher(move |res: Result<notify::Event, notify::Error>| {
            if let Ok(event) = res {
                let is_config = event.paths.iter().any(|p| {
                    p.file_name().map(|n| n == file_name).unwrap_or(false)
                });
                if is_config && matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    let _ = tx.send(SidebarMessage::Reload);
                }
            }
        }).ok()?;

        watcher.watch(&watch_dir, RecursiveMode::NonRecursive).ok()?;
        Some(watcher)
    }

    pub fn move_down(&mut self) {
        let items = self.flat_items();
        if items.is_empty() {
            return;
        }
        let current = self.flat_index(&items);
        let next = match current {
            Some(i) if i + 1 < items.len() => items[i + 1],
            Some(_) => items[0],
            None => items[0],
        };
        self.selected = Some(next);
    }

    pub fn move_up(&mut self) {
        let items = self.flat_items();
        if items.is_empty() {
            return;
        }
        let current = self.flat_index(&items);
        let prev = match current {
            Some(0) => *items.last().unwrap(),
            Some(i) => items[i - 1],
            None => *items.last().unwrap(),
        };
        self.selected = Some(prev);
    }

    pub fn toggle_expand(&mut self) {
        if let Some(SidebarSelection::Repo(i)) = self.selected {
            if let Some(repo) = self.repos.get_mut(i) {
                repo.expanded = !repo.expanded;
            }
        }
    }

    /// Get the currently selected workspace and its repo, if any.
    pub fn selected_workspace(&self) -> Option<(&SidebarRepo, &SidebarWorkspace)> {
        if let Some(SidebarSelection::Workspace(ri, wi)) = self.selected {
            let repo = self.repos.get(ri)?;
            let ws = repo.workspaces.get(wi)?;
            return Some((repo, ws));
        }
        None
    }

    pub fn select_workspace_by_id(&mut self, workspace_id: &str) -> bool {
        for (repo_index, repo) in self.repos.iter_mut().enumerate() {
            if let Some(workspace_index) = repo
                .workspaces
                .iter()
                .position(|workspace| workspace.id.as_deref() == Some(workspace_id))
            {
                repo.expanded = true;
                self.selected = Some(SidebarSelection::Workspace(repo_index, workspace_index));
                return true;
            }
        }
        false
    }

    /// Open the system folder picker in a background thread.
    pub fn add_repo_via_picker(&self) {
        let tx = self.bg_tx.clone();
        thread::spawn(move || {
            if let Some(path) = open_folder_picker() {
                if let Some(bridge) = LifecycleBridgeClient::from_env() {
                    let _ = bridge.register_repo(&path);
                }
                let _ = tx.send(SidebarMessage::Reload);
            }
        });
    }

    /// Poll for background task completions. Returns (changed, error).
    pub fn poll_background(&mut self) -> (bool, Option<String>) {
        let mut changed = false;
        let mut error = None;
        while let Ok(msg) = self.bg_rx.try_recv() {
            match msg {
                SidebarMessage::Reload => {
                    self.repos = load_repos();
                    changed = true;
                }
                SidebarMessage::ConfirmDelete { repo_index, ws_index, ws_name } => {
                    self.dialog = Some(SidebarDialog::ConfirmDelete {
                        repo_index,
                        ws_index,
                        message: format!("\"{ws_name}\" has uncommitted changes. Delete? [y/n]"),
                    });
                    changed = true;
                }
                SidebarMessage::Error(msg) => {
                    error = Some(msg);
                    changed = true;
                }
            }
        }
        (changed, error)
    }

    /// Start the new workspace dialog for the selected repo.
    pub fn start_new_workspace_dialog(&mut self) {
        if let Some(SidebarSelection::Repo(i)) = self.selected {
            self.dialog = Some(SidebarDialog::NewWorkspace {
                repo_index: i,
                input: String::new(),
            });
        }
    }

    /// Handle a character input for the active dialog.
    pub fn dialog_input(&mut self, ch: char) {
        if let Some(SidebarDialog::NewWorkspace { ref mut input, .. }) = self.dialog {
            input.push(ch);
        }
    }

    /// Handle backspace in the active dialog.
    pub fn dialog_backspace(&mut self) {
        if let Some(SidebarDialog::NewWorkspace { ref mut input, .. }) = self.dialog {
            input.pop();
        }
    }

    /// Submit the active dialog.
    pub fn dialog_submit(&mut self) {
        let dialog = self.dialog.take();
        if let Some(SidebarDialog::NewWorkspace { repo_index, input }) = dialog {
            let name = input.trim().to_string();
            if !name.is_empty() {
                let repo_path = self.repos.get(repo_index).and_then(|r| r.path.clone());
                let tx = self.bg_tx.clone();
                thread::spawn(move || {
                    let Some(bridge) = LifecycleBridgeClient::from_env() else {
                        let _ = tx.send(SidebarMessage::Error("Bridge not available.".to_string()));
                        return;
                    };
                    match bridge.create_workspace(&name, repo_path.as_deref()) {
                        Ok(_) => { let _ = tx.send(SidebarMessage::Reload); }
                        Err(e) => { let _ = tx.send(SidebarMessage::Error(e)); }
                    }
                });
            }
        }
    }

    /// Cancel the active dialog.
    pub fn dialog_cancel(&mut self) {
        self.dialog = None;
    }

    pub fn has_dialog(&self) -> bool {
        self.dialog.is_some()
    }

    /// Check if a click row matches a workspace row. Returns true if matched.
    pub fn handle_workspace_click(&mut self, row: u16) -> bool {
        for &(ri, wi, ws_row) in &self.workspace_rows {
            if row == ws_row {
                self.selected = Some(SidebarSelection::Workspace(ri, wi));
                return true;
            }
        }
        false
    }

    /// Try to delete the workspace at the hovered row. Shows confirm dialog if dirty.
    pub fn handle_workspace_delete_click(&mut self, row: u16) -> bool {
        // Check if the click is on a workspace row's [x] zone
        for &(ri, wi, ws_row) in &self.workspace_rows {
            if row == ws_row {
                self.request_delete_workspace(ri, wi);
                return true;
            }
        }
        false
    }

    fn request_delete_workspace(&mut self, repo_index: usize, ws_index: usize) {
        let repo = match self.repos.get(repo_index) {
            Some(r) => r,
            None => return,
        };
        let ws = match repo.workspaces.get(ws_index) {
            Some(w) => w,
            None => return,
        };

        // Try archive without --force first. If it fails due to uncommitted changes, show confirm.
        let ws_name = ws.name.clone();
        let repo_path = match repo.path.clone() {
            Some(p) => p,
            None => return,
        };
        let tx = self.bg_tx.clone();
        let ri = repo_index;
        let wi = ws_index;

        thread::spawn(move || {
            let Some(bridge) = LifecycleBridgeClient::from_env() else { return; };
            match bridge.archive_workspace(&ws_name, &repo_path) {
                Ok(_) => { let _ = tx.send(SidebarMessage::Reload); }
                Err(_) => {
                    let _ = tx.send(SidebarMessage::ConfirmDelete {
                        repo_index: ri,
                        ws_index: wi,
                        ws_name,
                    });
                }
            }
        });
    }

    fn force_delete_workspace(&mut self, repo_index: usize, ws_index: usize) {
        let repo = match self.repos.get(repo_index) {
            Some(r) => r,
            None => return,
        };
        let ws = match repo.workspaces.get(ws_index) {
            Some(w) => w,
            None => return,
        };

        let ws_name = ws.name.clone();
        let repo_path = match repo.path.clone() {
            Some(p) => p,
            None => return,
        };
        let tx = self.bg_tx.clone();

        thread::spawn(move || {
            if let Some(bridge) = LifecycleBridgeClient::from_env() {
                let _ = bridge.archive_workspace(&ws_name, &repo_path);
            }
            let _ = tx.send(SidebarMessage::Reload);
        });
    }

    /// Handle confirm dialog responses.
    pub fn dialog_confirm(&mut self, yes: bool) {
        let dialog = self.dialog.take();
        if let Some(SidebarDialog::ConfirmDelete { repo_index, ws_index, .. }) = dialog {
            if yes {
                self.force_delete_workspace(repo_index, ws_index);
            }
        }
    }

    /// Return the repo index if the given row matches a repo row.
    pub fn repo_at_row(&self, row: u16) -> Option<usize> {
        for &(repo_index, btn_row) in &self.repo_button_rows {
            if row == btn_row {
                return Some(repo_index);
            }
        }
        None
    }

    /// Check if a mouse click row matches a repo [+] button. If so, open the workspace dialog.
    pub fn handle_repo_button_click(&mut self, row: u16) -> bool {
        for &(repo_index, btn_row) in &self.repo_button_rows {
            if row == btn_row {
                self.selected = Some(SidebarSelection::Repo(repo_index));
                self.dialog = Some(SidebarDialog::NewWorkspace {
                    repo_index,
                    input: String::new(),
                });
                return true;
            }
        }
        false
    }

    fn flat_items(&self) -> Vec<SidebarSelection> {
        let mut items = Vec::new();
        for (ri, repo) in self.repos.iter().enumerate() {
            items.push(SidebarSelection::Repo(ri));
            if repo.expanded {
                for (wi, _) in repo.workspaces.iter().enumerate() {
                    items.push(SidebarSelection::Workspace(ri, wi));
                }
            }
        }
        items
    }

    fn flat_index(&self, items: &[SidebarSelection]) -> Option<usize> {
        self.selected
            .and_then(|sel| items.iter().position(|item| *item == sel))
    }
}

// ---------------------------------------------------------------------------
// Data loading — all data comes from the bridge.
// ---------------------------------------------------------------------------

fn load_repos() -> Vec<SidebarRepo> {
    let repo_list = match LifecycleBridgeClient::from_env() {
        Some(bridge) => bridge.repo_list(),
        None => Err("Bridge not available".to_string()),
    };

    let mut repos: Vec<SidebarRepo> = Vec::new();

    if let Ok(payload) = repo_list {
        for repo in payload.repositories {
            let workspaces = repo
                .workspaces
                .unwrap_or_default()
                .into_iter()
                .map(|ws| SidebarWorkspace {
                    id: Some(ws.id),
                    name: ws.name,
                    slug: None,
                    status: ws.status.unwrap_or_else(|| "active".to_string()),
                    source_ref: ws.git_ref.unwrap_or_default(),
                    host: ws.host.unwrap_or_else(|| "local".to_string()),
                    workspace_root: ws.path,
                })
                .collect();

            repos.push(SidebarRepo {
                name: repo.name,
                source: if repo.source == "cloud" {
                    RepoSource::Cloud
                } else {
                    RepoSource::Local
                },
                path: repo.path,
                workspaces,
                expanded: true,
            });
        }
    }

    if repos.is_empty() {
        repos.push(SidebarRepo {
            name: "(no repositories)".to_string(),
            source: RepoSource::Local,
            path: None,
            workspaces: vec![],
            expanded: false,
        });
    }

    repos
}

fn open_folder_picker() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .args([
                "-e",
                r#"set chosenFolder to choose folder with prompt "Select a repository folder"
return POSIX path of chosenFolder"#,
            ])
            .output()
            .ok()?;

        if !output.status.success() {
            return None; // User cancelled
        }

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            None
        } else {
            Some(path)
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        None // TODO: xdg-open or zenity on Linux
    }
}

fn config_file_path() -> Option<PathBuf> {
    let home = dirs::home_dir()?;
    Some(home.join(".lifecycle").join("config.json"))
}
