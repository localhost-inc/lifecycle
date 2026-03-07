use crate::platform::git::worktree;
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStats {
    pub insertions: Option<u64>,
    pub deletions: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub original_path: Option<String>,
    pub index_status: Option<String>,
    pub worktree_status: Option<String>,
    pub staged: bool,
    pub unstaged: bool,
    pub stats: GitFileStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u64,
    pub behind: u64,
    pub files: Vec<GitFileStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogEntry {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub scope: String,
    pub file_path: String,
    pub original_path: Option<String>,
    pub patch: String,
    pub is_binary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitDiffResult {
    pub sha: String,
    pub patch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPushResult {
    pub branch: Option<String>,
    pub remote: Option<String>,
    pub ahead: u64,
    pub behind: u64,
}

#[derive(Debug, Clone)]
struct ParsedBranchStatus {
    branch: Option<String>,
    upstream: Option<String>,
    ahead: u64,
    behind: u64,
}

#[derive(Debug, Clone)]
struct ParsedNumstatEntry {
    path: String,
    insertions: Option<u64>,
    deletions: Option<u64>,
}

#[derive(Debug, Clone)]
struct ResolvedBranchDiffBaseRef {
    diff_base: String,
}

#[derive(Debug, Clone)]
struct BranchDiffPathSelection {
    file_path: String,
    original_path: Option<String>,
    pathspecs: Vec<String>,
}

#[derive(Debug, Clone)]
struct BranchDiffRenameEntry {
    original_path: String,
    current_path: String,
}

fn git_failure(operation: &str, stderr: &[u8]) -> LifecycleError {
    let reason = {
        let stderr = String::from_utf8_lossy(stderr).trim().to_string();
        if stderr.is_empty() {
            "git command failed".to_string()
        } else {
            stderr
        }
    };

    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason,
    }
}

async fn git_command(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<std::process::Output, LifecycleError> {
    Command::new("git")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: operation.to_string(),
            reason: error.to_string(),
        })
}

async fn git_output(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<Vec<u8>, LifecycleError> {
    let output = git_command(repo_path, operation, args).await?;

    if !output.status.success() {
        return Err(git_failure(operation, &output.stderr));
    }

    Ok(output.stdout)
}

fn parse_head_sha(output: &[u8]) -> Option<String> {
    let sha = String::from_utf8_lossy(output).trim().to_string();
    if sha.is_empty() {
        None
    } else {
        Some(sha)
    }
}

fn trimmed_stdout(output: &[u8]) -> String {
    String::from_utf8_lossy(output).trim().to_string()
}

async fn resolve_head_sha(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    let output = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "resolve git head sha".to_string(),
            reason: error.to_string(),
        })?;

    if output.status.success() {
        Ok(parse_head_sha(&output.stdout))
    } else {
        Ok(None)
    }
}

fn parse_branch_header(line: &str) -> ParsedBranchStatus {
    let mut branch = None;
    let mut upstream = None;
    let mut ahead = 0;
    let mut behind = 0;

    let header = line.trim_start_matches("## ").trim();
    let (branch_part, tracking_part) = if let Some((branch_part, rest)) = header.split_once("...") {
        (branch_part.trim(), Some(rest))
    } else {
        (header, None)
    };

    if let Some(name) = branch_part.strip_prefix("No commits yet on ") {
        branch = Some(name.to_string());
    } else if let Some(name) = branch_part.strip_prefix("Initial commit on ") {
        branch = Some(name.to_string());
    } else if !branch_part.starts_with("HEAD ") && branch_part != "HEAD" {
        branch = Some(branch_part.to_string());
    }

    if let Some(tracking_part) = tracking_part {
        let (upstream_part, counts_part) =
            if let Some((upstream_part, counts_part)) = tracking_part.split_once(" [") {
                (
                    upstream_part.trim(),
                    Some(counts_part.trim_end_matches(']')),
                )
            } else {
                (tracking_part.trim(), None)
            };

        if !upstream_part.is_empty() {
            upstream = Some(upstream_part.to_string());
        }

        if let Some(counts_part) = counts_part {
            for segment in counts_part.split(',') {
                let segment = segment.trim();
                if let Some(value) = segment.strip_prefix("ahead ") {
                    ahead = value.parse::<u64>().unwrap_or(0);
                } else if let Some(value) = segment.strip_prefix("behind ") {
                    behind = value.parse::<u64>().unwrap_or(0);
                }
            }
        }
    }

    ParsedBranchStatus {
        branch,
        upstream,
        ahead,
        behind,
    }
}

