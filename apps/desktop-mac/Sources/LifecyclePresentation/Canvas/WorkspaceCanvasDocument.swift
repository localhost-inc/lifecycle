import Foundation

public struct WorkspaceCanvasDocument: Codable {
  public let activeGroupID: String?
  public let groupsByID: [String: CanvasGroup]
  public let surfacesByID: [String: CanvasSurfaceRecord]
  public let activeLayoutMode: CanvasLayoutMode
  public let tiledLayout: CanvasTiledLayoutNode
  public let spatialLayout: CanvasSpatialLayout

  private enum CodingKeys: String, CodingKey {
    case activeGroupID
    case groupsByID
    case surfacesByID
    case activeLayoutMode
    case tiledLayout
    case spatialLayout
    case layout
  }

  public init(
    activeGroupID: String?,
    groupsByID: [String: CanvasGroup],
    surfacesByID: [String: CanvasSurfaceRecord],
    activeLayoutMode: CanvasLayoutMode,
    tiledLayout: CanvasTiledLayoutNode,
    spatialLayout: CanvasSpatialLayout
  ) {
    self.activeGroupID = activeGroupID
    self.groupsByID = groupsByID
    self.surfacesByID = surfacesByID
    self.activeLayoutMode = activeLayoutMode
    self.tiledLayout = tiledLayout
    self.spatialLayout = spatialLayout
  }

  public init(
    activeGroupID: String?,
    groupsByID: [String: CanvasGroup],
    surfacesByID: [String: CanvasSurfaceRecord],
    layout: CanvasLayout
  ) {
    let resolvedLayouts = workspaceCanvasDocumentLayouts(
      for: layout,
      groupsByID: groupsByID
    )
    self.init(
      activeGroupID: activeGroupID,
      groupsByID: groupsByID,
      surfacesByID: surfacesByID,
      activeLayoutMode: resolvedLayouts.mode,
      tiledLayout: resolvedLayouts.tiledLayout,
      spatialLayout: resolvedLayouts.spatialLayout
    )
  }

  public var layout: CanvasLayout {
    switch activeLayoutMode {
    case .tiled:
      .tiled(tiledLayout)
    case .spatial:
      .spatial(spatialLayout)
    }
  }

  public init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    let activeGroupID = try container.decodeIfPresent(String.self, forKey: .activeGroupID)
    let groupsByID = try container.decode([String: CanvasGroup].self, forKey: .groupsByID)
    let surfacesByID = try container.decode([String: CanvasSurfaceRecord].self, forKey: .surfacesByID)

    if let activeLayoutMode = try container.decodeIfPresent(CanvasLayoutMode.self, forKey: .activeLayoutMode)
    {
      self.init(
        activeGroupID: activeGroupID,
        groupsByID: groupsByID,
        surfacesByID: surfacesByID,
        activeLayoutMode: activeLayoutMode,
        tiledLayout: try container.decode(CanvasTiledLayoutNode.self, forKey: .tiledLayout),
        spatialLayout: try container.decode(CanvasSpatialLayout.self, forKey: .spatialLayout)
      )
      return
    }

    self.init(
      activeGroupID: activeGroupID,
      groupsByID: groupsByID,
      surfacesByID: surfacesByID,
      layout: try container.decode(CanvasLayout.self, forKey: .layout)
    )
  }

  public func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encodeIfPresent(activeGroupID, forKey: .activeGroupID)
    try container.encode(groupsByID, forKey: .groupsByID)
    try container.encode(surfacesByID, forKey: .surfacesByID)
    try container.encode(activeLayoutMode, forKey: .activeLayoutMode)
    try container.encode(tiledLayout, forKey: .tiledLayout)
    try container.encode(spatialLayout, forKey: .spatialLayout)
  }
}

