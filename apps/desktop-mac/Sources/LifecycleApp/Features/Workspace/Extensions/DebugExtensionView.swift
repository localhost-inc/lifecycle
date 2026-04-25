import SwiftUI
import LifecyclePresentation

struct DebugExtensionView: View {
  @Environment(\.appTheme) private var theme
  let context: WorkspaceExtensionContext

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 4) {
        identitySection
        resolutionSection
        issuesSection
        terminalsSection
        canvasSection
      }
      .padding(8)
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
        LCBadge(label: context.workspace.host, color: accentForHost(context.workspace.host))
      }
      debugInlineRow("Status") {
        LCBadge(label: context.workspace.status, color: accentForStatus(context.workspace.status))
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
          LCBadge(label: scope.binding, color: theme.accentColor)
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
              .foregroundStyle(theme.mutedColor.opacity(0.7))
              .lineLimit(2)
          }
        }
      }

      // Runtime: what backend did host resolve to?
      if let runtime = context.runtime {
        debugInlineRow("Backend") {
          LCBadge(label: runtime.backendLabel, color: theme.accentColor, variant: .outline)
        }
        debugInlineRow("Persistent") {
          LCBadge(
            label: runtime.persistent ? "yes" : "no",
            color: runtime.persistent ? theme.successColor : theme.mutedColor
          )
        }

        let caps = runtimeCapabilities(runtime)
        if !caps.isEmpty {
          debugInlineRow("Caps") {
            HStack(spacing: 4) {
              ForEach(caps, id: \.self) { cap in
                LCBadge(label: cap, variant: .outline)
              }
            }
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
          HStack(spacing: 6) {
            Circle()
              .fill(terminal.busy ? theme.successColor : theme.mutedColor.opacity(0.4))
              .frame(width: 6, height: 6)

            Text(terminal.title)
              .font(.lc(size: 11, weight: .medium))
              .foregroundStyle(theme.primaryTextColor)
              .lineLimit(1)

            LCBadge(label: terminal.kind, variant: .outline)

            Spacer(minLength: 0)

            if terminal.busy {
              LCBadge(label: "busy", color: theme.successColor)
            }
          }
          .padding(.vertical, 3)
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
          LCBadge(label: canvasLayoutLabel(canvas.layout), color: theme.accentColor)
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
    VStack(alignment: .leading, spacing: 0) {
      Text(title.uppercased())
        .font(.lc(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(theme.mutedColor.opacity(0.7))
        .padding(.horizontal, 10)
        .padding(.top, 10)
        .padding(.bottom, 6)

      VStack(alignment: .leading, spacing: 0) {
        content()
      }
      .padding(.horizontal, 10)
      .padding(.bottom, 8)
    }
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(theme.surfaceRaised.opacity(0.5))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.5))
    )
  }

  // MARK: - Row Helpers

  private func debugInlineRow(_ label: String, text value: String) -> some View {
    debugInlineRow(label) {
      Text(value)
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(theme.primaryTextColor)
        .textSelection(.enabled)
        .lineLimit(1)
    }
  }

  private func debugInlineRow(_ label: String, mono value: String) -> some View {
    debugInlineRow(label) {
      Text(value)
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor.opacity(0.85))
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
        .foregroundStyle(theme.mutedColor)
        .frame(minWidth: 70, alignment: .leading)

      content()

      Spacer(minLength: 0)
    }
    .padding(.vertical, 2)
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
