import Foundation

struct WorkspaceCanvasDocument {
  let activeGroupID: String?
  let groupsByID: [String: CanvasGroup]
  let surfacesByID: [String: CanvasSurfaceRecord]
  let layout: CanvasLayout
}

func defaultCanvasDocument(for workspaceID: String) -> WorkspaceCanvasDocument {
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
    layout: .tiled(.group(groupID))
  )
}

func normalizeCanvasDocument(
  _ document: WorkspaceCanvasDocument,
  workspaceID: String,
  surfaceOrderPreference: [String]
) -> WorkspaceCanvasDocument {
  var layout = document.layout
  var layoutGroupIDs = canvasGroupIDs(in: layout)

  if layoutGroupIDs.isEmpty || layoutGroupIDs.contains(where: { document.groupsByID[$0] == nil }) {
    let fallback = defaultCanvasDocument(for: workspaceID)
    layout = fallback.layout
    layoutGroupIDs = canvasGroupIDs(in: layout)
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
    layout = fallback.layout
    layoutGroupIDs = canvasGroupIDs(in: layout)
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
        let emptyGroupID = canvasGroupIDs(in: layout).first(where: { groupID in
          groups[groupID]?.surfaceOrder.isEmpty ?? true
        }),
        let nextLayout = removeGroupFromCanvasLayout(layout, groupID: emptyGroupID)
  {
    layout = nextLayout
    groups.removeValue(forKey: emptyGroupID)
  }

  layoutGroupIDs = canvasGroupIDs(in: layout)
  if layoutGroupIDs.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    return WorkspaceCanvasDocument(
      activeGroupID: fallback.activeGroupID,
      groupsByID: fallback.groupsByID,
      surfacesByID: document.surfacesByID,
      layout: fallback.layout
    )
  }

  groups = Dictionary<String, CanvasGroup>(
    uniqueKeysWithValues: layoutGroupIDs.compactMap { groupID in
      groups[groupID].map { (groupID, $0) }
    }
  )

  if groups.isEmpty {
    let fallback = defaultCanvasDocument(for: workspaceID)
    return WorkspaceCanvasDocument(
      activeGroupID: fallback.activeGroupID,
      groupsByID: fallback.groupsByID,
      surfacesByID: document.surfacesByID,
      layout: fallback.layout
    )
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

  return WorkspaceCanvasDocument(
    activeGroupID: activeGroupID,
    groupsByID: groups,
    surfacesByID: document.surfacesByID,
    layout: layout
  )
}

func defaultCanvasGroupID(for workspaceID: String) -> String {
  "group:\(workspaceID):root"
}

func createCanvasGroupID(for workspaceID: String) -> String {
  "group:\(workspaceID):\(UUID().uuidString.lowercased())"
}

func createCanvasSplitID(for workspaceID: String) -> String {
  "split:\(workspaceID):\(UUID().uuidString.lowercased())"
}

func orderedCanvasSurfaceIDs(
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

func activeCanvasSurfaceIDs(in document: WorkspaceCanvasDocument) -> [String] {
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

func reorderedCanvasSurfaceIDs(
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

func canvasGroupIDs(in layout: CanvasLayout) -> [String] {
  switch layout {
  case let .tiled(root):
    return canvasGroupIDs(in: root)
  case let .spatial(spatialLayout):
    return spatialLayout.framesByGroupID.keys.sorted()
  }
}

func canvasGroupIDs(in node: CanvasTiledLayoutNode) -> [String] {
  switch node {
  case let .group(groupID):
    return [groupID]
  case let .split(split):
    return canvasGroupIDs(in: split.first) + canvasGroupIDs(in: split.second)
  }
}

func splitCanvasLayout(
  _ layout: CanvasLayout,
  targetGroupID: String,
  newGroupID: String,
  direction: CanvasTiledLayoutSplit.Direction,
  splitID: String
) -> CanvasLayout {
  switch layout {
  case let .tiled(root):
    let replacement = CanvasTiledLayoutNode.split(
      CanvasTiledLayoutSplit(
        id: splitID,
        direction: direction,
        first: .group(targetGroupID),
        second: .group(newGroupID),
        ratio: 0.5
      )
    )
    return .tiled(
      replacingCanvasGroupNode(root, targetGroupID: targetGroupID, replacement: replacement)
    )
  case .spatial:
    return layout
  }
}

func removeGroupFromCanvasLayout(_ layout: CanvasLayout, groupID: String) -> CanvasLayout? {
  switch layout {
  case let .tiled(root):
    guard let nextRoot = removingCanvasGroupNode(root, targetGroupID: groupID) else {
      return nil
    }

    return .tiled(nextRoot)
  case .spatial:
    return layout
  }
}

func updateCanvasLayoutSplitRatio(
  _ layout: CanvasLayout,
  splitID: String,
  ratio: Double
) -> CanvasLayout {
  switch layout {
  case let .tiled(root):
    return .tiled(
      updatingCanvasSplitNode(root, splitID: splitID) { split in
        CanvasTiledLayoutSplit(
          id: split.id,
          direction: split.direction,
          first: split.first,
          second: split.second,
          ratio: ratio
        )
      }
    )
  case .spatial:
    return layout
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