fn parse_change_kind(code: char) -> Option<String> {
    match code {
        ' ' => None,
        'M' => Some("modified".to_string()),
        'A' => Some("added".to_string()),
        'D' => Some("deleted".to_string()),
        'R' => Some("renamed".to_string()),
        'C' => Some("copied".to_string()),
        'U' => Some("unmerged".to_string()),
        '?' => Some("untracked".to_string()),
        '!' => Some("ignored".to_string()),
        'T' => Some("type_changed".to_string()),
        _ => None,
    }
}

fn is_unmerged_pair(index: char, worktree: char) -> bool {
    matches!(
        (index, worktree),
        ('U', _) | (_, 'U') | ('A', 'A') | ('D', 'D')
    )
}

fn parse_status_entries(
    output: &[u8],
) -> Result<(ParsedBranchStatus, Vec<GitFileStatus>), LifecycleError> {
    let mut branch_status = ParsedBranchStatus {
        branch: None,
        upstream: None,
        ahead: 0,
        behind: 0,
    };
    let mut files = Vec::new();
    let mut parts = output
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .peekable();

    while let Some(part) = parts.next() {
        let entry =
            std::str::from_utf8(part).map_err(|error| LifecycleError::GitOperationFailed {
                operation: "parse git status output".to_string(),
                reason: error.to_string(),
            })?;

        if entry.starts_with("## ") {
            branch_status = parse_branch_header(entry);
            continue;
        }

        if part.len() < 4 {
            continue;
        }

        let index_code = part[0] as char;
        let worktree_code = part[1] as char;
        let path = std::str::from_utf8(&part[3..]).map_err(|error| {
            LifecycleError::GitOperationFailed {
                operation: "parse git status path".to_string(),
                reason: error.to_string(),
            }
        })?;

        let original_path = if matches!(index_code, 'R' | 'C') || matches!(worktree_code, 'R' | 'C')
        {
            let next_part = parts
                .next()
                .ok_or_else(|| LifecycleError::GitOperationFailed {
                    operation: "parse renamed git status path".to_string(),
                    reason: "missing original path for rename/copy status".to_string(),
                })?;
            Some(
                std::str::from_utf8(next_part)
                    .map_err(|error| LifecycleError::GitOperationFailed {
                        operation: "parse renamed git status path".to_string(),
                        reason: error.to_string(),
                    })?
                    .to_string(),
            )
        } else {
            None
        };

        let (index_status, worktree_status) = if is_unmerged_pair(index_code, worktree_code) {
            (Some("unmerged".to_string()), Some("unmerged".to_string()))
        } else {
            (
                parse_change_kind(index_code),
                parse_change_kind(worktree_code),
            )
        };

        files.push(GitFileStatus {
            path: path.to_string(),
            original_path,
            staged: index_status.is_some()
                && index_status.as_deref() != Some("ignored")
                && index_status.as_deref() != Some("untracked"),
            unstaged: worktree_status.is_some() && worktree_status.as_deref() != Some("ignored"),
            index_status,
            worktree_status,
            stats: GitFileStats {
                insertions: Some(0),
                deletions: Some(0),
            },
        });
    }

    Ok((branch_status, files))
}

fn parse_numstat_count(value: &str) -> Option<u64> {
    if value == "-" {
        None
    } else {
        value.parse::<u64>().ok()
    }
}

fn parse_numstat_entries(output: &[u8]) -> Result<Vec<ParsedNumstatEntry>, LifecycleError> {
    let mut entries = Vec::new();
    let mut parts = output
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .peekable();

    while let Some(part) = parts.next() {
        let line =
            std::str::from_utf8(part).map_err(|error| LifecycleError::GitOperationFailed {
                operation: "parse git numstat output".to_string(),
                reason: error.to_string(),
            })?;
        let mut fields = line.split('\t');
        let insertions = parse_numstat_count(fields.next().unwrap_or("0"));
        let deletions = parse_numstat_count(fields.next().unwrap_or("0"));
        let path_field = fields.next().unwrap_or("");

        let path = if path_field.is_empty() {
            let _original_path =
                parts
                    .next()
                    .ok_or_else(|| LifecycleError::GitOperationFailed {
                        operation: "parse renamed git numstat path".to_string(),
                        reason: "missing original path".to_string(),
                    })?;
            let path = parts
                .next()
                .ok_or_else(|| LifecycleError::GitOperationFailed {
                    operation: "parse renamed git numstat path".to_string(),
                    reason: "missing renamed path".to_string(),
                })?;

            std::str::from_utf8(path)
                .map_err(|error| LifecycleError::GitOperationFailed {
                    operation: "parse renamed git numstat path".to_string(),
                    reason: error.to_string(),
                })?
                .to_string()
        } else {
            path_field.to_string()
        };

        entries.push(ParsedNumstatEntry {
            path,
            insertions,
            deletions,
        });
    }

    Ok(entries)
}