public func defaultCanvasDocument(for workspaceID: String) -> WorkspaceCanvasDocument {
  let groupID = defaultCanvasGroupID(for: workspaceID)
  let group = CanvasGroup(
    id: groupID,
    surfaceOrder: [],
    activeSurfaceID: nil
  )

  return WorkspaceCanvasDocument(
    activeGroupID: groupID,
    groupsByID: [groupID: group],
    surfacesByID: [:],
    activeLayoutMode: .tiled,
    tiledLayout: .group(groupID),
    spatialLayout: defaultCanvasSpatialLayout(groupIDs: [groupID])
  )
}

private func workspaceCanvasDocumentLayouts(
  for layout: CanvasLayout,
  groupsByID: [String: CanvasGroup]
) -> (mode: CanvasLayoutMode, tiledLayout: CanvasTiledLayoutNode, spatialLayout: CanvasSpatialLayout) {
  switch layout {
  case let .tiled(tiledLayout):
    return (
      .tiled,
      tiledLayout,
      defaultCanvasSpatialLayout(groupIDs: canvasGroupIDs(in: tiledLayout))
    )
  case let .spatial(spatialLayout):
    let groupIDs = spatialLayout.framesByGroupID.keys.sorted().filter { groupsByID[$0] != nil }
    return (
      .spatial,
      canvasTiledLayoutCoveringGroups(
        groupIDs: groupIDs.isEmpty ? groupsByID.keys.sorted() : groupIDs,
        splitIDPrefix: "split:legacy"
      ) ?? .group(groupsByID.keys.sorted().first ?? "group:recovered"),
      spatialLayout
    )
  }
}

private func defaultCanvasSpatialLayout(groupIDs: [String]) -> CanvasSpatialLayout {
  CanvasSpatialLayout(
    framesByGroupID: Dictionary(
      uniqueKeysWithValues: groupIDs.enumerated().map { index, groupID in
        (
          groupID,
          defaultCanvasSpatialFrame(index: index, zIndex: Double(index))
        )
      }
    )
  )
}

private func defaultCanvasSpatialFrame(index: Int, zIndex: Double) -> CanvasSpatialFrame {
  let offset = Double(index) * 48
  return CanvasSpatialFrame(
    x: 96 + offset,
    y: 96 + offset,
    width: 960,
    height: 640,
    zIndex: zIndex
  )
}

private func canvasTiledLayoutCoveringGroups(
  groupIDs: [String],
  splitIDPrefix: String
) -> CanvasTiledLayoutNode? {
  guard let firstGroupID = groupIDs.first else {
    return nil
  }

  var node = CanvasTiledLayoutNode.group(firstGroupID)
  for (index, groupID) in groupIDs.dropFirst().enumerated() {
    node = .split(
      CanvasTiledLayoutSplit(
        id: "\(splitIDPrefix):\(index + 1)",
        direction: .row,
        first: node,
        second: .group(groupID),
        ratio: 0.5
      )
    )
  }

  return node
}

private func normalizedCanvasTiledLayout(
  _ tiledLayout: CanvasTiledLayoutNode,
  groupsByID: [String: CanvasGroup],
  spatialLayout: CanvasSpatialLayout,
  workspaceID: String
) -> CanvasTiledLayoutNode {
  let tiledGroupIDs = canvasGroupIDs(in: tiledLayout)
  if !tiledGroupIDs.isEmpty && tiledGroupIDs.allSatisfy({ groupsByID[$0] != nil }) {
    return tiledLayout
  }

  let spatialGroupIDs = spatialLayout.framesByGroupID.keys.sorted().filter { groupsByID[$0] != nil }
  if let rebuilt = canvasTiledLayoutCoveringGroups(
    groupIDs: spatialGroupIDs,
    splitIDPrefix: "split:\(workspaceID):recovered"
  ) {
    return rebuilt
  }

  if let rebuilt = canvasTiledLayoutCoveringGroups(
    groupIDs: groupsByID.keys.sorted(),
    splitIDPrefix: "split:\(workspaceID):recovered"
  ) {
    return rebuilt
  }

  return defaultCanvasDocument(for: workspaceID).tiledLayout
}

