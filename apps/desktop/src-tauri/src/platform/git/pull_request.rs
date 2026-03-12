use crate::platform::git::status;
use crate::shared::errors::LifecycleError;
use serde::{Deserialize, Serialize};
use tokio::process::Command;

const PULL_REQUEST_LIST_JSON_FIELDS: &str = concat!(
    "number,title,url,state,isDraft,author,headRefName,baseRefName,createdAt,updatedAt,",
    "mergeable,mergeStateStatus,reviewDecision,statusCheckRollup"
);

const PULL_REQUEST_DETAIL_JSON_FIELDS: &str = concat!(
    "number,title,url,state,isDraft,author,headRefName,baseRefName,createdAt,updatedAt,",
    "mergeable,mergeStateStatus,reviewDecision,statusCheckRollup"
);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestSupport {
    pub available: bool,
    pub provider: Option<String>,
    pub reason: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestSummary {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub state: String,
    pub is_draft: bool,
    pub author: String,
    pub head_ref_name: String,
    pub base_ref_name: String,
    pub created_at: String,
    pub updated_at: String,
    pub mergeable: String,
    pub merge_state_status: Option<String>,
    pub review_decision: Option<String>,
    pub checks: Option<Vec<GitPullRequestCheckSummary>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestCheckSummary {
    pub name: String,
    pub status: String,
    pub workflow_name: Option<String>,
    pub details_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestListResult {
    pub support: GitPullRequestSupport,
    pub pull_requests: Vec<GitPullRequestSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitBranchPullRequestResult {
    pub support: GitPullRequestSupport,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub suggested_base_ref: Option<String>,
    pub pull_request: Option<GitPullRequestSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitPullRequestDetailResult {
    pub support: GitPullRequestSupport,
    pub pull_request: Option<GitPullRequestSummary>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubPullRequestAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubPullRequest {
    number: u64,
    title: String,
    url: String,
    state: String,
    is_draft: bool,
    author: Option<GitHubPullRequestAuthor>,
    head_ref_name: String,
    base_ref_name: String,
    created_at: String,
    updated_at: String,
    mergeable: String,
    merge_state_status: Option<String>,
    review_decision: Option<String>,
    #[serde(default)]
    status_check_rollup: Option<Vec<GitHubStatusCheckRollupItem>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitHubStatusCheckRollupItem {
    conclusion: Option<String>,
    context: Option<String>,
    details_url: Option<String>,
    name: Option<String>,
    state: Option<String>,
    status: Option<String>,
    target_url: Option<String>,
    workflow_name: Option<String>,
}

struct GitHubCommandOutput {
    stdout: Vec<u8>,
    stderr: Vec<u8>,
    status: std::process::ExitStatus,
}

fn support_available() -> GitPullRequestSupport {
    GitPullRequestSupport {
        available: true,
        provider: Some("github".to_string()),
        reason: None,
        message: None,
    }
}

fn support_unavailable(
    provider: Option<&str>,
    reason: &str,
    message: impl Into<String>,
) -> GitPullRequestSupport {
    GitPullRequestSupport {
        available: false,
        provider: provider.map(|value| value.to_string()),
        reason: Some(reason.to_string()),
        message: Some(message.into()),
    }
}

pub fn mode_not_supported(message: impl Into<String>) -> GitPullRequestSupport {
    support_unavailable(None, "mode_not_supported", message)
}

fn github_failure(operation: &str, stderr: &[u8]) -> LifecycleError {
    let reason = {
        let stderr = String::from_utf8_lossy(stderr).trim().to_string();
        if stderr.is_empty() {
            "github command failed".to_string()
        } else {
            stderr
        }
    };

    LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason,
    }
}

fn classify_support_error(stderr: &[u8]) -> GitPullRequestSupport {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    let lowercase = message.to_lowercase();

    if lowercase.contains("not logged into any github hosts")
        || lowercase.contains("authentication failed")
        || lowercase.contains("run gh auth login")
    {
        return support_unavailable(
            Some("github"),
            "authentication_required",
            if message.is_empty() {
                "GitHub authentication is required.".to_string()
            } else {
                message
            },
        );
    }

    if lowercase.contains("could not determine base repository")
        || lowercase.contains("none of the git remotes configured")
        || lowercase.contains("no git remotes configured")
        || lowercase.contains("not a git repository")
    {
        return support_unavailable(
            None,
            "unsupported_remote",
            if message.is_empty() {
                "This workspace is not connected to a GitHub repository.".to_string()
            } else {
                message
            },
        );
    }

    support_unavailable(
        Some("github"),
        "repository_unavailable",
        if message.is_empty() {
            "GitHub repository data is currently unavailable.".to_string()
        } else {
            message
        },
    )
}

fn is_pull_request_not_found(stderr: &[u8]) -> bool {
    let message = String::from_utf8_lossy(stderr).trim().to_lowercase();

    message.contains("pull request not found")
        || message.contains("no pull requests found")
        || message.contains("could not resolve to a pullrequest")
}

async fn gh_command(
    repo_path: &str,
    operation: &str,
    args: &[&str],
) -> Result<GitHubCommandOutput, LifecycleError> {
    let output = Command::new("gh")
        .args(args)
        .current_dir(repo_path)
        .output()
        .await
        .map_err(|error| LifecycleError::GitOperationFailed {
            operation: operation.to_string(),
            reason: error.to_string(),
        })?;

    Ok(GitHubCommandOutput {
        stdout: output.stdout,
        stderr: output.stderr,
        status: output.status,
    })
}

async fn gh_json<T>(repo_path: &str, operation: &str, args: &[&str]) -> Result<T, LifecycleError>
where
    T: for<'de> Deserialize<'de>,
{
    let output = gh_command(repo_path, operation, args).await?;
    if !output.status.success() {
        return Err(github_failure(operation, &output.stderr));
    }

    serde_json::from_slice(&output.stdout).map_err(|error| LifecycleError::GitOperationFailed {
        operation: operation.to_string(),
        reason: format!("failed to parse GitHub response: {error}"),
    })
}

async fn gh_success(repo_path: &str, operation: &str, args: &[&str]) -> Result<(), LifecycleError> {
    let output = gh_command(repo_path, operation, args).await?;
    if !output.status.success() {
        return Err(github_failure(operation, &output.stderr));
    }

    Ok(())
}

fn normalize_pull_request(pr: GitHubPullRequest) -> GitPullRequestSummary {
    GitPullRequestSummary {
        number: pr.number,
        title: pr.title,
        url: pr.url,
        state: normalize_state(&pr.state),
        is_draft: pr.is_draft,
        author: pr
            .author
            .map(|author| author.login)
            .unwrap_or_else(|| "unknown".to_string()),
        head_ref_name: pr.head_ref_name,
        base_ref_name: pr.base_ref_name,
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        mergeable: normalize_mergeable(&pr.mergeable),
        merge_state_status: pr.merge_state_status,
        review_decision: pr
            .review_decision
            .map(|value| normalize_review_decision(&value)),
        checks: normalize_checks(pr.status_check_rollup),
    }
}

fn normalize_checks(
    rollup: Option<Vec<GitHubStatusCheckRollupItem>>,
) -> Option<Vec<GitPullRequestCheckSummary>> {
    let checks = rollup
        .unwrap_or_default()
        .into_iter()
        .map(normalize_check)
        .collect::<Vec<_>>();

    if checks.is_empty() {
        None
    } else {
        Some(checks)
    }
}

fn normalize_check(check: GitHubStatusCheckRollupItem) -> GitPullRequestCheckSummary {
    GitPullRequestCheckSummary {
        name: check
            .name
            .or(check.context)
            .unwrap_or_else(|| "Status check".to_string()),
        status: normalize_check_status(
            check.status.as_deref(),
            check.conclusion.as_deref(),
            check.state.as_deref(),
        ),
        workflow_name: check.workflow_name,
        details_url: check.details_url.or(check.target_url),
    }
}

fn normalize_check_status(
    status: Option<&str>,
    conclusion: Option<&str>,
    state: Option<&str>,
) -> String {
    if let Some(value) = status {
        if value != "COMPLETED" {
            return "pending".to_string();
        }
    }

    if let Some(value) = conclusion {
        return match value {
            "SUCCESS" => "success".to_string(),
            "NEUTRAL" | "SKIPPED" => "neutral".to_string(),
            "ACTION_REQUIRED" | "CANCELLED" | "FAILURE" | "STARTUP_FAILURE" | "STALE"
            | "TIMED_OUT" => "failed".to_string(),
            _ => "pending".to_string(),
        };
    }

    if let Some(value) = state {
        return match value {
            "SUCCESS" => "success".to_string(),
            "PENDING" | "EXPECTED" => "pending".to_string(),
            "ERROR" | "FAILURE" => "failed".to_string(),
            _ => "neutral".to_string(),
        };
    }

    "pending".to_string()
}

fn normalize_state(value: &str) -> String {
    match value {
        "MERGED" => "merged".to_string(),
        "CLOSED" => "closed".to_string(),
        _ => "open".to_string(),
    }
}

fn normalize_mergeable(value: &str) -> String {
    match value {
        "CONFLICTING" => "conflicting".to_string(),
        "MERGEABLE" => "mergeable".to_string(),
        _ => "unknown".to_string(),
    }
}

fn normalize_review_decision(value: &str) -> String {
    match value {
        "APPROVED" => "approved".to_string(),
        "CHANGES_REQUESTED" => "changes_requested".to_string(),
        "REVIEW_REQUIRED" => "review_required".to_string(),
        _ => value.to_lowercase(),
    }
}

async fn load_pull_requests(
    repo_path: &str,
    extra_args: &[&str],
) -> Result<Vec<GitPullRequestSummary>, LifecycleError> {
    let mut args = vec![
        "pr",
        "list",
        "--state",
        "open",
        "--limit",
        "50",
        "--json",
        PULL_REQUEST_LIST_JSON_FIELDS,
    ];
    args.extend_from_slice(extra_args);

    let pull_requests =
        gh_json::<Vec<GitHubPullRequest>>(repo_path, "list GitHub pull requests", &args).await?;

    Ok(pull_requests
        .into_iter()
        .map(normalize_pull_request)
        .collect())
}

async fn load_pull_request_detail(
    repo_path: &str,
    pull_request_number: u64,
    operation: &str,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let pull_request_number_string = pull_request_number.to_string();
    let pull_request = gh_json::<GitHubPullRequest>(
        repo_path,
        operation,
        &[
            "pr",
            "view",
            pull_request_number_string.as_str(),
            "--json",
            PULL_REQUEST_DETAIL_JSON_FIELDS,
        ],
    )
    .await?;

    Ok(normalize_pull_request(pull_request))
}

fn build_pull_request_diff_args(pull_request_number: u64) -> Vec<String> {
    vec![
        "pr".to_string(),
        "diff".to_string(),
        pull_request_number.to_string(),
        "--patch".to_string(),
        "--color".to_string(),
        "never".to_string(),
    ]
}

pub async fn list_open_pull_requests(
    repo_path: &str,
) -> Result<GitPullRequestListResult, LifecycleError> {
    let output = gh_command(
        repo_path,
        "list GitHub pull requests",
        &[
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            PULL_REQUEST_LIST_JSON_FIELDS,
        ],
    )
    .await;

    match output {
        Ok(output) if output.status.success() => {
            let pull_requests = serde_json::from_slice::<Vec<GitHubPullRequest>>(&output.stdout)
                .map_err(|error| LifecycleError::GitOperationFailed {
                    operation: "list GitHub pull requests".to_string(),
                    reason: format!("failed to parse GitHub response: {error}"),
                })?;

            Ok(GitPullRequestListResult {
                support: support_available(),
                pull_requests: pull_requests
                    .into_iter()
                    .map(normalize_pull_request)
                    .collect(),
            })
        }
        Ok(output) => Ok(GitPullRequestListResult {
            support: classify_support_error(&output.stderr),
            pull_requests: Vec::new(),
        }),
        Err(LifecycleError::GitOperationFailed { reason, .. })
            if reason.to_lowercase().contains("no such file")
                || reason.to_lowercase().contains("not found") =>
        {
            Ok(GitPullRequestListResult {
                support: support_unavailable(
                    Some("github"),
                    "provider_unavailable",
                    "GitHub CLI is required for local pull request actions.",
                ),
                pull_requests: Vec::new(),
            })
        }
        Err(error) => Err(error),
    }
}

pub async fn get_current_branch_pull_request(
    repo_path: &str,
) -> Result<GitBranchPullRequestResult, LifecycleError> {
    let status = status::get_git_status(repo_path).await?;
    let suggested_base_ref = status::get_git_base_ref(repo_path).await?;

    let Some(branch) = status.branch.clone() else {
        return Ok(GitBranchPullRequestResult {
            support: support_available(),
            branch: None,
            upstream: status.upstream,
            suggested_base_ref,
            pull_request: None,
        });
    };

    let output = gh_command(
        repo_path,
        "read current branch GitHub pull request",
        &[
            "pr",
            "list",
            "--state",
            "open",
            "--head",
            branch.as_str(),
            "--limit",
            "20",
            "--json",
            PULL_REQUEST_LIST_JSON_FIELDS,
        ],
    )
    .await;

    match output {
        Ok(output) if output.status.success() => {
            let pull_requests = serde_json::from_slice::<Vec<GitHubPullRequest>>(&output.stdout)
                .map_err(|error| LifecycleError::GitOperationFailed {
                    operation: "read current branch GitHub pull request".to_string(),
                    reason: format!("failed to parse GitHub response: {error}"),
                })?;
            let pull_request = match pull_requests.into_iter().next() {
                Some(pull_request) => Some(
                    load_pull_request_detail(
                        repo_path,
                        pull_request.number,
                        "read current branch GitHub pull request details",
                    )
                    .await?,
                ),
                None => None,
            };

            Ok(GitBranchPullRequestResult {
                support: support_available(),
                branch: Some(branch),
                upstream: status.upstream,
                suggested_base_ref,
                pull_request,
            })
        }
        Ok(output) => Ok(GitBranchPullRequestResult {
            support: classify_support_error(&output.stderr),
            branch: Some(branch),
            upstream: status.upstream,
            suggested_base_ref,
            pull_request: None,
        }),
        Err(LifecycleError::GitOperationFailed { reason, .. })
            if reason.to_lowercase().contains("no such file")
                || reason.to_lowercase().contains("not found") =>
        {
            Ok(GitBranchPullRequestResult {
                support: support_unavailable(
                    Some("github"),
                    "provider_unavailable",
                    "GitHub CLI is required for local pull request actions.",
                ),
                branch: Some(branch),
                upstream: status.upstream,
                suggested_base_ref,
                pull_request: None,
            })
        }
        Err(error) => Err(error),
    }
}

pub async fn get_pull_request_detail(
    repo_path: &str,
    pull_request_number: u64,
) -> Result<GitPullRequestDetailResult, LifecycleError> {
    let pull_request_number_string = pull_request_number.to_string();
    let output = gh_command(
        repo_path,
        "read GitHub pull request",
        &[
            "pr",
            "view",
            pull_request_number_string.as_str(),
            "--json",
            PULL_REQUEST_DETAIL_JSON_FIELDS,
        ],
    )
    .await;

    match output {
        Ok(output) if output.status.success() => {
            let pull_request = serde_json::from_slice::<GitHubPullRequest>(&output.stdout)
                .map_err(|error| LifecycleError::GitOperationFailed {
                    operation: "read GitHub pull request".to_string(),
                    reason: format!("failed to parse GitHub response: {error}"),
                })?;

            Ok(GitPullRequestDetailResult {
                support: support_available(),
                pull_request: Some(normalize_pull_request(pull_request)),
            })
        }
        Ok(output) if is_pull_request_not_found(&output.stderr) => Ok(GitPullRequestDetailResult {
            support: support_available(),
            pull_request: None,
        }),
        Ok(output) => Ok(GitPullRequestDetailResult {
            support: classify_support_error(&output.stderr),
            pull_request: None,
        }),
        Err(LifecycleError::GitOperationFailed { reason, .. })
            if reason.to_lowercase().contains("no such file")
                || reason.to_lowercase().contains("not found") =>
        {
            Ok(GitPullRequestDetailResult {
                support: support_unavailable(
                    Some("github"),
                    "provider_unavailable",
                    "GitHub CLI is required for local pull request actions.",
                ),
                pull_request: None,
            })
        }
        Err(error) => Err(error),
    }
}

pub async fn get_pull_request_patch(
    repo_path: &str,
    pull_request_number: u64,
) -> Result<String, LifecycleError> {
    let args = build_pull_request_diff_args(pull_request_number);
    let arg_refs = args.iter().map(String::as_str).collect::<Vec<_>>();
    let output = gh_command(
        repo_path,
        "read GitHub pull request diff patch",
        &arg_refs,
    )
    .await?;

    if !output.status.success() {
        return Err(github_failure(
            "read GitHub pull request diff patch",
            &output.stderr,
        ));
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

pub async fn create_pull_request(repo_path: &str) -> Result<GitPullRequestSummary, LifecycleError> {
    let git_status = status::get_git_status(repo_path).await?;
    let branch = git_status
        .branch
        .ok_or_else(|| LifecycleError::GitOperationFailed {
            operation: "create GitHub pull request".to_string(),
            reason: "unable to resolve current branch".to_string(),
        })?;
    let suggested_base_ref = status::get_git_base_ref(repo_path).await?;

    let mut owned_args = vec![
        "pr".to_string(),
        "create".to_string(),
        "--head".to_string(),
        branch.clone(),
        "--fill".to_string(),
    ];
    if let Some(base_ref) = suggested_base_ref {
        owned_args.push("--base".to_string());
        owned_args.push(base_ref);
    }
    let args = owned_args.iter().map(String::as_str).collect::<Vec<_>>();
    gh_success(repo_path, "create GitHub pull request", &args).await?;

    let pull_request = load_pull_requests(repo_path, &["--head", branch.as_str()]).await?;
    let pull_request_number = pull_request
        .into_iter()
        .next()
        .map(|result| result.number)
        .ok_or_else(|| LifecycleError::GitOperationFailed {
            operation: "create GitHub pull request".to_string(),
            reason: "GitHub created no pull request for the current branch".to_string(),
        })?;

    load_pull_request_detail(
        repo_path,
        pull_request_number,
        "read created GitHub pull request",
    )
    .await
}

pub async fn merge_pull_request(
    repo_path: &str,
    pull_request_number: u64,
) -> Result<GitPullRequestSummary, LifecycleError> {
    let pull_request_number_string = pull_request_number.to_string();
    gh_success(
        repo_path,
        "merge GitHub pull request",
        &[
            "pr",
            "merge",
            pull_request_number_string.as_str(),
            "--merge",
            "--delete-branch=false",
        ],
    )
    .await?;

    load_pull_request_detail(
        repo_path,
        pull_request_number,
        "read merged GitHub pull request",
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_payload_requests_status_check_rollups() {
        assert!(PULL_REQUEST_LIST_JSON_FIELDS.contains("statusCheckRollup"));
        assert!(PULL_REQUEST_DETAIL_JSON_FIELDS.contains("statusCheckRollup"));
    }

    #[test]
    fn pull_request_diff_payload_requests_patch_without_color() {
        let args = build_pull_request_diff_args(42);

        assert_eq!(
            args,
            vec!["pr", "diff", "42", "--patch", "--color", "never"]
        );
    }

    #[test]
    fn normalize_pull_request_maps_github_values_into_contract_values() {
        let pull_request = normalize_pull_request(GitHubPullRequest {
            number: 42,
            title: "feat: add pull request rail".to_string(),
            url: "https://github.com/example/repo/pull/42".to_string(),
            state: "OPEN".to_string(),
            is_draft: false,
            author: Some(GitHubPullRequestAuthor {
                login: "kyle".to_string(),
            }),
            head_ref_name: "feature/git-pr".to_string(),
            base_ref_name: "main".to_string(),
            created_at: "2026-03-09T10:00:00Z".to_string(),
            updated_at: "2026-03-09T11:00:00Z".to_string(),
            mergeable: "MERGEABLE".to_string(),
            merge_state_status: Some("CLEAN".to_string()),
            review_decision: Some("APPROVED".to_string()),
            status_check_rollup: Some(vec![GitHubStatusCheckRollupItem {
                conclusion: Some("SUCCESS".to_string()),
                context: None,
                details_url: Some("https://github.com/example/repo/actions/runs/42".to_string()),
                name: Some("build".to_string()),
                state: None,
                status: Some("COMPLETED".to_string()),
                target_url: None,
                workflow_name: Some("CI".to_string()),
            }]),
        });

        assert_eq!(pull_request.state, "open");
        assert_eq!(pull_request.mergeable, "mergeable");
        assert_eq!(pull_request.review_decision.as_deref(), Some("approved"));
        assert_eq!(pull_request.author, "kyle");
        assert_eq!(
            pull_request
                .checks
                .as_ref()
                .and_then(|checks| checks.first())
                .map(|check| check.status.as_str()),
            Some("success")
        );
    }

    #[test]
    fn classify_support_error_detects_authentication_and_remote_failures() {
        let auth = classify_support_error(b"not logged into any GitHub hosts");
        assert_eq!(auth.reason.as_deref(), Some("authentication_required"));
        assert_eq!(auth.provider.as_deref(), Some("github"));

        let remote = classify_support_error(
            b"none of the git remotes configured for this repository point to a known GitHub host",
        );
        assert_eq!(remote.reason.as_deref(), Some("unsupported_remote"));
        assert_eq!(remote.provider, None);
    }

    #[test]
    fn pull_request_not_found_detection_matches_graphql_and_cli_errors() {
        assert!(is_pull_request_not_found(
            b"GraphQL: Could not resolve to a PullRequest with the number of 135. (repository.pullRequest)",
        ));
        assert!(is_pull_request_not_found(
            b"no pull requests found for branch \"feature/checks\""
        ));
        assert!(!is_pull_request_not_found(b"authentication failed"));
    }
}