fn combine_counts(left: Option<u64>, right: Option<u64>) -> Option<u64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left + right),
        (Some(left), None) => Some(left),
        (None, Some(right)) => Some(right),
        (None, None) => None,
    }
}

fn merge_stats(
    files: &mut [GitFileStatus],
    worktree_stats: Vec<ParsedNumstatEntry>,
    staged_stats: Vec<ParsedNumstatEntry>,
) {
    let mut stats_by_path = HashMap::<String, GitFileStats>::new();

    for entry in worktree_stats.into_iter().chain(staged_stats.into_iter()) {
        let stats = stats_by_path
            .entry(entry.path.clone())
            .or_insert(GitFileStats {
                insertions: Some(0),
                deletions: Some(0),
            });

        stats.insertions = combine_counts(stats.insertions, entry.insertions);
        stats.deletions = combine_counts(stats.deletions, entry.deletions);
    }

    for file in files {
        if let Some(stats) = stats_by_path.remove(&file.path) {
            file.stats = stats;
        }
    }
}

fn is_workspace_branch_ref(value: &str) -> bool {
    value.starts_with("lifecycle/") || value.contains("/lifecycle/")
}

fn prefer_origin_refs(values: Vec<String>) -> Vec<String> {
    let (mut origin, others): (Vec<_>, Vec<_>) = values
        .into_iter()
        .partition(|value| value == "origin" || value.starts_with("origin/"));
    origin.extend(others);
    origin
}

fn parse_ref_lines(output: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

async fn list_refs(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<Vec<String>, LifecycleError> {
    let output = git_output(repo_path, operation, args).await?;
    Ok(parse_ref_lines(&output))
}

async fn resolve_symbolic_ref(
    repo_path: &str,
    operation: &str,
    reference: &str,
) -> Result<Option<String>, LifecycleError> {
    let args = vec!["symbolic-ref", "--quiet", "--short", reference];
    let output = git_command(repo_path, operation, &args).await?;
    if !output.status.success() {
        return Ok(None);
    }

    let value = trimmed_stdout(&output.stdout);
    if value.is_empty() {
        Ok(None)
    } else {
        Ok(Some(value))
    }
}

async fn resolve_remote_head_label(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    let remotes = prefer_origin_refs(list_refs(repo_path, "list git remotes", &["remote"]).await?);

    for remote in remotes {
        let reference = format!("refs/remotes/{remote}/HEAD");
        if let Some(label) =
            resolve_symbolic_ref(repo_path, "resolve git remote head", &reference).await?
        {
            return Ok(Some(label));
        }
    }

    Ok(None)
}

async fn resolve_remote_branch_label(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    let refs = list_refs(
        repo_path,
        "list git remote branches",
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/remotes",
        ],
    )
    .await?;

    Ok(prefer_origin_refs(refs)
        .into_iter()
        .filter(|reference| !reference.ends_with("/HEAD"))
        .find(|reference| !is_workspace_branch_ref(reference)))
}

async fn resolve_local_branch_label(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    let current_branch = worktree::get_current_branch(repo_path)
        .await
        .ok()
        .filter(|branch| branch != "HEAD");

    let refs = list_refs(
        repo_path,
        "list git local branches",
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname:short)",
            "refs/heads",
        ],
    )
    .await?;

    Ok(refs.into_iter().find(|reference| {
        Some(reference.as_str()) != current_branch.as_deref() && !is_workspace_branch_ref(reference)
    }))
}

async fn resolve_branch_base_ref_label(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    if let Some(upstream) = resolve_upstream(repo_path).await? {
        return Ok(Some(upstream));
    }

    if let Some(remote_head) = resolve_remote_head_label(repo_path).await? {
        return Ok(Some(remote_head));
    }

    if let Some(remote_branch) = resolve_remote_branch_label(repo_path).await? {
        return Ok(Some(remote_branch));
    }

    resolve_local_branch_label(repo_path).await
}

