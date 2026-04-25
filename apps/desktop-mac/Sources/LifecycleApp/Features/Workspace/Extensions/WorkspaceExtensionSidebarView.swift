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

  @State private var collapsedExtensionKinds = Set<WorkspaceExtensionKind>()

  var body: some View {
    Group {
      if let state = model.extensionSidebarState(for: workspace.id) {
        extensionPanelStack(state: state)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .clipShape(Rectangle())
        .onChange(of: state.visibleExtensions.map(\.kind)) { visibleKinds in
          collapsedExtensionKinds = collapsedExtensionKinds.intersection(Set(visibleKinds))
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
    let isCollapsed = collapsedExtensionKinds.contains(workspaceExtension.kind)

    VStack(alignment: .leading, spacing: 0) {
      Button {
        toggleExtensionPanel(workspaceExtension.kind)
      } label: {
        HStack(spacing: 8) {
          Image(systemName: workspaceExtension.tab.icon)
            .font(.lc(size: 12, weight: .semibold))
            .frame(width: 14, height: 14)

          VStack(alignment: .leading, spacing: 1) {
            Text(workspaceExtension.tab.title)
              .font(.lc(size: 12, weight: .semibold))
              .lineLimit(1)

            if let subtitle = workspaceExtension.tab.subtitle, !subtitle.isEmpty {
              Text(subtitle)
                .font(.lc(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.mutedColor)
                .lineLimit(1)
            }
          }

          Spacer(minLength: 0)

          Image(systemName: "chevron.down")
            .font(.lc(size: 10, weight: .bold))
            .foregroundStyle(theme.mutedColor)
            .rotationEffect(.degrees(isCollapsed ? -90 : 0))
        }
        .foregroundStyle(theme.primaryTextColor)
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()

      Rectangle()
        .fill(theme.borderColor)
        .frame(height: 1)

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
    .shadow(
      color: theme.cardShadowColor,
      radius: resizeContext.isResizing ? 0 : 6,
      x: 0,
      y: resizeContext.isResizing ? 0 : 3
    )
  }

  private func toggleExtensionPanel(_ kind: WorkspaceExtensionKind) {
    model.selectExtension(kind, workspaceID: workspace.id)
    if collapsedExtensionKinds.contains(kind) {
      collapsedExtensionKinds.remove(kind)
    } else {
      collapsedExtensionKinds.insert(kind)
    }
  }
}
