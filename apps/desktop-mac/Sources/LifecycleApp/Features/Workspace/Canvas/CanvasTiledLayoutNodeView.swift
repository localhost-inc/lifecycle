import SwiftUI
import LifecyclePresentation

struct CanvasTiledLayoutNodeView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState
  let layoutNode: CanvasTiledLayoutNode
  let activeGroupID: String?
  let dimmingSettings: WorkspacePaneDimmingSettings

  var body: some View {
    switch layoutNode {
    case let .group(groupID):
      if let group = canvasState.group(withID: groupID) {
        WorkspaceGroupView(
          model: model,
          workspaceID: workspaceID,
          group: group,
          surfaces: canvasState.orderedSurfaces(in: group),
          isActive: group.id == activeGroupID,
          dimmingSettings: dimmingSettings
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        Text("Group is missing from canvas state")
          .foregroundStyle(theme.errorColor.opacity(0.92))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    case let .split(split):
      CanvasTiledSplitView(
        model: model,
        workspaceID: workspaceID,
        canvasState: canvasState,
        split: split,
        activeGroupID: activeGroupID,
        dimmingSettings: dimmingSettings
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
  }
}