async fn resolve_branch_diff_base(
    repo_path: &str,
) -> Result<ResolvedBranchDiffBaseRef, LifecycleError> {
    let label = resolve_branch_base_ref_label(repo_path)
        .await?
        .ok_or_else(|| LifecycleError::GitOperationFailed {
            operation: "resolve git base ref".to_string(),
            reason: "unable to resolve branch diff base ref".to_string(),
        })?;

    let fork_point_args = vec!["merge-base", "--fork-point", label.as_str(), "HEAD"];
    let fork_point = git_command(repo_path, "resolve git fork point", &fork_point_args).await?;
    let diff_base = if fork_point.status.success() {
        let value = trimmed_stdout(&fork_point.stdout);
        if value.is_empty() {
            None
        } else {
            Some(value)
        }
    } else {
        None
    };

    let diff_base = match diff_base {
        Some(value) => value,
        None => {
            let merge_base_args = vec!["merge-base", label.as_str(), "HEAD"];
            let output = git_output(repo_path, "resolve git merge base", &merge_base_args).await?;
            let value = trimmed_stdout(&output);
            if value.is_empty() {
                return Err(LifecycleError::GitOperationFailed {
                    operation: "resolve git merge base".to_string(),
                    reason: format!("git merge-base returned no revision for {label}"),
                });
            }
            value
        }
    };

    Ok(ResolvedBranchDiffBaseRef { diff_base })
}

fn parse_branch_diff_rename_entries(
    output: &[u8],
) -> Result<Vec<BranchDiffRenameEntry>, LifecycleError> {
    let mut entries = Vec::new();
    let mut parts = output
        .split(|byte| *byte == 0)
        .filter(|part| !part.is_empty())
        .peekable();

    while let Some(part) = parts.next() {
        let status =
            std::str::from_utf8(part).map_err(|error| LifecycleError::GitOperationFailed {
                operation: "parse branch diff rename output".to_string(),
                reason: error.to_string(),
            })?;

        if status.starts_with('R') || status.starts_with('C') {
            let original_path = parts
                .next()
                .ok_or_else(|| LifecycleError::GitOperationFailed {
                    operation: "parse branch diff rename output".to_string(),
                    reason: "missing original path for rename/copy".to_string(),
                })?;
            let current_path = parts
                .next()
                .ok_or_else(|| LifecycleError::GitOperationFailed {
                    operation: "parse branch diff rename output".to_string(),
                    reason: "missing current path for rename/copy".to_string(),
                })?;

            entries.push(BranchDiffRenameEntry {
                original_path: std::str::from_utf8(original_path)
                    .map_err(|error| LifecycleError::GitOperationFailed {
                        operation: "parse branch diff rename output".to_string(),
                        reason: error.to_string(),
                    })?
                    .to_string(),
                current_path: std::str::from_utf8(current_path)
                    .map_err(|error| LifecycleError::GitOperationFailed {
                        operation: "parse branch diff rename output".to_string(),
                        reason: error.to_string(),
                    })?
                    .to_string(),
            });
        } else {
            let _ = parts.next();
        }
    }

    Ok(entries)
}

async fn resolve_branch_diff_path_selection(
    repo_path: &str,
    diff_base: &str,
    requested_file_path: &str,
) -> Result<BranchDiffPathSelection, LifecycleError> {
    let args = vec![
        "diff",
        "--name-status",
        "-z",
        "--find-renames",
        "--find-copies",
        diff_base,
        "HEAD",
        "--",
    ];
    let output = git_output(repo_path, "read branch diff name status", &args).await?;

    for entry in parse_branch_diff_rename_entries(&output)? {
        if requested_file_path == entry.current_path || requested_file_path == entry.original_path {
            let mut pathspecs = vec![entry.original_path.clone()];
            if entry.current_path != entry.original_path {
                pathspecs.push(entry.current_path.clone());
            }

            return Ok(BranchDiffPathSelection {
                file_path: entry.current_path,
                original_path: Some(entry.original_path),
                pathspecs,
            });
        }
    }

    Ok(BranchDiffPathSelection {
        file_path: requested_file_path.to_string(),
        original_path: None,
        pathspecs: vec![requested_file_path.to_string()],
    })
}

pub async fn get_git_status(repo_path: &str) -> Result<GitStatusResult, LifecycleError> {
    let status_output = git_output(
        repo_path,
        "read git status",
        &[
            "status",
            "--porcelain=v1",
            "-b",
            "-z",
            "--untracked-files=all",
        ],
    )
    .await?;
    let worktree_numstat = git_output(
        repo_path,
        "read git worktree numstat",
        &["diff", "--numstat", "-z", "--find-renames", "--find-copies"],
    )
    .await?;
    let staged_numstat = git_output(
        repo_path,
        "read git index numstat",
        &[
            "diff",
            "--cached",
            "--numstat",
            "-z",
            "--find-renames",
            "--find-copies",
        ],
    )
    .await?;

    let (branch_status, mut files) = parse_status_entries(&status_output)?;
    let worktree_stats = parse_numstat_entries(&worktree_numstat)?;
    let staged_stats = parse_numstat_entries(&staged_numstat)?;
    merge_stats(&mut files, worktree_stats, staged_stats);
    files.sort_by(|left, right| left.path.cmp(&right.path));

    Ok(GitStatusResult {
        branch: branch_status.branch,
        head_sha: resolve_head_sha(repo_path).await?,
        upstream: branch_status.upstream,
        ahead: branch_status.ahead,
        behind: branch_status.behind,
        files,
    })
}