private func normalizedCanvasSpatialLayout(
  _ spatialLayout: CanvasSpatialLayout,
  groupIDs: [String]
) -> CanvasSpatialLayout {
  let existingFramesByGroupID = spatialLayout.framesByGroupID
  var nextFramesByGroupID = existingFramesByGroupID.filter { groupIDs.contains($0.key) }
  var nextZIndex =
    (nextFramesByGroupID.values.map(\.zIndex).max() ?? -1) + 1

  for (index, groupID) in groupIDs.enumerated() where nextFramesByGroupID[groupID] == nil {
    nextFramesByGroupID[groupID] = defaultCanvasSpatialFrame(index: index, zIndex: nextZIndex)
    nextZIndex += 1
  }

  return CanvasSpatialLayout(framesByGroupID: nextFramesByGroupID)
}

public func normalizeCanvasDocument(
  _ document: WorkspaceCanvasDocument,
  workspaceID: String,
  surfaceOrderPreference: [String]
) -> WorkspaceCanvasDocument {
  var tiledLayout = normalizedCanvasTiledLayout(
    document.tiledLayout,
    groupsByID: document.groupsByID,
    spatialLayout: document.spatialLayout,
    workspaceID: workspaceID
  )
  var layoutGroupIDs = canvasGroupIDs(in: tiledLayout)

  if layoutGroupIDs.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    tiledLayout = fallback.tiledLayout
    layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  }

  var groups = Dictionary<String, CanvasGroup>(
    uniqueKeysWithValues: layoutGroupIDs.compactMap { groupID in
      guard let group = document.groupsByID[groupID] else {
        return nil
      }

      return (
        groupID,
        CanvasGroup(
          id: groupID,
          surfaceOrder: orderedCanvasSurfaceIDs(
            group.surfaceOrder,
            availableSurfaceIDs: Set(document.surfacesByID.keys)
          ),
          activeSurfaceID: group.activeSurfaceID
        )
      )
    }
  )

  if groups.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    groups = fallback.groupsByID
    tiledLayout = fallback.tiledLayout
    layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  }

  let assignedSurfaceIDs = Set(groups.values.flatMap(\.surfaceOrder))
  let preferredUnassignedSurfaceIDs = orderedCanvasSurfaceIDs(
    surfaceOrderPreference,
    availableSurfaceIDs: Set(document.surfacesByID.keys)
  ).filter { !assignedSurfaceIDs.contains($0) }
  let remainingUnassignedSurfaceIDs = orderedCanvasSurfaceIDs(
    Array(document.surfacesByID.keys).sorted(),
    availableSurfaceIDs: Set(document.surfacesByID.keys)
  ).filter { !assignedSurfaceIDs.contains($0) && !preferredUnassignedSurfaceIDs.contains($0) }
  let unassignedSurfaceIDs = preferredUnassignedSurfaceIDs + remainingUnassignedSurfaceIDs

  if let targetGroupID =
    (document.activeGroupID.flatMap { groups[$0] == nil ? nil : $0 }) ?? layoutGroupIDs.first,
     let targetGroup = groups[targetGroupID]
  {
    groups[targetGroupID] = CanvasGroup(
      id: targetGroup.id,
      surfaceOrder: targetGroup.surfaceOrder + unassignedSurfaceIDs,
      activeSurfaceID: targetGroup.activeSurfaceID
    )
  }

  while groups.count > 1,
        let emptyGroupID = layoutGroupIDs.first(where: { groupID in
          groups[groupID]?.surfaceOrder.isEmpty ?? true
        }),
        let nextTiledLayout = removeGroupFromCanvasTiledLayout(tiledLayout, groupID: emptyGroupID)
  {
    tiledLayout = nextTiledLayout
    groups.removeValue(forKey: emptyGroupID)
    layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  }

  layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  if layoutGroupIDs.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    groups = fallback.groupsByID
    tiledLayout = fallback.tiledLayout
    layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  }

  groups = Dictionary<String, CanvasGroup>(
    uniqueKeysWithValues: layoutGroupIDs.compactMap { groupID in
      groups[groupID].map { (groupID, $0) }
    }
  )

  if groups.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    groups = fallback.groupsByID
    tiledLayout = fallback.tiledLayout
    layoutGroupIDs = canvasGroupIDs(in: tiledLayout)
  }

  let activeGroupID =
    document.activeGroupID.flatMap { groups[$0] == nil ? nil : $0 } ??
    layoutGroupIDs.first(where: { !(groups[$0]?.surfaceOrder.isEmpty ?? true) }) ??
    layoutGroupIDs.first

  for groupID in layoutGroupIDs {
    guard let group = groups[groupID] else {
      continue
    }

    let nextActiveSurfaceID: String?
    if let currentActiveSurfaceID = group.activeSurfaceID,
       group.surfaceOrder.contains(currentActiveSurfaceID)
    {
      nextActiveSurfaceID = currentActiveSurfaceID
    } else {
      nextActiveSurfaceID = group.surfaceOrder.first
    }

    groups[groupID] = CanvasGroup(
      id: group.id,
      surfaceOrder: group.surfaceOrder,
      activeSurfaceID: nextActiveSurfaceID
    )
  }

  let spatialLayout = normalizedCanvasSpatialLayout(
    document.spatialLayout,
    groupIDs: layoutGroupIDs
  )

  return WorkspaceCanvasDocument(
    activeGroupID: activeGroupID,
    groupsByID: groups,
    surfacesByID: document.surfacesByID,
    activeLayoutMode: document.activeLayoutMode,
    tiledLayout: tiledLayout,
    spatialLayout: spatialLayout
  )
}

