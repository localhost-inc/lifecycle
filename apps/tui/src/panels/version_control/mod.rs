pub mod render;

use std::process::Command;

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
    pub fn refresh(&mut self, worktree_path: Option<&str>) {
        let Some(cwd) = worktree_path else {
            self.git = GitState {
                branch: "(no repo)".into(),
                dirty: false,
                ahead: 0,
                behind: 0,
                files: vec![],
                commits: vec![],
            };
            return;
        };

        self.git.branch = git_cmd(cwd, &["rev-parse", "--abbrev-ref", "HEAD"])
            .unwrap_or_else(|| "HEAD".into());

        let status_output = git_cmd(cwd, &["status", "--porcelain"]).unwrap_or_default();
        self.git.files = status_output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let (status, path) = line.split_at(3.min(line.len()));
                GitFileStatus {
                    status: status.trim().to_string(),
                    path: path.trim().to_string(),
                }
            })
            .collect();
        self.git.dirty = !self.git.files.is_empty();

        // ahead/behind
        if let Some(counts) = git_cmd(cwd, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]) {
            let parts: Vec<&str> = counts.split_whitespace().collect();
            if parts.len() == 2 {
                self.git.ahead = parts[0].parse().unwrap_or(0);
                self.git.behind = parts[1].parse().unwrap_or(0);
            }
        }

        // recent commits
        let log_output = git_cmd(cwd, &[
            "log", "--oneline", "--format=%h\t%s\t%an\t%cr", "-10",
        ]).unwrap_or_default();
        self.git.commits = log_output
            .lines()
            .filter(|l| !l.is_empty())
            .filter_map(|line| {
                let parts: Vec<&str> = line.splitn(4, '\t').collect();
                if parts.len() == 4 {
                    Some(GitCommitEntry {
                        sha: parts[0].to_string(),
                        message: parts[1].to_string(),
                        author: parts[2].to_string(),
                        relative_time: parts[3].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();
    }
}

fn git_cmd(cwd: &str, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
