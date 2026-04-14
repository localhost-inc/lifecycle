pub mod render;

use crate::bridge::LifecycleBridgeClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VcTab {
    Status,
    PullRequests,
    Commits,
}

impl VcTab {
    pub const ALL: &'static [VcTab] = &[VcTab::Status, VcTab::PullRequests, VcTab::Commits];

    pub fn label(self) -> &'static str {
        match self {
            Self::Status => "Status",
            Self::PullRequests => "PRs",
            Self::Commits => "Commits",
        }
    }
}

#[derive(Debug, Clone)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub insertions: Option<u32>,
    pub deletions: Option<u32>,
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
pub struct GitPullRequestSupport {
    pub available: bool,
    pub provider: Option<String>,
    pub reason: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone)]
pub struct GitPullRequestCheck {
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct GitPullRequestSummary {
    pub number: u32,
    pub title: String,
    pub state: String,
    pub is_draft: bool,
    pub author: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub mergeable: String,
    pub review_decision: Option<String>,
    pub checks: Vec<GitPullRequestCheck>,
}

#[derive(Debug, Clone)]
pub struct GitBranchPullRequestState {
    pub support: GitPullRequestSupport,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub has_pull_request_changes: Option<bool>,
    pub suggested_base_ref: Option<String>,
    pub pull_request: Option<GitPullRequestSummary>,
}

#[derive(Debug, Clone)]
pub struct GitPullRequestListState {
    pub support: GitPullRequestSupport,
    pub pull_requests: Vec<GitPullRequestSummary>,
}

#[derive(Debug, Clone)]
pub struct GitState {
    pub branch: String,
    pub dirty: bool,
    pub ahead: u32,
    pub behind: u32,
    pub files: Vec<GitFileStatus>,
    pub commits: Vec<GitCommitEntry>,
    pub current_branch: GitBranchPullRequestState,
    pub pull_requests: GitPullRequestListState,
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
                current_branch: empty_current_branch(),
                pull_requests: empty_pull_request_list(),
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
            current_branch: empty_current_branch(),
            pull_requests: empty_pull_request_list(),
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
            current_branch: empty_current_branch(),
            pull_requests: empty_pull_request_list(),
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
            current_branch: empty_current_branch(),
            pull_requests: empty_pull_request_list(),
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
            current_branch: empty_current_branch(),
            pull_requests: empty_pull_request_list(),
        };
    };

    let files = payload
        .status
        .files
        .into_iter()
        .map(|file| GitFileStatus {
            status: summarize_git_file_status(&file),
            path: display_git_file_path(&file),
            insertions: file.stats.insertions,
            deletions: file.stats.deletions,
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
        current_branch: GitBranchPullRequestState {
            support: map_pull_request_support(payload.current_branch.support),
            branch: payload.current_branch.branch,
            upstream: payload.current_branch.upstream,
            has_pull_request_changes: payload.current_branch.has_pull_request_changes,
            suggested_base_ref: payload.current_branch.suggested_base_ref,
            pull_request: payload
                .current_branch
                .pull_request
                .map(map_pull_request_summary),
        },
        pull_requests: GitPullRequestListState {
            support: map_pull_request_support(payload.pull_requests.support),
            pull_requests: payload
                .pull_requests
                .pull_requests
                .into_iter()
                .map(map_pull_request_summary)
                .collect(),
        },
    }
}

fn summarize_git_file_status(file: &crate::bridge::GitFileStatusPayload) -> String {
    let index = git_change_code(file.index_status.as_deref());
    let worktree = git_change_code(file.worktree_status.as_deref());

    if index == Some('?') || worktree == Some('?') {
        return "??".to_string();
    }
    if index == Some('!') || worktree == Some('!') {
        return "!!".to_string();
    }

    let index = index.unwrap_or(if file.staged { 'M' } else { ' ' });
    let worktree = worktree.unwrap_or(if file.unstaged { 'M' } else { ' ' });
    let status = format!("{index}{worktree}");

    if status.trim().is_empty() {
        "??".to_string()
    } else {
        status
    }
}

