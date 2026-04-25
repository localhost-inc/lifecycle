import SwiftUI
import LifecyclePresentation

struct DebugExtensionView: View {
  @Environment(\.appTheme) private var theme
  let context: WorkspaceExtensionContext

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        identitySection
        resolutionSection
        issuesSection
        terminalsSection
        canvasSection
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
    }
    .scrollIndicators(.automatic)
  }

  // MARK: - Identity

  /// Compact top-line: who is this workspace, what host, what status.
  @ViewBuilder
  private var identitySection: some View {
    debugSection("Identity") {
      debugInlineRow("Name", text: context.workspace.name)
      debugInlineRow("Host") {
        debugValue(context.workspace.host, color: accentForHost(context.workspace.host))
      }
      debugInlineRow("Status") {
        debugValue(context.workspace.status, color: accentForStatus(context.workspace.status))
      }
      debugInlineRow("ID", mono: context.workspace.id)
    }
  }

  // MARK: - Resolution

  /// The inference chain: host → binding → scope → runtime.
  /// Shows what the bridge resolved and what decisions were driven by host type.
  @ViewBuilder
  private var resolutionSection: some View {
    debugSection("Resolution") {
      // Scope: how did host resolve to a working directory?
      if let scope = context.scope {
        debugInlineRow("Binding") {
          debugValue(scope.binding, color: theme.accentColor)
        }
        if let cwd = scope.cwd {
          debugInlineRow("CWD", mono: cwd)
        }
        if let ref = context.workspace.ref {
          debugInlineRow("Ref", mono: ref)
        }
        if let note = scope.resolutionNote {
          debugInlineRow("Note") {
            Text(note)
              .font(.lc(size: 10, weight: .medium))
              .foregroundStyle(debugSecondaryTextColor)
              .lineLimit(2)
          }
        }
      }

      // Runtime: what backend did host resolve to?
      if let runtime = context.runtime {
        debugInlineRow("Backend") {
          debugValue(runtime.backendLabel, color: theme.accentColor)
        }
        debugInlineRow("Persistent") {
          debugValue(
            runtime.persistent ? "yes" : "no",
            color: runtime.persistent ? theme.successColor : debugSecondaryTextColor
          )
        }

        let caps = runtimeCapabilities(runtime)
        if !caps.isEmpty {
          debugInlineRow("Caps") {
            debugValue(caps.joined(separator: "  "), color: theme.primaryTextColor.opacity(0.78))
          }
        }
      }
    }
  }

  // MARK: - Issues

  /// Only rendered when something is wrong. Errors, launch failures, resolution problems.
  @ViewBuilder
  private var issuesSection: some View {
    let issues = collectIssues()

    if !issues.isEmpty {
      debugSection("Issues") {
        ForEach(Array(issues.enumerated()), id: \.offset) { _, issue in
          HStack(alignment: .top, spacing: 8) {
            Circle()
              .fill(issue.isError ? theme.errorColor : theme.warningColor)
              .frame(width: 6, height: 6)
              .padding(.top, 4)

            VStack(alignment: .leading, spacing: 2) {
              Text(issue.label)
                .font(.lc(size: 10, weight: .semibold))
                .foregroundStyle(issue.isError ? theme.errorColor : theme.warningColor)
              Text(issue.message)
                .font(.lc(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.primaryTextColor.opacity(0.85))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(.vertical, 3)
        }
      }
    }
  }

  // MARK: - Terminals

  @ViewBuilder
  private var terminalsSection: some View {
    if !context.terminals.isEmpty {
      debugSection("Terminals (\(context.terminals.count))") {
        ForEach(context.terminals) { terminal in
          HStack(spacing: 8) {
            Circle()
              .fill(terminal.busy ? theme.successColor : theme.mutedColor.opacity(0.4))
              .frame(width: 5, height: 5)

            Text(terminal.title)
              .font(.lc(size: 11, weight: .medium))
              .foregroundStyle(theme.primaryTextColor)
              .lineLimit(1)

            Text(terminal.kind)
              .font(.lc(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(debugSecondaryTextColor)
              .lineLimit(1)

            Spacer(minLength: 0)

            Text(debugTerminalActivityLabel(for: terminal))
              .font(.lc(size: 10, weight: .semibold, design: .monospaced))
              .foregroundStyle(terminal.busy ? theme.successColor : debugSecondaryTextColor)
          }
          .padding(.vertical, 1)
        }
      }
    }
  }

  // MARK: - Canvas

  @ViewBuilder
  private var canvasSection: some View {
    if let canvas = context.model.canvasState(for: context.workspace.id) {
      debugSection("Canvas") {
        debugInlineRow("Layout") {
          debugValue(canvasLayoutLabel(canvas.layout), color: theme.accentColor)
        }
        debugInlineRow("Groups", text: "\(canvas.groupsByID.count)")
        debugInlineRow("Surfaces", text: "\(canvas.surfacesByID.count)")
      }
    }
  }

  // MARK: - Section Container

  private func debugSection<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 5) {
      HStack(spacing: 8) {
        Text(title.uppercased())
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(debugSectionTitleColor)

        Rectangle()
          .fill(theme.borderColor.opacity(0.85))
          .frame(height: 1)
      }

      VStack(alignment: .leading, spacing: 2) {
        content()
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Row Helpers

  private func debugInlineRow(_ label: String, text value: String) -> some View {
    debugInlineRow(label) {
      Text(value)
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(debugPrimaryTextColor)
        .textSelection(.enabled)
        .lineLimit(1)
    }
  }

  private func debugInlineRow(_ label: String, mono value: String) -> some View {
    debugInlineRow(label) {
      Text(value)
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(debugPrimaryTextColor)
        .textSelection(.enabled)
        .lineLimit(1)
    }
  }

  private func debugInlineRow<Content: View>(
    _ label: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Text(label)
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(debugLabelColor)
        .frame(minWidth: 62, alignment: .leading)

      content()

      Spacer(minLength: 0)
    }
    .padding(.vertical, 1)
  }

  private func debugValue(_ value: String, color: Color? = nil) -> some View {
    Text(value)
      .font(.lc(size: 11, weight: .semibold, design: .monospaced))
      .foregroundStyle(color ?? debugPrimaryTextColor)
      .textSelection(.enabled)
      .lineLimit(1)
  }

  private var debugSectionTitleColor: Color {
    theme.primaryTextColor.opacity(0.9)
  }

  private var debugPrimaryTextColor: Color {
    theme.primaryTextColor.opacity(0.96)
  }

  private var debugSecondaryTextColor: Color {
    theme.primaryTextColor.opacity(0.78)
  }

  private var debugLabelColor: Color {
    theme.primaryTextColor.opacity(0.7)
  }

  // MARK: - Issues Collection

  private struct DebugIssue {
    let label: String
    let message: String
    let isError: Bool
  }

  private func collectIssues() -> [DebugIssue] {
    var issues: [DebugIssue] = []

    if let error = context.scope?.resolutionError {
      issues.append(DebugIssue(label: "Resolution", message: error, isError: true))
    }

    if let error = context.runtime?.launchError {
      issues.append(DebugIssue(label: "Launch", message: error, isError: true))
    }

    if context.runtime == nil && context.scope == nil {
      issues.append(DebugIssue(
        label: "Unresolved",
        message: "Terminal runtime has not been resolved yet.",
        isError: false
      ))
    }

    return issues
  }

  // MARK: - Helpers

  private func runtimeCapabilities(_ runtime: BridgeTerminalRuntime) -> [String] {
    var caps: [String] = []
    if runtime.supportsCreate { caps.append("create") }
    if runtime.supportsClose { caps.append("close") }
    if runtime.supportsConnect { caps.append("connect") }
    if runtime.supportsRename { caps.append("rename") }
    return caps
  }

  private func canvasLayoutLabel(_ layout: CanvasLayout) -> String {
    switch layout {
    case .tiled: return "tiled"
    case .spatial: return "spatial"
    }
  }

  private func accentForHost(_ host: String) -> Color {
    switch host {
    case "cloud": return theme.accentColor
    case "ssh": return theme.warningColor
    case "local": return theme.successColor
    default: return theme.mutedColor
    }
  }

  private func accentForStatus(_ status: String) -> Color {
    switch status.lowercased() {
    case "active", "running", "ready":
      return theme.successColor
    case "sleeping", "provisioning", "starting", "stopping", "waking":
      return theme.warningColor
    case "failed", "error", "destroyed", "stopped":
      return theme.errorColor
    default:
      return theme.mutedColor
    }
  }

  private func agentColor(_ status: String) -> Color {
    switch status.lowercased() {
    case "active", "running":
      return theme.successColor
    case "pending", "starting":
      return theme.warningColor
    case "completed", "done":
      return theme.accentColor
    case "failed", "error":
      return theme.errorColor
    default:
      return theme.mutedColor
    }
  }

  private func debugTerminalActivityLabel(for terminal: BridgeTerminalRecord) -> String {
    guard let activity = terminal.activity else {
      return terminal.busy ? "busy" : "idle"
    }

    if activity.state == "tool_active", let toolName = activity.toolName {
      return "\(activity.state):\(toolName)"
    }
    if activity.state == "waiting", let waitingKind = activity.waitingKind {
      return "\(activity.state):\(waitingKind)"
    }
    return activity.state
  }

  private func relativeTimestamp(_ isoString: String) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

    guard let date = formatter.date(from: isoString)
            ?? ISO8601DateFormatter().date(from: isoString)
    else {
      return isoString
    }

    return relativeLabel(Date().timeIntervalSince(date))
  }

  private func relativeLabel(_ elapsed: TimeInterval) -> String {
    if elapsed < 60 { return "just now" }
    if elapsed < 3600 { return "\(Int(elapsed / 60))m ago" }
    if elapsed < 86400 { return "\(Int(elapsed / 3600))h ago" }
    return "\(Int(elapsed / 86400))d ago"
  }
}
