import SwiftUI

struct WorkspaceExtensionSidebarResizeContext: Equatable {
  var isResizing = false
}

private struct WorkspaceExtensionSidebarResizeContextKey: EnvironmentKey {
  static let defaultValue = WorkspaceExtensionSidebarResizeContext()
}

extension EnvironmentValues {
  var workspaceExtensionSidebarResizeContext: WorkspaceExtensionSidebarResizeContext {
    get { self[WorkspaceExtensionSidebarResizeContextKey.self] }
    set { self[WorkspaceExtensionSidebarResizeContextKey.self] = newValue }
  }
}

struct WorkspaceExtensionSidebarView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.workspaceExtensionSidebarResizeContext) private var resizeContext
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    Group {
      if let state = model.extensionSidebarState(for: workspace.id) {
        extensionPanelStack(state: state)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .clipShape(Rectangle())
        .onChange(of: state.visibleExtensions.map(\.kind)) { visibleKinds in
          model.setCollapsedExtensionKinds(
            model.collapsedExtensionKinds(for: workspace.id).intersection(Set(visibleKinds)),
            workspaceID: workspace.id
          )
        }
      } else {
        VStack(spacing: 12) {
          Text("Extensions")
            .font(.lc(size: 18, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
          Text("No workspace extensions are available for this workspace.")
            .font(.lc(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
            .multilineTextAlignment(.center)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .clipped()
    .transaction { transaction in
      if resizeContext.isResizing {
        transaction.animation = nil
      }
    }
  }

  @ViewBuilder
  private func extensionPanelStack(state: WorkspaceExtensionSidebarState) -> some View {
    let collapsedExtensionKinds = model.collapsedExtensionKinds(for: workspace.id)

    VStack(alignment: .leading, spacing: 6) {
      ForEach(state.visibleExtensions) { workspaceExtension in
        let isCollapsed = collapsedExtensionKinds.contains(workspaceExtension.kind)

        extensionPanel(workspaceExtension)
          .frame(maxHeight: isCollapsed ? nil : .infinity, alignment: .topLeading)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .animation(
      resizeContext.isResizing ? nil : .spring(response: 0.28, dampingFraction: 0.9),
      value: collapsedExtensionKinds
    )
  }

  @ViewBuilder
  private func extensionPanel(
    _ workspaceExtension: ResolvedWorkspaceExtension
  ) -> some View {
    let isCollapsed = model.collapsedExtensionKinds(for: workspace.id).contains(workspaceExtension.kind)
    let stackActionState = stackHeaderActionState(for: workspaceExtension)

    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 8) {
        Image(systemName: workspaceExtension.tab.icon)
          .font(.lc(size: 12, weight: .semibold))
          .frame(width: 14, height: 14)

        Text(workspaceExtension.tab.title)
          .font(.lc(size: 12, weight: .semibold))
          .lineLimit(1)

        Spacer(minLength: 0)

        if let stackActionState {
          WorkspaceExtensionStackActionChip(state: stackActionState) {
            model.runPrimaryStackAction(workspaceID: workspace.id)
          }
          .help(stackActionState.helpText)
        }
      }
      .foregroundStyle(theme.primaryTextColor)
      .padding(.horizontal, 8)
      .padding(.vertical, 6)
      .frame(maxWidth: .infinity, minHeight: theme.sizing.workspaceTabRailHeight, alignment: .leading)
      .contentShape(Rectangle())
      .onTapGesture {
        toggleExtensionPanel(workspaceExtension.kind)
      }
      .lcPointerCursor()

      if !isCollapsed {
        workspaceExtension.content.body()
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(theme.surfaceBackground)
    .clipShape(RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous))
    .overlay {
      RoundedRectangle(cornerRadius: theme.radius.lg, style: .continuous)
        .strokeBorder(theme.borderColor, lineWidth: 1)
    }
  }

  private func toggleExtensionPanel(_ kind: WorkspaceExtensionKind) {
    model.selectExtension(kind, workspaceID: workspace.id)
    model.toggleExtensionPanelCollapsed(kind, workspaceID: workspace.id)
  }

  private func stackHeaderActionState(
    for workspaceExtension: ResolvedWorkspaceExtension
  ) -> WorkspaceStackHeaderActionState? {
    guard workspaceExtension.kind == .stack else {
      return nil
    }

    return workspaceStackHeaderActionState(
      summary: model.stackSummary(for: workspace.id),
      isMutating: model.isStackActionLoading(for: workspace.id),
      hasStoppingServices: model.hasStoppingServices(for: workspace.id)
    )
  }
}

private struct WorkspaceExtensionStackActionChip: View {
  @Environment(\.appTheme) private var theme

  let state: WorkspaceStackHeaderActionState
  let action: () -> Void

  var body: some View {
    LCButton(variant: .surface, size: .small, isEnabled: state.isEnabled, action: action) {
      HStack(spacing: 5) {
        Image(systemName: state.icon)
          .font(.lc(size: 9, weight: .semibold))
          .foregroundStyle(iconColor)

        Text(state.label)
          .font(.lc(size: 10, weight: .semibold))
          .foregroundStyle(labelColor)
      }
    }
  }

  private var labelColor: Color {
    state.isEnabled ? theme.primaryTextColor : theme.mutedColor
  }

  private var iconColor: Color {
    guard state.isEnabled else {
      return theme.mutedColor
    }

    switch state.kind {
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
