import SwiftUI
import LifecyclePresentation

struct WorkspaceCanvasView: View {
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState
  let isActiveWorkspace: Bool
  let dimmingSettings: WorkspacePaneDimmingSettings

  var body: some View {
    Group {
      switch canvasState.layout {
      case let .tiled(tiledLayout):
        CanvasTiledLayoutNodeView(
          model: model,
          workspaceID: workspaceID,
          canvasState: canvasState,
          layoutNode: tiledLayout,
          activeGroupID: canvasState.activeGroupID,
          dimmingSettings: dimmingSettings
        )
      case .spatial:
        WorkspaceSpatialCanvasView(
          model: model,
          workspaceID: workspaceID,
          canvasState: canvasState,
          isActiveWorkspace: isActiveWorkspace,
          dimmingSettings: dimmingSettings
        )
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}
