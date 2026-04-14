import SwiftUI

private struct SelectedExtensionTabFramePreferenceKey: PreferenceKey {
  static let defaultValue: CGRect? = nil

  static func reduce(value: inout CGRect?, nextValue: () -> CGRect?) {
    if let nextValue = nextValue() {
      value = nextValue
    }
  }
}

struct WorkspaceExtensionSidebarView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  @State private var selectedTabFrame: CGRect?

  var body: some View {
    Group {
      if let state = model.extensionSidebarState(for: workspace.id) {
        VStack(spacing: 0) {
          VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
              HStack(spacing: 0) {
                ForEach(state.extensions) { workspaceExtension in
                  extensionTab(workspaceExtension, state: state)
                }
              }
            }
            .frame(height: theme.sizing.workspaceTabRailHeight)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.shellBackground)
            .coordinateSpace(name: "workspaceExtensionRail")
          }
          .overlay(alignment: .bottomLeading) {
            railDivider
          }
          .onPreferenceChange(SelectedExtensionTabFramePreferenceKey.self) { selectedTabFrame = $0 }

          state.activeExtension.content.body()
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(
          Rectangle()
            .fill(theme.surfaceBackground)
        )
        .clipShape(Rectangle())
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
        .background(theme.surfaceBackground)
      }
    }
  }

  @ViewBuilder
  private var railDivider: some View {
    GeometryReader { geometry in
      let totalWidth = geometry.size.width

      if let selectedTabFrame {
        let minX = max(0, min(selectedTabFrame.minX, totalWidth))
        let maxX = max(minX, min(selectedTabFrame.maxX, totalWidth))
        let leftWidth = minX
        let rightWidth = max(0, totalWidth - maxX)

        ZStack(alignment: .leading) {
          if leftWidth > 0 {
            Rectangle()
              .fill(theme.borderColor)
              .frame(width: leftWidth, height: 1)
          }

          if rightWidth > 0 {
            Rectangle()
              .fill(theme.borderColor)
              .frame(width: rightWidth, height: 1)
              .offset(x: maxX)
          }
        }
      } else {
        Rectangle()
          .fill(theme.borderColor)
          .frame(height: 1)
      }
    }
    .frame(height: 1)
    .allowsHitTesting(false)
  }

  @ViewBuilder
  private func extensionTab(
    _ workspaceExtension: ResolvedWorkspaceExtension,
    state: WorkspaceExtensionSidebarState
  ) -> some View {
    let isSelected = workspaceExtension.kind == state.activeKind
    let tab = workspaceExtension.tab

    WorkspaceExtensionRailTabView(
      tab: tab,
      isSelected: isSelected
    ) {
      model.selectExtension(workspaceExtension.kind, workspaceID: workspace.id)
    }
    .background {
      GeometryReader { geometry in
        Color.clear.preference(
          key: SelectedExtensionTabFramePreferenceKey.self,
          value: isSelected ? geometry.frame(in: .named("workspaceExtensionRail")) : nil
        )
      }
    }
  }
}
