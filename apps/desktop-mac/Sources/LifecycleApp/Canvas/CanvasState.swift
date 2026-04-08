import Foundation
import LifecyclePresentation

struct CanvasState {
  let activeGroupID: String?
  let groupsByID: [String: CanvasGroup]
  let surfacesByID: [String: CanvasSurface]
  let activeLayoutMode: CanvasLayoutMode
  let tiledLayout: CanvasTiledLayoutNode
  let spatialLayout: CanvasSpatialLayout
  var layout: CanvasLayout {
    switch activeLayoutMode {
    case .tiled:
      .tiled(tiledLayout)
    case .spatial:
      .spatial(spatialLayout)
    }
  }
}

extension CanvasState {
  func group(withID groupID: String) -> CanvasGroup? {
    groupsByID[groupID]
  }

  func orderedSurfaces(in group: CanvasGroup) -> [CanvasSurface] {
    group.surfaceOrder.compactMap { surfacesByID[$0] }
  }
}
