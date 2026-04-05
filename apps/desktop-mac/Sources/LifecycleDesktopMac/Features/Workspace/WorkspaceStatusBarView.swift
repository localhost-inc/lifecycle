import Foundation
import SwiftUI

enum WorkspaceStatusBarLayoutMode: String {
  case tiled = "Tiled"
  case spatial = "Spatial"
}

func shortDisplayHostName(_ hostName: String) -> String {
  let trimmed = hostName.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmed.isEmpty else {
    return "host"
  }

  return trimmed.split(separator: ".", maxSplits: 1).first.map(String.init) ?? trimmed
}

func workspaceShellIdentityLabel(
  hostKind: String,
  localUserName: String = NSUserName(),
  localHostName: String = ProcessInfo.processInfo.hostName,
) -> String {
  if hostKind == "local" {
    let user = localUserName.trimmingCharacters(in: .whitespacesAndNewlines)
    let host = shortDisplayHostName(localHostName)

    if !user.isEmpty {
      return "\(user)@\(host)"
    }

    return host
  }

  let trimmedHostKind = hostKind.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmedHostKind.isEmpty else {
    return "shell"
  }

  return "\(trimmedHostKind) shell"
}

func workspaceStatusBarLayoutMode(for layout: CanvasLayout?) -> WorkspaceStatusBarLayoutMode {
  switch layout {
  case .some(.spatial):
    return .spatial
  case .some(.tiled), .none:
    return .tiled
  }
}

struct WorkspaceStatusBarView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    HStack(spacing: 8) {
      statusText(identityLabel, color: theme.primaryTextColor.opacity(0.9))

      if isResolvingTerminals {
        divider

        HStack(spacing: 5) {
          ProgressView()
            .controlSize(.small)
            .scaleEffect(0.65)
            .tint(theme.mutedColor)
          statusText("Resolving shell", color: theme.mutedColor)
        }
      }

      Spacer(minLength: 8)

      WorkspaceStatusBarLayoutPicker(mode: layoutMode)

      divider

      statusText(scope?.host ?? workspace.host, color: accentForHost(scope?.host ?? workspace.host) ?? theme.mutedColor)

      if let statusLabel {
        divider
        statusText(statusLabel, color: accentForWorkspaceStatus(statusLabel) ?? theme.mutedColor)
      }

      if isBusy {
        divider
        statusText("busy", color: theme.successColor)
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 3)
    .frame(minHeight: 18)
    .background(theme.surfaceBackground)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(theme.borderColor)
        .frame(height: 1)
    }
  }

  private var divider: some View {
    Rectangle()
      .fill(theme.borderColor.opacity(0.9))
      .frame(width: 1, height: 8)
  }

  private func statusText(_ value: String, color: Color) -> some View {
    Text(value)
      .font(.system(size: 9, weight: .medium, design: .monospaced))
      .foregroundStyle(color)
  }

  private var terminalEnvelope: BridgeWorkspaceTerminalsEnvelope? {
    model.terminalEnvelope(for: workspace.id)
  }

  private var scope: BridgeWorkspaceScope? {
    terminalEnvelope?.workspace
  }

  private var identityLabel: String {
    workspaceShellIdentityLabel(hostKind: scope?.host ?? workspace.host)
  }

  private var layoutMode: WorkspaceStatusBarLayoutMode {
    workspaceStatusBarLayoutMode(for: model.canvasState(for: workspace.id)?.layout)
  }

  private var statusLabel: String? {
    let candidate = scope?.status ?? workspace.status
    let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private var isBusy: Bool {
    model.activityByWorkspaceID[workspace.id]?.busy == true
  }

  private var isResolvingTerminals: Bool {
    model.terminalLoadingWorkspaceIDs.contains(workspace.id) && terminalEnvelope == nil
  }

  private func accentForHost(_ host: String) -> Color? {
    switch host {
    case "cloud":
      return theme.accentColor
    case "ssh":
      return theme.warningColor
    default:
      return nil
    }
  }

  private func accentForWorkspaceStatus(_ status: String) -> Color? {
    switch status.lowercased() {
    case "active", "running", "ready":
      return theme.successColor
    case "sleeping", "provisioning", "starting", "stopping", "waking":
      return theme.warningColor
    case "failed", "error", "destroyed", "stopped":
      return theme.errorColor
    default:
      return nil
    }
  }
}

private struct WorkspaceStatusBarLayoutPicker: View {
  @Environment(\.appTheme) private var theme
  let mode: WorkspaceStatusBarLayoutMode

  var body: some View {
    HStack(spacing: 4) {
      layoutSegment(.tiled, isEnabled: true)
      Text("/")
        .font(.system(size: 9, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.borderColor.opacity(0.95))
      layoutSegment(.spatial, isEnabled: false)
    }
  }

  @ViewBuilder
  private func layoutSegment(
    _ candidate: WorkspaceStatusBarLayoutMode,
    isEnabled: Bool,
  ) -> some View {
    let isSelected = candidate == mode

    Text(candidate.rawValue)
      .font(.system(size: 9, weight: isSelected ? .semibold : .medium, design: .monospaced))
      .foregroundStyle(
        isSelected ? theme.primaryTextColor.opacity(0.95) : theme.mutedColor.opacity(isEnabled ? 1 : 0.72)
      )
      .modifier(
        WorkspaceStatusBarSegmentHelpModifier(
          helpText: isEnabled ? nil : "Spatial canvas mode is not implemented yet."
        )
      )
  }
}

private struct WorkspaceStatusBarSegmentHelpModifier: ViewModifier {
  let helpText: String?

  func body(content: Content) -> some View {
    if let helpText {
      content.help(helpText)
    } else {
      content
    }
  }
}