pub async fn get_git_base_ref(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    resolve_branch_base_ref_label(repo_path).await
}

fn is_untracked_working_file(file_status: Option<&GitFileStatus>, scope: &str) -> bool {
    scope == "working"
        && matches!(
            file_status.and_then(|status| status.worktree_status.as_deref()),
            Some("untracked")
        )
}

fn temp_empty_file_path() -> PathBuf {
    std::env::temp_dir().join(format!("lifecycle-empty-{}", uuid::Uuid::new_v4()))
}

pub async fn get_git_diff(
    repo_path: &str,
    file_path: &str,
    scope: &str,
) -> Result<GitDiffResult, LifecycleError> {
    let (resolved_file_path, original_path, patch) = match scope {
        "working" | "staged" => {
            let status = get_git_status(repo_path).await?;
            let file_status = status.files.iter().find(|status| status.path == file_path);
            let original_path = file_status.and_then(|status| status.original_path.clone());

            let patch = if is_untracked_working_file(file_status, scope) {
                let empty_file = temp_empty_file_path();
                std::fs::write(&empty_file, []).map_err(|error| {
                    LifecycleError::GitOperationFailed {
                        operation: "prepare untracked git diff".to_string(),
                        reason: error.to_string(),
                    }
                })?;

                let empty_file_str = empty_file.to_string_lossy().into_owned();
                let output = Command::new("git")
                    .args(["diff", "--no-index", "--", &empty_file_str, file_path])
                    .current_dir(repo_path)
                    .output()
                    .await
                    .map_err(|error| LifecycleError::GitOperationFailed {
                        operation: "read untracked git diff".to_string(),
                        reason: error.to_string(),
                    })?;
                if !output.status.success() && output.status.code() != Some(1) {
                    let _ = std::fs::remove_file(&empty_file);
                    return Err(git_failure("read untracked git diff", &output.stderr));
                }
                let patch = String::from_utf8_lossy(&output.stdout).into_owned();
                let _ = std::fs::remove_file(&empty_file);
                patch
            } else if scope == "staged" {
                String::from_utf8_lossy(
                    &git_output(
                        repo_path,
                        "read staged git diff",
                        &["diff", "--cached", "--", file_path],
                    )
                    .await?,
                )
                .into_owned()
            } else {
                String::from_utf8_lossy(
                    &git_output(
                        repo_path,
                        "read working git diff",
                        &["diff", "--", file_path],
                    )
                    .await?,
                )
                .into_owned()
            };

            (file_path.to_string(), original_path, patch)
        }
        "branch" => {
            let base_ref = resolve_branch_diff_base(repo_path).await?;
            let selection =
                resolve_branch_diff_path_selection(repo_path, &base_ref.diff_base, file_path)
                    .await?;
            let mut args = vec![
                "diff",
                "--find-renames",
                "--find-copies",
                "--binary",
                base_ref.diff_base.as_str(),
                "HEAD",
                "--",
            ];
            for pathspec in &selection.pathspecs {
                args.push(pathspec.as_str());
            }

            let patch = String::from_utf8_lossy(
                &git_output(repo_path, "read branch git diff", &args).await?,
            )
            .into_owned();
            (selection.file_path, selection.original_path, patch)
        }
        _ => {
            return Err(LifecycleError::GitOperationFailed {
                operation: "read git diff".to_string(),
                reason: format!("unsupported diff scope: {scope}"),
            });
        }
    };

    let is_binary = patch.contains("Binary files ") || patch.contains("GIT binary patch");

    Ok(GitDiffResult {
        scope: scope.to_string(),
        file_path: resolved_file_path,
        original_path,
        patch,
        is_binary,
    })
}

pub async fn get_git_log(repo_path: &str, limit: u32) -> Result<Vec<GitLogEntry>, LifecycleError> {
    let limit_string = limit.to_string();
    let output = git_output(
        repo_path,
        "read git log",
        &[
            "log",
            "--format=%H%n%h%n%s%n%an%n%ae%n%aI",
            "-n",
            limit_string.as_str(),
        ],
    )
    .await?;
    let lines = String::from_utf8_lossy(&output)
        .lines()
        .map(|line| line.to_string())
        .collect::<Vec<_>>();
    let mut entries = Vec::new();

    for chunk in lines.chunks_exact(6) {
        entries.push(GitLogEntry {
            sha: chunk[0].clone(),
            short_sha: chunk[1].clone(),
            message: chunk[2].clone(),
            author: chunk[3].clone(),
            email: chunk[4].clone(),
            timestamp: chunk[5].clone(),
        });
    }

    Ok(entries)
}

