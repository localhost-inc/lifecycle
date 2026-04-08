import SwiftUI

struct WorkspaceHeaderView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        if let repository = model.selectedRepository {
          Label(repository.name, systemImage: "folder")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(theme.mutedColor)
        }

        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(theme.mutedColor.opacity(0.8))

        Label(workspace.name, systemImage: workspace.ref == nil ? "folder.badge.gearshape" : "point.topleft.down.curvedto.point.bottomright.up")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
      }
      .contentShape(Rectangle())
      .onTapGesture(count: 2) {
        NSApp.mainWindow?.zoom(nil)
      }

      Spacer()
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
          NSApp.mainWindow?.zoom(nil)
        }

      WorkspaceHeaderActionRow(model: model, workspace: workspace)
    }
    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
  }
}

// MARK: - Action Row

private struct WorkspaceHeaderActionRow: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary
  @State private var isViewSettingsPresented = false

  var body: some View {
    HStack(spacing: 2) {
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

private struct WorkspaceHeaderButton: View {
  @Environment(\.appTheme) private var theme
  let icon: String
  var isActive: Bool = false
  let action: () -> Void
  @State private var isHovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: icon)
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(isActive ? theme.accentColor : theme.mutedColor)
        .frame(width: 28, height: 28)
        .background(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(isHovering || isActive ? theme.mutedColor.opacity(0.12) : .clear)
        )
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      isHovering = hovering
    }
  }
}

// MARK: - View Settings Popover

private struct WorkspaceViewSettingsPopover: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  private var isSpatial: Bool {
    if case .spatial = model.canvasState(for: workspace.id)?.layout {
      return true
    }
    return false
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("View")
        .font(.system(size: 11, weight: .semibold))
        .foregroundStyle(theme.mutedColor)

      WorkspaceViewSettingsLayoutPicker(isSpatial: isSpatial)
    }
    .padding(12)
    .frame(width: 200)
  }
}

// MARK: - Layout Picker

private struct WorkspaceViewSettingsLayoutPicker: View {
  @Environment(\.appTheme) private var theme
  let isSpatial: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Layout")
        .font(.system(size: 11, weight: .medium))
        .foregroundStyle(theme.primaryTextColor)

      HStack(spacing: 4) {
        layoutOption(label: "Tiled", icon: "rectangle.split.2x1", isSelected: !isSpatial, isEnabled: true)
        layoutOption(label: "Spatial", icon: "rectangle.on.rectangle", isSelected: isSpatial, isEnabled: false)
      }
    }
  }

  @ViewBuilder
  private func layoutOption(label: String, icon: String, isSelected: Bool, isEnabled: Bool) -> some View {
    let foreground = isSelected
      ? theme.primaryTextColor
      : (isEnabled ? theme.mutedColor : theme.mutedColor.opacity(0.5))

    HStack(spacing: 5) {
      Image(systemName: icon)
        .font(.system(size: 10, weight: .medium))
      Text(label)
        .font(.system(size: 11, weight: isSelected ? .semibold : .medium))
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
    .help(isEnabled ? "" : "Spatial canvas is not implemented yet")
  }
}
