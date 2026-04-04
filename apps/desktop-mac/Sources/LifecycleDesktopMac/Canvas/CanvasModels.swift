import Foundation

struct CanvasState {
  let activeGroupID: String?
  let groupsByID: [String: CanvasGroup]
  let surfacesByID: [String: CanvasSurface]
  let layout: CanvasLayout
}

extension CanvasState {
  func group(withID groupID: String) -> CanvasGroup? {
    groupsByID[groupID]
  }

  func orderedSurfaces(in group: CanvasGroup) -> [CanvasSurface] {
    group.surfaceOrder.compactMap { surfacesByID[$0] }
  }
}

enum CanvasLayout {
  case tiled(CanvasTiledLayoutNode)
  case spatial(CanvasSpatialLayout)
}

indirect enum CanvasTiledLayoutNode {
  case group(String)
  case split(CanvasTiledLayoutSplit)
}

struct CanvasTiledLayoutSplit {
  enum Direction {
    case column
    case row
  }

  let id: String
  let direction: Direction
  let first: CanvasTiledLayoutNode
  let second: CanvasTiledLayoutNode
  let ratio: Double
}

struct CanvasSpatialLayout {
  let framesByGroupID: [String: CanvasSpatialFrame]
}

struct CanvasSpatialFrame {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
  let zIndex: Double
}

struct CanvasGroup {
  let id: String
  let surfaceOrder: [String]
  let activeSurfaceID: String?
}