pub async fn stage_git_files(repo_path: &str, file_paths: &[String]) -> Result<(), LifecycleError> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let mut command = Command::new("git");
    command
        .arg("add")
        .arg("--")
        .args(file_paths)
        .current_dir(repo_path);
    let output = command
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "stage git files".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        return Err(git_failure("stage git files", &output.stderr));
    }

    Ok(())
}

pub async fn unstage_git_files(
    repo_path: &str,
    file_paths: &[String],
) -> Result<(), LifecycleError> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let mut command = Command::new("git");
    command
        .arg("reset")
        .arg("HEAD")
        .arg("--")
        .args(file_paths)
        .current_dir(repo_path);
    let output = command
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "unstage git files".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        return Err(git_failure("unstage git files", &output.stderr));
    }

    Ok(())
}

pub async fn commit_git(repo_path: &str, message: &str) -> Result<GitCommitResult, LifecycleError> {
    let _ = git_output(repo_path, "commit git changes", &["commit", "-m", message]).await?;
    let sha = String::from_utf8_lossy(
        &git_output(
            repo_path,
            "resolve committed git sha",
            &["rev-parse", "HEAD"],
        )
        .await?,
    )
    .trim()
    .to_string();

    Ok(GitCommitResult {
        short_sha: sha.chars().take(8).collect(),
        sha,
        message: message.to_string(),
    })
}

pub async fn get_git_commit_patch(
    repo_path: &str,
    sha: &str,
) -> Result<GitCommitDiffResult, LifecycleError> {
    let args = vec![
        "show",
        "--format=",
        "--find-renames",
        "--find-copies",
        "--binary",
        "--root",
        sha,
    ];
    let patch =
        String::from_utf8_lossy(&git_output(repo_path, "read git commit patch", &args).await?)
            .into_owned();

    Ok(GitCommitDiffResult {
        sha: sha.to_string(),
        patch,
    })
}

async fn resolve_upstream(repo_path: &str) -> Result<Option<String>, LifecycleError> {
    let output = Command::new("git")
        .args([
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ])
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: "resolve git upstream".to_string(),
            reason: error.to_string(),
        })?;

    if !output.status.success() {
        return Ok(None);
    }

    let upstream = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if upstream.is_empty() {
        Ok(None)
    } else {
        Ok(Some(upstream))
    }
}

