import SwiftUI

struct WorkspaceSceneView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel

  var body: some View {
    Group {
      if model.repositories.isEmpty && (model.isLoading || model.isRecoveringBridge) {
        ProgressView(model.isRecoveringBridge ? "Waiting for bridge…" : "Loading bridge…")
          .tint(theme.primaryTextColor)
          .foregroundStyle(theme.primaryTextColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if model.selectedWorkspace != nil {
        ZStack {
          ForEach(model.cachedWorkspaceIDs, id: \.self) { workspaceID in
            if let workspace = model.workspaceSummary(for: workspaceID) {
              let isSelected = workspaceID == model.selectedWorkspaceID

              VStack(spacing: 0) {
                WorkspaceHeaderView(model: model, workspace: workspace)
                  .padding(.horizontal, 16)
                  .padding(.top, 8)
                  .padding(.bottom, 4)

                WorkspaceContentCardView(model: model, workspace: workspace)
                  .padding(.horizontal, 10)
                  .padding(.bottom, 10)
              }
              .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
              .allowsHitTesting(isSelected)
              .opacity(isSelected ? 1 : 0)
            }
          }
        }
      } else {
        VStack(spacing: 16) {
          Text("Select a workspace")
            .font(.lc(size: 24, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
          Text("Choose a workspace from the sidebar to get started.")
            .font(.lc(size: 13, weight: .medium))
            .foregroundStyle(theme.mutedColor)
            .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .background(theme.shellBackground)
  }
}

private struct WorkspaceContentCardView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary
  @State private var dragStartSidebarWidth: CGFloat?
  @State private var liveSidebarWidth: CGFloat?

  var body: some View {
    GeometryReader { geometry in
      let persistedSidebarWidth = model.extensionSidebarWidth(
        for: workspace.id,
        availableWidth: geometry.size.width
      )
      let sidebarWidth = clampedWorkspaceExtensionSidebarWidth(
        liveSidebarWidth ?? persistedSidebarWidth,
        availableWidth: geometry.size.width
      )

      HStack(spacing: 0) {
        WorkspaceCanvasContainerView(model: model, workspace: workspace)
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        WorkspaceExtensionSidebarView(model: model, workspace: workspace)
          .frame(width: sidebarWidth)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .overlay(alignment: .leading) {
        workspaceExtensionDivider(
          availableWidth: geometry.size.width,
          sidebarWidth: sidebarWidth
        )
        .offset(x: workspaceExtensionDividerOffset(
          totalWidth: geometry.size.width,
          sidebarWidth: sidebarWidth
        ))
      }
      .onChange(of: workspace.id) { _ in
        liveSidebarWidth = nil
        dragStartSidebarWidth = nil
      }
    }
    .background(theme.surfaceBackground)
    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(theme.borderColor)
    )
    .shadow(color: theme.cardShadowColor, radius: 24, x: 0, y: 10)
  }

  private func workspaceExtensionDivider(
    availableWidth: CGFloat,
    sidebarWidth: CGFloat
  ) -> some View {
    ZStack {
      Color.clear

      Rectangle()
        .fill(theme.borderColor)
        .frame(width: 1)
    }
      .frame(width: workspaceExtensionSidebarDividerHitThickness)
      .contentShape(Rectangle())
      .lcResizeCursor(horizontal: true)
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            if dragStartSidebarWidth == nil {
              dragStartSidebarWidth = sidebarWidth
            }

            liveSidebarWidth = clampedWorkspaceExtensionSidebarWidth(
              max((dragStartSidebarWidth ?? sidebarWidth) - value.translation.width, 0),
              availableWidth: availableWidth
            )
          }
          .onEnded { _ in
            if let liveSidebarWidth {
              model.setExtensionSidebarWidth(
                liveSidebarWidth,
                workspaceID: workspace.id,
                availableWidth: availableWidth
              )
            }
            dragStartSidebarWidth = nil
            liveSidebarWidth = nil
          }
      )
  }

  private func workspaceExtensionDividerOffset(totalWidth: CGFloat, sidebarWidth: CGFloat) -> CGFloat {
    max(totalWidth - sidebarWidth - (workspaceExtensionSidebarDividerHitThickness / 2), 0)
  }
}
