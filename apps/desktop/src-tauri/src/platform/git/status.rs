use crate::platform::git::worktree;
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[path = "status/runner.rs"]
mod runner;
#[path = "status/z_records.rs"]
mod z_records;

use runner::{git_output, git_output_allow_exit, git_output_optional};
use z_records::ZeroSeparatedRecords;

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
    Ok(
        git_output_optional(repo_path, "resolve git head sha", &["rev-parse", "HEAD"])
            .await?
            .as_deref()
            .and_then(parse_head_sha),
    )
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
    let mut parts = ZeroSeparatedRecords::new(output, "parse git status output");

    while let Some(entry) = parts.next_str()? {
        if entry.starts_with("## ") {
            branch_status = parse_branch_header(entry);
            continue;
        }

        let bytes = entry.as_bytes();
        if bytes.len() < 4 {
            continue;
        }

        let index_code = bytes[0] as char;
        let worktree_code = bytes[1] as char;
        let path = &entry[3..];

        let original_path = if matches!(index_code, 'R' | 'C') || matches!(worktree_code, 'R' | 'C')
        {
            Some(
                parts
                    .next_required_str("missing original path for rename/copy status")?
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
    let mut parts = ZeroSeparatedRecords::new(output, "parse git numstat output");

    while let Some(line) = parts.next_str()? {
        let mut fields = line.split('\t');
        let insertions = parse_numstat_count(fields.next().unwrap_or("0"));
        let deletions = parse_numstat_count(fields.next().unwrap_or("0"));
        let path_field = fields.next().unwrap_or("");

        let path = if path_field.is_empty() {
            let _original_path = parts.next_required_str("missing original path")?;
            parts.next_required_str("missing renamed path")?.to_string()
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
    let args = ["symbolic-ref", "--quiet", "--short", reference];
    let output = git_output_optional(repo_path, operation, &args).await?;
    Ok(output
        .map(|stdout| trimmed_stdout(&stdout))
        .filter(|value| !value.is_empty()))
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
    let diff_base = git_output_optional(repo_path, "resolve git fork point", &fork_point_args)
        .await?
        .map(|stdout| trimmed_stdout(&stdout))
        .filter(|value| !value.is_empty());

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
    let mut parts = ZeroSeparatedRecords::new(output, "parse branch diff rename output");

    while let Some(status) = parts.next_str()? {
        if status.starts_with('R') || status.starts_with('C') {
            entries.push(BranchDiffRenameEntry {
                original_path: parts
                    .next_required_str("missing original path for rename/copy")?
                    .to_string(),
                current_path: parts
                    .next_required_str("missing current path for rename/copy")?
                    .to_string(),
            });
        } else {
            let _ = parts.next_str()?;
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

async fn read_untracked_working_diff(
    repo_path: &str,
    file_path: &str,
) -> Result<String, LifecycleError> {
    let empty_file = temp_empty_file_path();
    std::fs::write(&empty_file, []).map_err(|error| LifecycleError::GitOperationFailed {
        operation: "prepare untracked git diff".to_string(),
        reason: error.to_string(),
    })?;

    let empty_file_str = empty_file.to_string_lossy().into_owned();
    let output = git_output_allow_exit(
        repo_path,
        "read untracked git diff",
        &["diff", "--no-index", "--", &empty_file_str, file_path],
        &[1],
    )
    .await;
    let _ = std::fs::remove_file(&empty_file);

    Ok(String::from_utf8_lossy(&output?.stdout).into_owned())
}

async fn read_working_or_staged_diff(
    repo_path: &str,
    file_path: &str,
    scope: &str,
) -> Result<(String, Option<String>, String), LifecycleError> {
    let status = get_git_status(repo_path).await?;
    let file_status = status.files.iter().find(|status| status.path == file_path);
    let original_path = file_status.and_then(|status| status.original_path.clone());

    let patch = if is_untracked_working_file(file_status, scope) {
        read_untracked_working_diff(repo_path, file_path).await?
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

    Ok((file_path.to_string(), original_path, patch))
}

async fn read_branch_diff(
    repo_path: &str,
    file_path: &str,
) -> Result<(String, Option<String>, String), LifecycleError> {
    let base_ref = resolve_branch_diff_base(repo_path).await?;
    let selection =
        resolve_branch_diff_path_selection(repo_path, &base_ref.diff_base, file_path).await?;
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

    let patch =
        String::from_utf8_lossy(&git_output(repo_path, "read branch git diff", &args).await?)
            .into_owned();
    Ok((selection.file_path, selection.original_path, patch))
}

pub async fn get_git_diff(
    repo_path: &str,
    file_path: &str,
    scope: &str,
) -> Result<GitDiffResult, LifecycleError> {
    let (resolved_file_path, original_path, patch) = match scope {
        "working" | "staged" => read_working_or_staged_diff(repo_path, file_path, scope).await?,
        "branch" => read_branch_diff(repo_path, file_path).await?,
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

pub async fn get_git_scope_patch(repo_path: &str, scope: &str) -> Result<String, LifecycleError> {
    let patch = match scope {
        "working" => {
            let mut patch = String::from_utf8_lossy(
                &git_output(repo_path, "read working git diff", &["diff"]).await?,
            )
            .into_owned();
            let status = get_git_status(repo_path).await?;

            for file in status
                .files
                .iter()
                .filter(|file| matches!(file.worktree_status.as_deref(), Some("untracked")))
            {
                let file_patch = read_untracked_working_diff(repo_path, &file.path).await?;
                if file_patch.is_empty() {
                    continue;
                }

                if !patch.is_empty() && !patch.ends_with('\n') {
                    patch.push('\n');
                }

                patch.push_str(&file_patch);
            }

            patch
        }
        "staged" => String::from_utf8_lossy(
            &git_output(repo_path, "read staged git diff", &["diff", "--cached"]).await?,
        )
        .into_owned(),
        "branch" => {
            let base_ref = resolve_branch_diff_base(repo_path).await?;
            String::from_utf8_lossy(
                &git_output(
                    repo_path,
                    "read branch git diff",
                    &[
                        "diff",
                        "--find-renames",
                        "--find-copies",
                        "--binary",
                        base_ref.diff_base.as_str(),
                        "HEAD",
                    ],
                )
                .await?,
            )
            .into_owned()
        }
        _ => {
            return Err(LifecycleError::GitOperationFailed {
                operation: "read git scope diff".to_string(),
                reason: format!("unsupported diff scope: {scope}"),
            });
        }
    };

    Ok(patch)
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
    Ok(lines
        .chunks_exact(6)
        .map(|chunk| GitLogEntry {
            sha: chunk[0].clone(),
            short_sha: chunk[1].clone(),
            message: chunk[2].clone(),
            author: chunk[3].clone(),
            email: chunk[4].clone(),
            timestamp: chunk[5].clone(),
        })
        .collect())
}

pub async fn stage_git_files(repo_path: &str, file_paths: &[String]) -> Result<(), LifecycleError> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let mut args = vec!["add", "--"];
    for file_path in file_paths {
        args.push(file_path.as_str());
    }
    let _ = git_output(repo_path, "stage git files", &args).await?;

    Ok(())
}

pub async fn unstage_git_files(
    repo_path: &str,
    file_paths: &[String],
) -> Result<(), LifecycleError> {
    if file_paths.is_empty() {
        return Ok(());
    }

    let mut args = vec!["reset", "HEAD", "--"];
    for file_path in file_paths {
        args.push(file_path.as_str());
    }
    let _ = git_output(repo_path, "unstage git files", &args).await?;

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
    Ok(git_output_optional(
        repo_path,
        "resolve git upstream",
        &[
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
        ],
    )
    .await?
    .map(|stdout| trimmed_stdout(&stdout))
    .filter(|upstream| !upstream.is_empty()))
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
    async fn get_git_scope_patch_includes_tracked_and_untracked_working_changes() {
        let repo_path = temp_repo_path("lifecycle-git-scope-patch");
        init_repo(&repo_path);
        fs::write(repo_path.join("README.md"), "seed\nsecond\n").expect("modify tracked file");
        fs::write(repo_path.join("notes.txt"), "draft\n").expect("write untracked file");

        let patch = get_git_scope_patch(repo_path.to_str().expect("repo path is utf8"), "working")
            .await
            .expect("git scope patch should succeed");

        assert!(patch.contains("diff --git a/README.md b/README.md"));
        assert!(patch.contains("+++ b/README.md"));
        assert!(patch.contains("+++ b/notes.txt"));
        assert!(patch.contains("+draft"));

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
    async fn get_git_scope_patch_branch_scope_uses_merge_base() {
        let repo_path = temp_repo_path("lifecycle-git-branch-scope-patch");
        init_repo_with_branch(&repo_path, "trunk");
        run_git(repo_path.as_path(), &["checkout", "-b", "lifecycle/test"]);

        run_git(repo_path.as_path(), &["checkout", "trunk"]);
        fs::write(repo_path.join("README.md"), "seed\nupstream\n")
            .expect("write upstream branch change");
        run_git(repo_path.as_path(), &["commit", "-am", "upstream change"]);

        run_git(repo_path.as_path(), &["checkout", "lifecycle/test"]);
        run_git(repo_path.as_path(), &["mv", "README.md", "docs.md"]);
        fs::write(repo_path.join("docs.md"), "seed\nbranch\n").expect("write branch change");
        run_git(repo_path.as_path(), &["commit", "-am", "rename readme"]);

        let branch_patch =
            get_git_scope_patch(repo_path.to_str().expect("repo path is utf8"), "branch")
                .await
                .expect("branch scope patch should succeed");

        assert!(branch_patch.contains("diff --git a/docs.md b/docs.md"));
        assert!(branch_patch.contains("+++ b/docs.md"));
        assert!(branch_patch.contains("seed"));
        assert!(branch_patch.contains("branch"));
        assert!(!branch_patch.contains("upstream"));

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