public func synchronizedCanvasDocument(
  _ baseDocument: WorkspaceCanvasDocument,
  workspaceID: String,
  terminalSurfaceRecords: [CanvasSurfaceRecord],
  liveAgentIDs: Set<String>?,
  surfaceOrderPreference: [String]
) -> WorkspaceCanvasDocument {
  let agentSurfaceRecords: [CanvasSurfaceRecord] = baseDocument.surfacesByID.values.filter { record in
    guard record.surfaceKind == .agent,
          let binding = AgentSurfaceBinding(binding: record.binding),
          binding.workspaceID == workspaceID
    else {
      return false
    }

    guard let liveAgentIDs else {
      return true
    }

    return liveAgentIDs.contains(binding.agentID)
  }

  let availableSurfaceRecords = terminalSurfaceRecords + agentSurfaceRecords
  let availableSurfaceIDs = Set(availableSurfaceRecords.map(\.id))
  var surfacesByID = baseDocument.surfacesByID.filter { availableSurfaceIDs.contains($0.key) }

  for surfaceRecord in availableSurfaceRecords {
    surfacesByID[surfaceRecord.id] = surfaceRecord
  }

  return normalizeCanvasDocument(
    WorkspaceCanvasDocument(
      activeGroupID: baseDocument.activeGroupID,
      groupsByID: baseDocument.groupsByID,
      surfacesByID: surfacesByID,
      activeLayoutMode: baseDocument.activeLayoutMode,
      tiledLayout: baseDocument.tiledLayout,
      spatialLayout: baseDocument.spatialLayout
    ),
    workspaceID: workspaceID,
    surfaceOrderPreference: surfaceOrderPreference
  )
}

public func defaultCanvasGroupID(for workspaceID: String) -> String {
  "group:\(workspaceID):root"
}

public func createCanvasGroupID(for workspaceID: String) -> String {
  "group:\(workspaceID):\(UUID().uuidString.lowercased())"
}

public func createCanvasSplitID(for workspaceID: String) -> String {
  "split:\(workspaceID):\(UUID().uuidString.lowercased())"
}