fn display_git_file_path(file: &crate::bridge::GitFileStatusPayload) -> String {
    match &file.original_path {
        Some(original_path) => format!("{original_path} -> {}", file.path),
        None => file.path.clone(),
    }
}

fn relative_time(timestamp: &str) -> String {
    timestamp.to_string()
}

fn git_change_code(change: Option<&str>) -> Option<char> {
    match change {
        Some("modified") => Some('M'),
        Some("added") => Some('A'),
        Some("deleted") => Some('D'),
        Some("renamed") => Some('R'),
        Some("copied") => Some('C'),
        Some("unmerged") => Some('U'),
        Some("untracked") => Some('?'),
        Some("ignored") => Some('!'),
        Some("type_changed") => Some('T'),
        _ => None,
    }
}

fn map_pull_request_support(
    support: crate::bridge::GitPullRequestSupportPayload,
) -> GitPullRequestSupport {
    GitPullRequestSupport {
        available: support.available,
        provider: support.provider,
        reason: support.reason,
        message: support.message,
    }
}

fn map_pull_request_summary(
    summary: crate::bridge::GitPullRequestSummaryPayload,
) -> GitPullRequestSummary {
    GitPullRequestSummary {
        number: summary.number,
        title: summary.title,
        state: summary.state,
        is_draft: summary.is_draft,
        author: summary.author,
        head_ref_name: summary.head_ref_name,
        base_ref_name: summary.base_ref_name,
        mergeable: summary.mergeable,
        review_decision: summary.review_decision,
        checks: summary
            .checks
            .unwrap_or_default()
            .into_iter()
            .map(|check| GitPullRequestCheck {
                status: check.status,
            })
            .collect(),
    }
}

fn empty_pull_request_support() -> GitPullRequestSupport {
    GitPullRequestSupport {
        available: false,
        provider: None,
        reason: None,
        message: None,
    }
}

fn empty_current_branch() -> GitBranchPullRequestState {
    GitBranchPullRequestState {
        support: empty_pull_request_support(),
        branch: None,
        upstream: None,
        has_pull_request_changes: None,
        suggested_base_ref: None,
        pull_request: None,
    }
}

fn empty_pull_request_list() -> GitPullRequestListState {
    GitPullRequestListState {
        support: empty_pull_request_support(),
        pull_requests: vec![],
    }
}

#[cfg(test)]
mod tests {
    use super::{display_git_file_path, summarize_git_file_status};
    use crate::bridge::{GitFileStatsPayload, GitFileStatusPayload};

    #[test]
    fn summarizes_split_index_and_worktree_statuses() {
        let file = GitFileStatusPayload {
            path: "src/app.ts".into(),
            original_path: None,
            index_status: Some("modified".into()),
            worktree_status: Some("deleted".into()),
            staged: true,
            unstaged: true,
            stats: GitFileStatsPayload {
                insertions: Some(4),
                deletions: Some(2),
            },
        };

        assert_eq!(summarize_git_file_status(&file), "MD");
    }

    #[test]
    fn summarizes_untracked_files_like_git_porcelain() {
        let file = GitFileStatusPayload {
            path: "src/new.ts".into(),
            original_path: None,
            index_status: None,
            worktree_status: Some("untracked".into()),
            staged: false,
            unstaged: true,
            stats: GitFileStatsPayload {
                insertions: None,
                deletions: None,
            },
        };

        assert_eq!(summarize_git_file_status(&file), "??");
    }

    #[test]
    fn displays_renamed_paths() {
        let file = GitFileStatusPayload {
            path: "src/new-name.ts".into(),
            original_path: Some("src/old-name.ts".into()),
            index_status: Some("renamed".into()),
            worktree_status: None,
            staged: true,
            unstaged: false,
            stats: GitFileStatsPayload {
                insertions: None,
                deletions: None,
            },
        };

        assert_eq!(
            display_git_file_path(&file),
            "src/old-name.ts -> src/new-name.ts"
        );
    }
}
