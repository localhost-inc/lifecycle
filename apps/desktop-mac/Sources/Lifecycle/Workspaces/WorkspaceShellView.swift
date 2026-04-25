import SwiftUI

func shouldShowAppWelcomeView(
  repositories: [BridgeRepository],
  isLoading: Bool,
  isRecoveringBridge: Bool,
  forceShow: Bool = false
) -> Bool {
  guard !isLoading, !isRecoveringBridge else {
    return false
  }

  return forceShow || repositories.isEmpty
}

struct WorkspaceShellView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  @ObservedObject var settingsStore: AppSettingsStore
  let onOpenSettings: () -> Void
  @State private var dragStartSidebarWidth: CGFloat?
  @State private var liveSidebarWidth: CGFloat?

  var body: some View {
    Group {
      if shouldShowAppWelcomeView(
        repositories: model.repositories,
        isLoading: model.isLoading,
        isRecoveringBridge: model.isRecoveringBridge,
        forceShow: settingsStore.isDeveloperMode && settingsStore.settings.developer.showsOnboarding
      ) {
        let showsDeveloperDismissButton =
          settingsStore.isDeveloperMode
          && settingsStore.settings.developer.showsOnboarding
          && !model.repositories.isEmpty
        AppWelcomeView(
          errorMessage: model.errorMessage,
          onAddRepository: model.addRepository,
          showsDeveloperDismissButton: showsDeveloperDismissButton,
          onDismissDeveloperOverride: {
            settingsStore.setDeveloperShowsOnboarding(false)
          }
        )
      } else {
        GeometryReader { geometry in
          let persistedSidebarWidth = model.appSidebarWidth(
            availableWidth: geometry.size.width
          )
          let sidebarWidth = clampedAppSidebarWidth(
            liveSidebarWidth ?? persistedSidebarWidth,
            availableWidth: geometry.size.width
          )

          HStack(spacing: 0) {
            AppSidebarView(model: model, onOpenSettings: onOpenSettings)
              .frame(width: sidebarWidth)

            WorkspaceSceneView(
              model: model,
              dimmingSettings: settingsStore.workspacePaneDimmingSettings
            )
              .frame(maxWidth: .infinity, maxHeight: .infinity)
              .background(theme.shellBackground)
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .overlay(alignment: .leading) {
            appSidebarDivider(
              availableWidth: geometry.size.width,
              sidebarWidth: sidebarWidth
            )
            .offset(x: appSidebarDividerOffset(sidebarWidth: sidebarWidth))
          }
        }
        .background(theme.shellBackground)
        .ignoresSafeArea(.container, edges: .top)
      }
    }
  }

  private func appSidebarDivider(
    availableWidth: CGFloat,
    sidebarWidth: CGFloat
  ) -> some View {
    Color.clear
      .frame(width: appSidebarDividerHitThickness)
      .contentShape(Rectangle())
      .lcResizeCursor(horizontal: true)
      .gesture(
        DragGesture(minimumDistance: 0)
          .onChanged { value in
            if dragStartSidebarWidth == nil {
              dragStartSidebarWidth = sidebarWidth
            }

            liveSidebarWidth = clampedAppSidebarWidth(
              max((dragStartSidebarWidth ?? sidebarWidth) + value.translation.width, 0),
              availableWidth: availableWidth
            )
          }
          .onEnded { _ in
            if let liveSidebarWidth {
              model.setAppSidebarWidth(
                liveSidebarWidth,
                availableWidth: availableWidth
              )
            }
            dragStartSidebarWidth = nil
            liveSidebarWidth = nil
          }
      )
  }

  private func appSidebarDividerOffset(sidebarWidth: CGFloat) -> CGFloat {
    max(sidebarWidth - (appSidebarDividerHitThickness / 2), 0)
  }
}
