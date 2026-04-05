import SwiftUI

struct WorkspaceShellView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let onOpenSettings: () -> Void

  var body: some View {
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
