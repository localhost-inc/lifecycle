import SwiftUI
import LifecyclePresentation

enum WorkspaceStackHeaderActionKind: Equatable {
  case start
  case starting
  case stop
  case stopping
}

struct WorkspaceStackHeaderActionState: Equatable {
  let kind: WorkspaceStackHeaderActionKind
  let label: String
  let icon: String
  let isEnabled: Bool
  let helpText: String
}

func workspaceStackHeaderActionState(
  summary: BridgeWorkspaceStackSummary?,
  isMutating: Bool,
  hasStoppingServices: Bool = false
) -> WorkspaceStackHeaderActionState? {
  guard let summary, summary.state == "ready" else {
    return nil
  }

  let serviceNodes = stackExtensionServiceNodes(from: summary)
  guard !serviceNodes.isEmpty else {
    return nil
  }

  let hasReadyServices = serviceNodes.contains { $0.status == "ready" }
  let hasStartingServices = serviceNodes.contains { $0.status == "starting" }

  if hasStoppingServices {
    return WorkspaceStackHeaderActionState(
      kind: .stopping,
      label: "Stopping…",
      icon: "stop.fill",
      isEnabled: false,
      helpText: "Stopping running workspace services."
    )
  }

  if isMutating {
    if hasReadyServices {
      return WorkspaceStackHeaderActionState(
        kind: .stopping,
        label: "Stopping…",
        icon: "stop.fill",
        isEnabled: false,
        helpText: "Stopping running workspace services."
      )
    }

    return WorkspaceStackHeaderActionState(
      kind: .starting,
      label: "Starting…",
      icon: "play.fill",
      isEnabled: false,
      helpText: "Starting configured workspace services."
    )
  }

  if hasReadyServices {
    return WorkspaceStackHeaderActionState(
      kind: .stop,
      label: "Stop Stack",
      icon: "stop.fill",
      isEnabled: true,
      helpText: "Stop running workspace services."
    )
  }

  if hasStartingServices {
    return WorkspaceStackHeaderActionState(
      kind: .starting,
      label: "Starting…",
      icon: "play.fill",
      isEnabled: false,
      helpText: "Workspace services are still starting."
    )
  }

  return WorkspaceStackHeaderActionState(
    kind: .start,
    label: "Start",
    icon: "play.fill",
    isEnabled: true,
    helpText: "Start configured workspace services."
  )
}

struct WorkspaceHeaderView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        if let repository = model.selectedRepository {
          Label(repository.name, systemImage: "folder")
            .font(.lc(size: 13, weight: .medium))
            .foregroundStyle(theme.mutedColor)
        }

        Image(systemName: "chevron.right")
          .font(.lc(size: 10, weight: .semibold))
          .foregroundStyle(theme.mutedColor.opacity(0.8))

        Label(workspace.name, systemImage: workspace.ref == nil ? "folder.badge.gearshape" : "point.topleft.down.curvedto.point.bottomright.up")
          .font(.lc(size: 13, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
      }
      .contentShape(Rectangle())
      .onTapGesture(count: 2) {
        zoomActiveWorkspaceWindow()
      }

      Spacer()
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
          zoomActiveWorkspaceWindow()
        }

      WorkspaceHeaderActionRow(model: model, workspace: workspace)
    }
    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
  }
}

// MARK: - Action Row

private struct WorkspaceHeaderActionRow: View {
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary
  @State private var isViewSettingsPresented = false

  var body: some View {
    HStack(spacing: 6) {
      WorkspaceHeaderButton(icon: "slider.horizontal.3", isActive: isViewSettingsPresented) {
        isViewSettingsPresented.toggle()
      }
      .popover(isPresented: $isViewSettingsPresented, arrowEdge: .bottom) {
        WorkspaceViewSettingsPopover(model: model, workspace: workspace)
      }
    }
  }
}

// MARK: - Header Button

private struct WorkspaceHeaderActionChip: View {
  @Environment(\.appTheme) private var theme
  let icon: String
  let label: String
  let kind: WorkspaceStackHeaderActionKind
  let isEnabled: Bool
  let action: () -> Void

  var body: some View {
    LCButton(variant: .surface, isEnabled: isEnabled, action: action) {
      HStack(spacing: 6) {
        Image(systemName: icon)
          .font(.lc(size: 10, weight: .semibold))
          .foregroundStyle(iconColor)

        Text(label)
          .font(.lc(size: 11, weight: .semibold))
          .foregroundStyle(labelColor)
      }
    }
  }

  private var labelColor: Color {
    isEnabled ? theme.primaryTextColor : theme.mutedColor
  }

  private var iconColor: Color {
    guard isEnabled else {
      return theme.mutedColor
    }

    switch kind {
    case .start:
      return theme.successColor
    case .starting:
      return theme.mutedColor
    case .stop:
      return theme.warningColor
    case .stopping:
      return theme.mutedColor
    }
  }
}

private struct WorkspaceHeaderButton: View {
  @Environment(\.appTheme) private var theme
  let icon: String
  var isActive: Bool = false
  let action: () -> Void

  var body: some View {
    LCButton(variant: .surface, layout: .icon, isActive: isActive, action: action) {
      Image(systemName: icon)
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(isActive ? theme.primaryTextColor : theme.mutedColor)
    }
  }
}

// MARK: - View Settings Popover

private struct WorkspaceViewSettingsPopover: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  private var isSpatial: Bool {
    model.canvasLayoutMode(for: workspace.id) == .spatial
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("View")
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(theme.mutedColor)

      WorkspaceViewSettingsLayoutPicker(
        model: model,
        workspaceID: workspace.id,
        isSpatial: isSpatial
      )
    }
    .padding(12)
    .frame(width: 200)
  }
}

// MARK: - Layout Picker

private struct WorkspaceViewSettingsLayoutPicker: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let isSpatial: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Layout")
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(theme.primaryTextColor)

      HStack(spacing: 4) {
        layoutOption(
          label: "Tiled",
          icon: "rectangle.split.2x1",
          isSelected: !isSpatial,
          mode: .tiled
        )
        layoutOption(
          label: "Spatial",
          icon: "rectangle.on.rectangle",
          isSelected: isSpatial,
          mode: .spatial
        )
      }
    }
  }

  @ViewBuilder
  private func layoutOption(
    label: String,
    icon: String,
    isSelected: Bool,
    mode: CanvasLayoutMode
  ) -> some View {
    let foreground = isSelected
      ? theme.primaryTextColor
      : theme.mutedColor

    Button {
      model.setCanvasLayoutMode(mode, workspaceID: workspaceID)
    } label: {
      HStack(spacing: 5) {
        Image(systemName: icon)
          .font(.lc(size: 10, weight: .medium))
        Text(label)
          .font(.lc(size: 11, weight: isSelected ? .semibold : .medium))
      }
      .foregroundStyle(foreground)
      .padding(.horizontal, 8)
      .padding(.vertical, 5)
      .frame(maxWidth: .infinity)
      .background(
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(isSelected ? theme.mutedColor.opacity(0.15) : .clear)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .strokeBorder(isSelected ? theme.borderColor : .clear)
      )
      .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
    .disabled(isSelected)
    .lcPointerCursor()
  }
}
