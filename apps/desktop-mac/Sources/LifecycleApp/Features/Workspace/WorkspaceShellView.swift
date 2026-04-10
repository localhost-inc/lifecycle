import SwiftUI

func shouldShowAppWelcomeView(
  repositories: [BridgeRepository],
  isLoading: Bool,
  isRecoveringBridge: Bool
) -> Bool {
  repositories.isEmpty && !isLoading && !isRecoveringBridge
}

struct WorkspaceShellView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let onOpenSettings: () -> Void

  var body: some View {
    Group {
      if shouldShowAppWelcomeView(
        repositories: model.repositories,
        isLoading: model.isLoading,
        isRecoveringBridge: model.isRecoveringBridge
      ) {
        AppWelcomeView(errorMessage: model.errorMessage)
      } else {
        HStack(spacing: 0) {
          WorkspaceSidebarView(model: model, onOpenSettings: onOpenSettings)
            .frame(width: 280)

          WorkspaceSceneView(model: model)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(theme.shellBackground)
        }
        .background(theme.shellBackground)
        .ignoresSafeArea(.container, edges: .top)
      }
    }
  }
}
