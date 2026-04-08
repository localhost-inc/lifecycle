import Foundation

public enum CanvasLayoutMode: String, Codable, Equatable {
  case tiled
  case spatial
}

public enum CanvasLayout: Codable {
  case tiled(CanvasTiledLayoutNode)
  case spatial(CanvasSpatialLayout)

  private enum CodingKeys: String, CodingKey {
    case kind
    case tiledRoot
    case spatialLayout
  }

  private enum Kind: String, Codable {
    case tiled
    case spatial
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let kind = try container.decode(Kind.self, forKey: .kind)

    switch kind {
    case .tiled:
      self = .tiled(try container.decode(CanvasTiledLayoutNode.self, forKey: .tiledRoot))
    case .spatial:
      self = .spatial(try container.decode(CanvasSpatialLayout.self, forKey: .spatialLayout))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)

    switch self {
    case let .tiled(root):
      try container.encode(Kind.tiled, forKey: .kind)
      try container.encode(root, forKey: .tiledRoot)
    case let .spatial(layout):
      try container.encode(Kind.spatial, forKey: .kind)
      try container.encode(layout, forKey: .spatialLayout)
    }
  }
}

public extension CanvasLayout {
  var mode: CanvasLayoutMode {
    switch self {
    case .tiled:
      .tiled
    case .spatial:
      .spatial
    }
  }
}

public indirect enum CanvasTiledLayoutNode: Codable {
  case group(String)
  case split(CanvasTiledLayoutSplit)

  private enum CodingKeys: String, CodingKey {
    case kind
    case groupID
    case split
  }

  private enum Kind: String, Codable {
    case group
    case split
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let kind = try container.decode(Kind.self, forKey: .kind)

    switch kind {
    case .group:
      self = .group(try container.decode(String.self, forKey: .groupID))
    case .split:
      self = .split(try container.decode(CanvasTiledLayoutSplit.self, forKey: .split))
    }
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)

    switch self {
    case let .group(groupID):
      try container.encode(Kind.group, forKey: .kind)
      try container.encode(groupID, forKey: .groupID)
    case let .split(split):
      try container.encode(Kind.split, forKey: .kind)
      try container.encode(split, forKey: .split)
    }
  }
}

public struct CanvasTiledLayoutSplit: Codable {
  public enum Direction: String, Codable {
    case column
    case row
  }

  public let id: String
  public let direction: Direction
  public let first: CanvasTiledLayoutNode
  public let second: CanvasTiledLayoutNode
  public let ratio: Double

  public init(
    id: String,
    direction: Direction,
    first: CanvasTiledLayoutNode,
    second: CanvasTiledLayoutNode,
    ratio: Double
  ) {
    self.id = id
    self.direction = direction
    self.first = first
    self.second = second
    self.ratio = ratio
  }
}

public struct CanvasSpatialLayout: Codable {
  public let framesByGroupID: [String: CanvasSpatialFrame]

  public init(framesByGroupID: [String: CanvasSpatialFrame]) {
    self.framesByGroupID = framesByGroupID
  }
}

public struct CanvasSpatialFrame: Codable {
  public let x: Double
  public let y: Double
  public let width: Double
  public let height: Double
  public let zIndex: Double

  public init(x: Double, y: Double, width: Double, height: Double, zIndex: Double) {
    self.x = x
    self.y = y
    self.width = width
    self.height = height
    self.zIndex = zIndex
  }
}

public struct CanvasGroup: Codable {
  public let id: String
  public let surfaceOrder: [String]
  public let activeSurfaceID: String?

  public init(id: String, surfaceOrder: [String], activeSurfaceID: String?) {
    self.id = id
    self.surfaceOrder = surfaceOrder
    self.activeSurfaceID = activeSurfaceID
  }
}
