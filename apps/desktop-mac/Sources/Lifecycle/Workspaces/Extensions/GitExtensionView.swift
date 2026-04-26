import SwiftUI

struct GitExtensionView: View {
  @Environment(\.appTheme) private var theme
  let context: WorkspaceExtensionContext

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        header

        if let snapshot = context.gitSnapshot {
          currentBranchSection(snapshot)
          changesSection(snapshot.status.files)
          currentPullRequestSection(snapshot.currentBranch)
          openPullRequestsSection(snapshot.pullRequests)
          recentCommitsSection(snapshot.commits)
        } else {
          WorkspaceExtensionEmptyStateView(
            symbolName: "arrow.triangle.branch",
            title: context.isGitLoading ? "Loading git" : "Git not loaded",
            description: context.isGitLoading
              ? "Waiting for the bridge to return workspace git state."
              : "Refresh this workspace to read branch, file, and pull request state."
          )
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 12)
    }
    .scrollIndicators(.automatic)
  }

  private var header: some View {
    HStack(spacing: 8) {
      Text("Workspace Git")
        .font(.lc(size: 12, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)

      Spacer(minLength: 0)

      LCButton(
        variant: .surface,
        size: .small,
        layout: .icon,
        isEnabled: !context.isGitLoading,
        action: {
          context.model.refreshGit(for: context.workspace.id)
        }
      ) {
        Image(systemName: context.isGitLoading ? "arrow.triangle.2.circlepath" : "arrow.clockwise")
          .font(.lc(size: 10, weight: .semibold))
      }
      .help("Refresh Git")
    }
  }

  private func currentBranchSection(_ snapshot: BridgeWorkspaceGitResponse) -> some View {
    gitSection("Branch") {
      gitKeyValueRow("Branch", value: snapshot.status.branch ?? "detached", color: theme.accentColor)

      if let upstream = snapshot.status.upstream {
        gitKeyValueRow("Upstream", value: upstream)
      }

      if let headSha = snapshot.status.headSha {
        gitKeyValueRow("HEAD", value: String(headSha.prefix(12)), monospace: true)
      }

      gitKeyValueRow(
        "Sync",
        value: gitExtensionSyncLabel(ahead: snapshot.status.ahead, behind: snapshot.status.behind),
        color: syncColor(ahead: snapshot.status.ahead, behind: snapshot.status.behind)
      )
    }
  }

  @ViewBuilder
  private func changesSection(_ files: [BridgeGitFileStatus]) -> some View {
    gitSection("Changes \(files.count)") {
      if files.isEmpty {
        Text("Clean working tree")
          .font(.lc(size: 11, weight: .medium))
          .foregroundStyle(theme.mutedColor)
          .padding(.vertical, 2)
      } else {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(files.prefix(30)) { file in
            gitFileRow(file)
          }

          if files.count > 30 {
            Text("+ \(files.count - 30) more")
              .font(.lc(size: 10, weight: .semibold, design: .monospaced))
              .foregroundStyle(theme.mutedColor)
              .padding(.top, 5)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func currentPullRequestSection(_ result: BridgeGitBranchPullRequestResult) -> some View {
    if let pullRequest = result.pullRequest {
      gitSection("Current PR") {
        pullRequestRow(pullRequest)
      }
    } else if !result.support.available, let message = result.support.message {
      gitSection("Pull Requests") {
        Text(gitExtensionSupportMessage(reason: result.support.reason, message: message))
          .font(.lc(size: 11, weight: .medium))
          .foregroundStyle(theme.mutedColor)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }

  @ViewBuilder
  private func openPullRequestsSection(_ result: BridgeGitPullRequestListResult) -> some View {
    if result.support.available, !result.pullRequests.isEmpty {
      gitSection("Open PRs") {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(result.pullRequests.prefix(5)) { pullRequest in
            pullRequestRow(pullRequest)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func recentCommitsSection(_ commits: [BridgeGitLogEntry]) -> some View {
    if !commits.isEmpty {
      gitSection("Recent Commits") {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(commits.prefix(8)) { commit in
            commitRow(commit)
          }
        }
      }
    }
  }

  private func gitFileRow(_ file: BridgeGitFileStatus) -> some View {
    HStack(alignment: .center, spacing: 8) {
      Text(gitExtensionFileStatusLabel(file))
        .font(.lc(size: 9, weight: .bold, design: .monospaced))
        .foregroundStyle(statusColor(file))
        .frame(width: 24, alignment: .leading)

      VStack(alignment: .leading, spacing: 2) {
        Text(file.path)
          .font(.lc(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor)
          .lineLimit(1)
          .truncationMode(.middle)

        if let originalPath = file.originalPath, originalPath != file.path {
          Text(originalPath)
            .font(.lc(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
            .lineLimit(1)
            .truncationMode(.middle)
        }
      }

      Spacer(minLength: 0)

      Text(gitExtensionStatsLabel(file.stats))
        .font(.lc(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
        .lineLimit(1)
    }
    .padding(.vertical, 5)
  }

  private func pullRequestRow(_ pullRequest: BridgeGitPullRequestSummary) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 7) {
        Text("#\(pullRequest.number)")
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.accentColor)
          .lineLimit(1)

        Text(pullRequest.title)
          .font(.lc(size: 11, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
          .lineLimit(1)
          .truncationMode(.tail)
      }

      HStack(spacing: 7) {
        gitPill(pullRequest.isDraft ? "draft" : pullRequest.state, color: pullRequestColor(pullRequest))
        gitPill(pullRequest.mergeable, color: mergeableColor(pullRequest.mergeable))

        if let reviewDecision = pullRequest.reviewDecision {
          gitPill(reviewDecision.replacingOccurrences(of: "_", with: " "), color: theme.mutedColor)
        }
      }
    }
    .padding(.vertical, 6)
  }

  private func commitRow(_ commit: BridgeGitLogEntry) -> some View {
    HStack(alignment: .center, spacing: 8) {
      Text(commit.shortSha)
        .font(.lc(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(theme.accentColor)
        .frame(width: 58, alignment: .leading)

      Text(commit.message)
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)
        .truncationMode(.tail)
    }
    .padding(.vertical, 4)
  }

  private func gitSection<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 8) {
        Text(title.uppercased())
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor.opacity(0.76))

        Rectangle()
          .fill(theme.borderColor.opacity(0.72))
          .frame(height: 1)
      }

      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func gitKeyValueRow(
    _ label: String,
    value: String,
    monospace: Bool = false,
    color: Color? = nil
  ) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(label)
        .font(.lc(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
        .frame(width: 62, alignment: .leading)

      Text(value)
        .font(.lc(size: 11, weight: .semibold, design: monospace ? .monospaced : .default))
        .foregroundStyle(color ?? theme.primaryTextColor)
        .lineLimit(1)
        .truncationMode(.middle)
    }
  }

  private func gitPill(_ label: String, color: Color) -> some View {
    Text(label)
      .font(.lc(size: 9, weight: .bold, design: .monospaced))
      .foregroundStyle(color)
      .lineLimit(1)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(color.opacity(0.11))
      .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
  }

  private func syncColor(ahead: Int, behind: Int) -> Color {
    if ahead == 0 && behind == 0 {
      return theme.successColor
    }
    if behind > 0 {
      return theme.warningColor
    }
    return theme.accentColor
  }

  private func statusColor(_ file: BridgeGitFileStatus) -> Color {
    if file.indexStatus == "deleted" || file.worktreeStatus == "deleted" {
      return theme.errorColor
    }
    if file.indexStatus == "added" || file.worktreeStatus == "untracked" {
      return theme.successColor
    }
    return theme.warningColor
  }

  private func pullRequestColor(_ pullRequest: BridgeGitPullRequestSummary) -> Color {
    if pullRequest.isDraft {
      return theme.mutedColor
    }
    switch pullRequest.state {
    case "open":
      return theme.successColor
    case "merged":
      return theme.accentColor
    default:
      return theme.mutedColor
    }
  }

  private func mergeableColor(_ mergeable: String) -> Color {
    switch mergeable {
    case "mergeable":
      return theme.successColor
    case "conflicting":
      return theme.errorColor
    default:
      return theme.mutedColor
    }
  }
}

func gitExtensionFileStatusLabel(_ file: BridgeGitFileStatus) -> String {
  let index = gitExtensionStatusCode(file.indexStatus)
  let worktree = gitExtensionStatusCode(file.worktreeStatus)
  let label = "\(index)\(worktree)"
  return label.trimmingCharacters(in: .whitespaces).isEmpty ? "--" : label
}

func gitExtensionStatusCode(_ status: String?) -> String {
  switch status {
  case "modified":
    return "M"
  case "added":
    return "A"
  case "deleted":
    return "D"
  case "renamed":
    return "R"
  case "copied":
    return "C"
  case "unmerged":
    return "U"
  case "untracked":
    return "?"
  case "ignored":
    return "!"
  case "type_changed":
    return "T"
  default:
    return " "
  }
}

func gitExtensionStatsLabel(_ stats: BridgeGitFileStats) -> String {
  let insertions = stats.insertions ?? 0
  let deletions = stats.deletions ?? 0

  if insertions == 0 && deletions == 0 {
    return ""
  }

  if insertions > 0 && deletions > 0 {
    return "+\(insertions) -\(deletions)"
  }

  if insertions > 0 {
    return "+\(insertions)"
  }

  return "-\(deletions)"
}

func gitExtensionSupportMessage(reason: String?, message: String) -> String {
  switch reason {
  case "authentication_required":
    return "GitHub authentication is required."
  case "unsupported_remote":
    return "Pull requests are unavailable for this remote."
  case "repository_unavailable":
    return "Repository metadata is unavailable."
  case "mode_not_supported":
    return "Pull requests are unavailable for this workspace host."
  default:
    return message
  }
}