public func orderedCanvasSurfaceIDs(
  _ surfaceIDs: [String],
  availableSurfaceIDs: Set<String>
) -> [String] {
  var seen = Set<String>()
  return surfaceIDs.filter { surfaceID in
    guard availableSurfaceIDs.contains(surfaceID) else {
      return false
    }

    return seen.insert(surfaceID).inserted
  }
}

public func nextCanvasActiveSurfaceIDAfterClosing(
  _ closingSurfaceID: String,
  in surfaceOrder: [String],
  activeSurfaceID: String?
) -> String? {
  let nextSurfaceOrder = surfaceOrder.filter { $0 != closingSurfaceID }

  guard !nextSurfaceOrder.isEmpty else {
    return nil
  }

  guard activeSurfaceID == closingSurfaceID else {
    if let activeSurfaceID, nextSurfaceOrder.contains(activeSurfaceID) {
      return activeSurfaceID
    }

    return nextSurfaceOrder.first
  }

  guard let closingIndex = surfaceOrder.firstIndex(of: closingSurfaceID) else {
    return nextSurfaceOrder.first
  }

  if closingIndex < nextSurfaceOrder.count {
    return nextSurfaceOrder[closingIndex]
  }

  return nextSurfaceOrder.last
}

public func activeCanvasSurfaceIDs(in document: WorkspaceCanvasDocument) -> [String] {
  canvasGroupIDs(in: document.layout).compactMap { groupID in
    guard let group = document.groupsByID[groupID],
          let activeSurfaceID = group.activeSurfaceID,
          document.surfacesByID[activeSurfaceID] != nil
    else {
      return nil
    }

    return activeSurfaceID
  }
}

public func reorderedCanvasSurfaceIDs(
  _ surfaceOrder: [String],
  movingSurfaceID: String,
  targetSurfaceID: String
) -> [String] {
  guard movingSurfaceID != targetSurfaceID,
        let movingIndex = surfaceOrder.firstIndex(of: movingSurfaceID),
        let targetIndex = surfaceOrder.firstIndex(of: targetSurfaceID)
  else {
    return surfaceOrder
  }

  var nextSurfaceOrder = surfaceOrder
  let movingSurface = nextSurfaceOrder.remove(at: movingIndex)
  let adjustedTargetIndex = movingIndex < targetIndex ? targetIndex - 1 : targetIndex
  nextSurfaceOrder.insert(movingSurface, at: adjustedTargetIndex)
  return nextSurfaceOrder
}

public func canvasGroupIDs(in layout: CanvasLayout) -> [String] {
  switch layout {
  case let .tiled(root):
    return canvasGroupIDs(in: root)
  case let .spatial(spatialLayout):
    return spatialLayout.framesByGroupID.keys.sorted()
  }
}

public func canvasGroupIDs(in node: CanvasTiledLayoutNode) -> [String] {
  switch node {
  case let .group(groupID):
    return [groupID]
  case let .split(split):
    return canvasGroupIDs(in: split.first) + canvasGroupIDs(in: split.second)
  }
}

public func splitCanvasTiledLayout(
  _ root: CanvasTiledLayoutNode,
  targetGroupID: String,
  newGroupID: String,
  direction: CanvasTiledLayoutSplit.Direction,
  splitID: String
) -> CanvasTiledLayoutNode {
  let replacement = CanvasTiledLayoutNode.split(
    CanvasTiledLayoutSplit(
      id: splitID,
      direction: direction,
      first: .group(targetGroupID),
      second: .group(newGroupID),
      ratio: 0.5
    )
  )
  return replacingCanvasGroupNode(root, targetGroupID: targetGroupID, replacement: replacement)
}

public func removeGroupFromCanvasTiledLayout(
  _ root: CanvasTiledLayoutNode,
  groupID: String
) -> CanvasTiledLayoutNode? {
  removingCanvasGroupNode(root, targetGroupID: groupID)
}

