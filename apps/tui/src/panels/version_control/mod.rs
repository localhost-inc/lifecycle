pub mod render;

use crate::bridge::LifecycleBridgeClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VcTab {
    Status,
    Commits,
}

impl VcTab {
    pub const ALL: &'static [VcTab] = &[VcTab::Status, VcTab::Commits];

    pub fn label(self) -> &'static str {
        match self {
            Self::Status => "Status",
            Self::Commits => "Commits",
        }
    }
}

#[derive(Debug, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String, // "M", "A", "D", "??"
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct GitCommitEntry {
    pub sha: String,
    pub message: String,
    pub author: String,
    pub relative_time: String,
}

#[derive(Debug, Clone)]
pub struct GitState {
    pub branch: String,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
    pub commits: Vec<GitCommitEntry>,
}

pub struct VersionControlPanel {
    pub collapsed: bool,
    pub active_tab: VcTab,
    pub git: GitState,
    pub scroll: u16,
}

impl VersionControlPanel {
    pub fn new() -> Self {
        Self {
            collapsed: false,
            active_tab: VcTab::Status,
            git: GitState {
                branch: String::new(),
                dirty: false,
                ahead: 0,
                behind: 0,
                files: vec![],
                commits: vec![],
            },
            scroll: 0,
        }
    }

    pub fn toggle_collapsed(&mut self) {
        self.collapsed = !self.collapsed;
    }

    pub fn scroll_up(&mut self) {
        self.scroll = self.scroll.saturating_sub(1);
    }

    pub fn scroll_down(&mut self) {
        self.scroll = self.scroll.saturating_add(1);
    }

    pub fn next_tab(&mut self) {
        let tabs = VcTab::ALL;
        let idx = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(idx + 1) % tabs.len()];
    }

    pub fn prev_tab(&mut self) {
        let tabs = VcTab::ALL;
        let idx = tabs.iter().position(|t| *t == self.active_tab).unwrap_or(0);
        self.active_tab = tabs[(idx + tabs.len() - 1) % tabs.len()];
    }

    /// Refresh git state from a worktree path.
    pub fn refresh(&mut self, workspace_id: Option<&str>) {
        self.git = load_git_state(workspace_id);
    }

    pub fn set_loading(&mut self) {
        self.git = GitState {
            branch: "(loading…)".into(),
            dirty: false,
            ahead: 0,
            behind: 0,
            files: vec![],
            commits: vec![],
        };
    }
}

pub fn load_git_state(workspace_id: Option<&str>) -> GitState {
    let Some(workspace_id) = workspace_id else {
        return GitState {
            branch: "(no repo)".into(),
            dirty: false,
            ahead: 0,
            behind: 0,
            files: vec![],
            commits: vec![],
        };
    };

    let Some(bridge) = LifecycleBridgeClient::from_env() else {
        return GitState {
            branch: "(bridge unavailable)".into(),
            dirty: false,
            ahead: 0,
            behind: 0,
            files: vec![],
            commits: vec![],
        };
    };

    let Ok(payload) = bridge.workspace_git(workspace_id) else {
        return GitState {
            branch: "(git unavailable)".into(),
            dirty: false,
            ahead: 0,
            behind: 0,
            files: vec![],
            commits: vec![],
        };
    };

    let files = payload
        .status
        .files
        .into_iter()
        .map(|file| GitFileStatus {
            status: summarize_git_file_status(&file),
            path: file.path,
        })
        .collect::<Vec<_>>();
    let dirty = !files.is_empty();

    let commits = payload
        .commits
        .into_iter()
        .map(|entry| GitCommitEntry {
            sha: entry.short_sha,
            message: entry.message,
            author: entry.author,
            relative_time: relative_time(&entry.timestamp),
        })
        .collect();

    GitState {
        branch: payload.status.branch.unwrap_or_else(|| "HEAD".into()),
        dirty,
        ahead: payload.status.ahead,
        behind: payload.status.behind,
        files,
        commits,
    }
}

fn summarize_git_file_status(file: &crate::bridge::GitFileStatusPayload) -> String {
    if let Some(index) = &file.index_status {
        return index.clone();
    }
    if let Some(worktree) = &file.worktree_status {
        return worktree.clone();
    }
    if file.staged {
        return "staged".to_string();
    }
    if file.unstaged {
        return "modified".to_string();
    }
    "changed".to_string()
}

fn relative_time(timestamp: &str) -> String {
    timestamp.to_string()
}