pub async fn push_git(repo_path: &str) -> Result<GitPushResult, LifecycleError> {
    let branch = worktree::get_current_branch(repo_path).await.ok();
    let upstream = resolve_upstream(repo_path).await?;

    if upstream.is_some() {
        let _ = git_output(repo_path, "push git branch", &["push"]).await?;
    } else if let Some(branch) = branch.as_deref() {
        let _ = git_output(
            repo_path,
            "push git branch with upstream",
            &["push", "-u", "origin", branch],
        )
        .await?;
    } else {
        return Err(LifecycleError::GitOperationFailed {
            operation: "push git branch".to_string(),
            reason: "unable to resolve current branch".to_string(),
        });
    }

    let status = get_git_status(repo_path).await?;

    Ok(GitPushResult {
        branch: status.branch.clone(),
        remote: status
            .upstream
            .as_ref()
            .and_then(|upstream| upstream.split('/').next().map(|value| value.to_string())),
        ahead: status.ahead,
        behind: status.behind,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use std::process::Command as StdCommand;

    fn temp_repo_path(prefix: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("{prefix}-{}", uuid::Uuid::new_v4()))
    }

    fn run_git(repo_path: &Path, args: &[&str]) {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }
    }

    fn git_output(repo_path: &Path, args: &[&str]) -> String {
        let output = StdCommand::new("git")
            .args(args)
            .current_dir(repo_path)
            .output()
            .expect("git command should run");
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            panic!("git {:?} failed: {stderr}", args);
        }

        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn configure_repo(repo_path: &Path) {
        run_git(repo_path, &["config", "user.email", "test@example.com"]);
        run_git(repo_path, &["config", "user.name", "Lifecycle Test"]);
    }

    fn init_repo(repo_path: &Path) {
        init_repo_with_branch(repo_path, "main");
    }

    fn init_repo_with_branch(repo_path: &Path, branch_name: &str) {
        fs::create_dir_all(repo_path).expect("create temp repo path");
        run_git(repo_path, &["init"]);
        configure_repo(repo_path);
        fs::write(repo_path.join("README.md"), "seed\n").expect("write seed file");
        run_git(repo_path, &["add", "README.md"]);
        run_git(repo_path, &["commit", "-m", "init"]);

        let current_branch = git_output(repo_path, &["rev-parse", "--abbrev-ref", "HEAD"]);
        if current_branch != branch_name {
            let rename_args = ["branch", "-M", branch_name];
            run_git(repo_path, &rename_args);
        }
    }

    fn clone_bare_repo(source_path: &Path, bare_remote_path: &Path) {
        let root = bare_remote_path.parent().expect("bare remote parent");
        fs::create_dir_all(root).expect("create bare remote parent");

        let source = source_path.to_str().expect("source path is utf8");
        let target = bare_remote_path.to_str().expect("bare remote path is utf8");
        let clone_args = ["clone", "--bare", source, target];
        run_git(root, &clone_args);
    }

    #[tokio::test]
    async fn get_git_status_reports_split_index_and_worktree_state() {
        let repo_path = temp_repo_path("lifecycle-git-status");
        init_repo(&repo_path);
        fs::write(repo_path.join("README.md"), "seed\nsecond\n").expect("modify tracked file");
        run_git(repo_path.as_path(), &["add", "README.md"]);
        fs::write(repo_path.join("README.md"), "seed\nsecond\nthird\n")
            .expect("modify tracked file again");
        fs::write(repo_path.join("notes.txt"), "draft\n").expect("write untracked file");

        let status = get_git_status(repo_path.to_str().expect("repo path is utf8"))
            .await
            .expect("git status should succeed");

        let readme = status
            .files
            .iter()
            .find(|file| file.path == "README.md")
            .expect("tracked file status");
        assert_eq!(readme.index_status.as_deref(), Some("modified"));
        assert_eq!(readme.worktree_status.as_deref(), Some("modified"));
        assert!(readme.staged);
        assert!(readme.unstaged);
        assert_eq!(readme.stats.insertions, Some(2));

        let notes = status
            .files
            .iter()
            .find(|file| file.path == "notes.txt")
            .expect("untracked file status");
        assert_eq!(notes.worktree_status.as_deref(), Some("untracked"));
        assert!(!notes.staged);
        assert!(notes.unstaged);

        fs::remove_dir_all(repo_path).expect("remove temp repo");
    }

    #[tokio::test]
    async fn get_git_status_reports_renamed_files() {
        let repo_path = temp_repo_path("lifecycle-git-status");
        init_repo(&repo_path);
        run_git(repo_path.as_path(), &["mv", "README.md", "docs.md"]);

        let status = get_git_status(repo_path.to_str().expect("repo path is utf8"))
            .await
            .expect("git status should succeed");
        let renamed = status
            .files
            .iter()
            .find(|file| file.path == "docs.md")
            .expect("renamed file status");

        assert_eq!(renamed.index_status.as_deref(), Some("renamed"));
        assert_eq!(renamed.original_path.as_deref(), Some("README.md"));

        fs::remove_dir_all(repo_path).expect("remove temp repo");
    }

    #[tokio::test]
    async fn get_git_diff_supports_untracked_files() {
        let repo_path = temp_repo_path("lifecycle-git-status");
        init_repo(&repo_path);
        fs::write(repo_path.join("notes.txt"), "draft\n").expect("write untracked file");

        let diff = get_git_diff(
            repo_path.to_str().expect("repo path is utf8"),
            "notes.txt",
            "working",
        )
        .await
        .expect("git diff should succeed");

        assert!(diff.patch.contains("+++ b/notes.txt"));
        assert!(diff.patch.contains("+draft"));

        fs::remove_dir_all(repo_path).expect("remove temp repo");
    }

    #[tokio::test]
    async fn get_git_base_ref_resolves_remote_default_branch() {
        let fixture_root = temp_repo_path("lifecycle-git-base-ref");
        let seed_path = fixture_root.join("seed");
        let remote_path = fixture_root.join("remote.git");
        let repo_path = fixture_root.join("repo");

        init_repo_with_branch(&seed_path, "trunk");
        clone_bare_repo(&seed_path, &remote_path);
        fs::create_dir_all(&fixture_root).expect("create fixture root");

        let clone_args = [
            "clone",
            remote_path.to_str().expect("remote path is utf8"),
            repo_path.to_str().expect("repo path is utf8"),
        ];
        run_git(fixture_root.as_path(), &clone_args);
        configure_repo(&repo_path);
        run_git(repo_path.as_path(), &["checkout", "-b", "lifecycle/test"]);

        let base_ref = get_git_base_ref(repo_path.to_str().expect("repo path is utf8"))
            .await
            .expect("resolve git base ref");

        assert_eq!(base_ref.as_deref(), Some("origin/trunk"));

        fs::remove_dir_all(fixture_root).expect("remove fixture root");
    }

    #[tokio::test]
    async fn get_git_diff_branch_scope_uses_merge_base_and_preserves_rename_semantics() {
        let repo_path = temp_repo_path("lifecycle-git-branch-diff");
        init_repo_with_branch(&repo_path, "trunk");
        run_git(repo_path.as_path(), &["checkout", "-b", "lifecycle/test"]);

        run_git(repo_path.as_path(), &["checkout", "trunk"]);
        fs::write(repo_path.join("README.md"), "seed\nupstream\n")
            .expect("write upstream branch change");
        run_git(repo_path.as_path(), &["commit", "-am", "upstream change"]);

        run_git(repo_path.as_path(), &["checkout", "lifecycle/test"]);
        run_git(repo_path.as_path(), &["mv", "README.md", "docs.md"]);
        run_git(repo_path.as_path(), &["commit", "-am", "rename readme"]);

        let branch_diff = get_git_diff(
            repo_path.to_str().expect("repo path is utf8"),
            "docs.md",
            "branch",
        )
        .await
        .expect("branch diff should succeed");
        assert_eq!(branch_diff.original_path.as_deref(), Some("README.md"));
        assert!(branch_diff.patch.contains("rename from README.md"));
        assert!(branch_diff.patch.contains("rename to docs.md"));
        assert!(!branch_diff.patch.contains("upstream"));

        let original_path_diff = get_git_diff(
            repo_path.to_str().expect("repo path is utf8"),
            "README.md",
            "branch",
        )
        .await
        .expect("branch diff should preserve rename semantics for original path");
        assert!(original_path_diff.patch.contains("rename from README.md"));
        assert!(original_path_diff.patch.contains("rename to docs.md"));

        fs::remove_dir_all(repo_path).expect("remove temp repo");
    }

    #[tokio::test]
    async fn get_git_commit_patch_returns_patch_only() {
        let repo_path = temp_repo_path("lifecycle-git-commit-patch");
        init_repo(&repo_path);
        fs::write(repo_path.join("README.md"), "seed\nsecond\n").expect("modify tracked file");
        run_git(repo_path.as_path(), &["commit", "-am", "update readme"]);
        let sha = git_output(repo_path.as_path(), &["rev-parse", "HEAD"]);

        let commit_patch =
            get_git_commit_patch(repo_path.to_str().expect("repo path is utf8"), sha.as_str())
                .await
                .expect("commit patch should succeed");
        assert_eq!(commit_patch.sha, sha);
        assert!(commit_patch.patch.starts_with("diff --git "));
        assert!(commit_patch.patch.contains("+++ b/README.md"));
        assert!(!commit_patch.patch.contains("Author:"));

        fs::remove_dir_all(repo_path).expect("remove temp repo");
    }

    #[tokio::test]
    async fn commit_and_push_git_return_normalized_results() {
        let repo_path = temp_repo_path("lifecycle-git-status");
        let remote_path = temp_repo_path("lifecycle-git-remote");
        fs::create_dir_all(&remote_path).expect("create remote root");
        run_git(remote_path.as_path(), &["init", "--bare"]);

        init_repo(&repo_path);
        run_git(
            repo_path.as_path(),
            &[
                "remote",
                "add",
                "origin",
                remote_path.to_str().expect("remote path is utf8"),
            ],
        );
        let default_branch =
            git_output(repo_path.as_path(), &["rev-parse", "--abbrev-ref", "HEAD"]);
        let push_args = ["push", "-u", "origin", default_branch.as_str()];
        run_git(repo_path.as_path(), &push_args);

        fs::write(repo_path.join("README.md"), "seed\nsecond\n").expect("modify tracked file");
        stage_git_files(
            repo_path.to_str().expect("repo path is utf8"),
            &[String::from("README.md")],
        )
        .await
        .expect("stage git file");

        let commit = commit_git(
            repo_path.to_str().expect("repo path is utf8"),
            "feat: add version control panel",
        )
        .await
        .expect("commit git changes");
        assert_eq!(commit.short_sha.len(), 8);

        let push = push_git(repo_path.to_str().expect("repo path is utf8"))
            .await
            .expect("push git changes");
        assert_eq!(push.remote.as_deref(), Some("origin"));
        assert_eq!(push.ahead, 0);

        fs::remove_dir_all(repo_path).expect("remove temp repo");
        fs::remove_dir_all(remote_path).expect("remove temp remote");
    }
}
