import SwiftUI

struct WorkspaceSceneView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let dimmingSettings: WorkspacePaneDimmingSettings

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
                  .frame(maxWidth: .infinity, alignment: .leading)
                  .contentShape(Rectangle())
                  .onTapGesture(count: 2) {
                    zoomActiveWorkspaceWindow()
                  }

                WorkspaceContentPanelsView(
                  model: model,
                  workspace: workspace,
                  dimmingSettings: dimmingSettings
                )
                  .padding(.horizontal, 6)
                  .padding(.bottom, 6)
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

private struct WorkspaceContentPanelsView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary
  let dimmingSettings: WorkspacePaneDimmingSettings
  @State private var dragStartSidebarWidth: CGFloat?
  @State private var liveSidebarWidth: CGFloat?

  private let panelSpacing: CGFloat = 6

  var body: some View {
    GeometryReader { geometry in
      let availableWidth = geometry.size.width
      let persistedSidebarWidth = model.extensionSidebarWidth(
        for: workspace.id,
        availableWidth: availableWidth
      )
      let sidebarWidth = clampedWorkspaceExtensionSidebarWidth(
        liveSidebarWidth ?? persistedSidebarWidth,
        availableWidth: availableWidth
      )
      let canvasWidth = max(availableWidth - sidebarWidth - panelSpacing, 0)

      HStack(spacing: panelSpacing) {
        WorkspaceCanvasContainerView(
          model: model,
          workspace: workspace,
          dimmingSettings: dimmingSettings
        )
          .frame(width: canvasWidth)
          .frame(height: geometry.size.height)
          .background(theme.surfaceBackground)
          .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
              .strokeBorder(theme.borderColor)
          )
          .shadow(color: theme.cardShadowColor, radius: 24, x: 0, y: 10)
          .clipped()

        WorkspaceExtensionSidebarView(model: model, workspace: workspace)
          .frame(width: sidebarWidth)
          .environment(\.workspaceExtensionSidebarResizeContext, workspaceExtensionSidebarResizeContext)
      }
      .frame(width: availableWidth, height: geometry.size.height, alignment: .leading)
      .overlay(alignment: .leading) {
        workspaceExtensionDivider(
          availableWidth: availableWidth,
          sidebarWidth: sidebarWidth
        )
          .offset(x: workspaceExtensionDividerOffset(
            totalWidth: availableWidth,
            sidebarWidth: sidebarWidth
          ))
      }
      .transaction { transaction in
        if liveSidebarWidth != nil {
          transaction.animation = nil
        }
      }
      .onChange(of: workspace.id) { _ in
        liveSidebarWidth = nil
        dragStartSidebarWidth = nil
      }
    }
  }

  private func workspaceExtensionDivider(
    availableWidth: CGFloat,
    sidebarWidth: CGFloat
  ) -> some View {
    ZStack {
      Color.clear

      RoundedRectangle(cornerRadius: 1, style: .continuous)
        .fill(theme.borderColor.opacity(0.75))
        .frame(width: 2, height: 36)
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
    max(totalWidth - sidebarWidth - panelSpacing - (workspaceExtensionSidebarDividerHitThickness / 2), 0)
  }

  private var workspaceExtensionSidebarResizeContext: WorkspaceExtensionSidebarResizeContext {
    WorkspaceExtensionSidebarResizeContext(
      isResizing: liveSidebarWidth != nil
    )
  }
}