public func updateCanvasTiledLayoutSplitRatio(
  _ root: CanvasTiledLayoutNode,
  splitID: String,
  ratio: Double
) -> CanvasTiledLayoutNode {
  updatingCanvasSplitNode(root, splitID: splitID) { split in
    CanvasTiledLayoutSplit(
      id: split.id,
      direction: split.direction,
      first: split.first,
      second: split.second,
      ratio: ratio
    )
  }
}

private func replacingCanvasGroupNode(
  _ node: CanvasTiledLayoutNode,
  targetGroupID: String,
  replacement: CanvasTiledLayoutNode
) -> CanvasTiledLayoutNode {
  switch node {
  case let .group(groupID):
    return groupID == targetGroupID ? replacement : node
  case let .split(split):
    return .split(
      CanvasTiledLayoutSplit(
        id: split.id,
        direction: split.direction,
        first: replacingCanvasGroupNode(
          split.first,
          targetGroupID: targetGroupID,
          replacement: replacement
        ),
        second: replacingCanvasGroupNode(
          split.second,
          targetGroupID: targetGroupID,
          replacement: replacement
        ),
        ratio: split.ratio
      )
    )
  }
}

private func removingCanvasGroupNode(
  _ node: CanvasTiledLayoutNode,
  targetGroupID: String
) -> CanvasTiledLayoutNode? {
  switch node {
  case let .group(groupID):
    return groupID == targetGroupID ? nil : node
  case let .split(split):
    let first = removingCanvasGroupNode(split.first, targetGroupID: targetGroupID)
    let second = removingCanvasGroupNode(split.second, targetGroupID: targetGroupID)

    switch (first, second) {
    case let (.some(nextFirst), .some(nextSecond)):
      return .split(
        CanvasTiledLayoutSplit(
          id: split.id,
          direction: split.direction,
          first: nextFirst,
          second: nextSecond,
          ratio: split.ratio
        )
      )
    case let (.some(nextFirst), nil):
      return nextFirst
    case let (nil, .some(nextSecond)):
      return nextSecond
    case (nil, nil):
      return nil
    }
  }
}

private func updatingCanvasSplitNode(
  _ node: CanvasTiledLayoutNode,
  splitID: String,
  update: (CanvasTiledLayoutSplit) -> CanvasTiledLayoutSplit
) -> CanvasTiledLayoutNode {
  switch node {
  case .group:
    return node
  case let .split(split):
    if split.id == splitID {
      return .split(update(split))
    }

    return .split(
      CanvasTiledLayoutSplit(
        id: split.id,
        direction: split.direction,
        first: updatingCanvasSplitNode(split.first, splitID: splitID, update: update),
        second: updatingCanvasSplitNode(split.second, splitID: splitID, update: update),
        ratio: split.ratio
      )
    )
  }
}

// MARK: - Drop Edge / Move Surface to Split

/// Where on a group the user dropped a dragged surface.
public enum CanvasDropEdge: Sendable {
  case left
  case right
  case top
  case bottom
  case center
}

