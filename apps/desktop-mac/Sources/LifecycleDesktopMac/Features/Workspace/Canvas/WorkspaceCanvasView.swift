import SwiftUI

struct WorkspaceCanvasView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState

  var body: some View {
    Group {
      switch canvasState.layout {
      case let .tiled(tiledLayout):
        CanvasTiledLayoutNodeView(
          model: model,
          workspaceID: workspaceID,
          canvasState: canvasState,
          layoutNode: tiledLayout,
          activeGroupID: canvasState.activeGroupID
        )
      case .spatial:
        Text("Spatial canvas mode is not implemented yet")
          .foregroundStyle(theme.mutedColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