/// Move a surface from its current group into a new split adjacent to a target group.
///
/// - center: moves the surface into the target group's tab list.
/// - edges: removes the surface from its source, creates a new group, and inserts
///   a split node at the target group's position in the layout tree.
///
/// Empty source groups are cleaned up by `normalizeCanvasDocument`.
public func moveSurfaceToEdge(
  in document: WorkspaceCanvasDocument,
  surfaceID: String,
  targetGroupID: String,
  edge: CanvasDropEdge,
  workspaceID: String
) -> WorkspaceCanvasDocument {
  // Find source group
  guard let sourceGroupID = document.groupsByID.first(where: { _, group in
    group.surfaceOrder.contains(surfaceID)
  })?.key
  else {
    return document
  }

  // Center drop: move surface into the target group's tab list
  if edge == .center {
    return moveSurfaceToGroup(
      in: document,
      surfaceID: surfaceID,
      sourceGroupID: sourceGroupID,
      targetGroupID: targetGroupID
    )
  }

  // Don't split if we're dragging the only surface in the target group onto itself
  if sourceGroupID == targetGroupID,
     document.groupsByID[sourceGroupID]?.surfaceOrder.count == 1
  {
    return document
  }

  // Remove surface from source group
  var groups = document.groupsByID
  if let sourceGroup = groups[sourceGroupID] {
    let nextOrder = sourceGroup.surfaceOrder.filter { $0 != surfaceID }
    groups[sourceGroupID] = CanvasGroup(
      id: sourceGroup.id,
      surfaceOrder: nextOrder,
      activeSurfaceID: sourceGroup.activeSurfaceID == surfaceID ? nextOrder.first : sourceGroup.activeSurfaceID
    )
  }

  // Create new group for the moved surface
  let newGroupID = createCanvasGroupID(for: workspaceID)
  groups[newGroupID] = CanvasGroup(
    id: newGroupID,
    surfaceOrder: [surfaceID],
    activeSurfaceID: surfaceID
  )

  // Build split: edge determines direction and ordering
  let direction: CanvasTiledLayoutSplit.Direction
  let newGroupFirst: Bool

  switch edge {
  case .left:
    direction = .row
    newGroupFirst = true
  case .right:
    direction = .row
    newGroupFirst = false
  case .top:
    direction = .column
    newGroupFirst = true
  case .bottom:
    direction = .column
    newGroupFirst = false
  case .center:
    fatalError("Handled above")
  }

  let splitID = createCanvasSplitID(for: workspaceID)
  let first: CanvasTiledLayoutNode = newGroupFirst ? .group(newGroupID) : .group(targetGroupID)
  let second: CanvasTiledLayoutNode = newGroupFirst ? .group(targetGroupID) : .group(newGroupID)

  let replacement = CanvasTiledLayoutNode.split(
    CanvasTiledLayoutSplit(
      id: splitID,
      direction: direction,
      first: first,
      second: second,
      ratio: 0.5
    )
  )

  return WorkspaceCanvasDocument(
    activeGroupID: newGroupID,
    groupsByID: groups,
    surfacesByID: document.surfacesByID,
    activeLayoutMode: document.activeLayoutMode,
    tiledLayout: replacingCanvasGroupNode(
      document.tiledLayout,
      targetGroupID: targetGroupID,
      replacement: replacement
    ),
    spatialLayout: document.spatialLayout
  )
}

/// Move a surface from one group's tab list into another group's tab list.
private func moveSurfaceToGroup(
  in document: WorkspaceCanvasDocument,
  surfaceID: String,
  sourceGroupID: String,
  targetGroupID: String
) -> WorkspaceCanvasDocument {
  guard sourceGroupID != targetGroupID else {
    return document
  }

  var groups = document.groupsByID

  // Remove from source
  if let sourceGroup = groups[sourceGroupID] {
    let nextOrder = sourceGroup.surfaceOrder.filter { $0 != surfaceID }
    groups[sourceGroupID] = CanvasGroup(
      id: sourceGroup.id,
      surfaceOrder: nextOrder,
      activeSurfaceID: sourceGroup.activeSurfaceID == surfaceID ? nextOrder.first : sourceGroup.activeSurfaceID
    )
  }

  // Add to target
  if let targetGroup = groups[targetGroupID] {
    groups[targetGroupID] = CanvasGroup(
      id: targetGroup.id,
      surfaceOrder: targetGroup.surfaceOrder + [surfaceID],
      activeSurfaceID: surfaceID
    )
  }

  return WorkspaceCanvasDocument(
    activeGroupID: targetGroupID,
    groupsByID: groups,
    surfacesByID: document.surfacesByID,
    activeLayoutMode: document.activeLayoutMode,
    tiledLayout: document.tiledLayout,
    spatialLayout: document.spatialLayout
  )
}
