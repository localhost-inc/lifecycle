import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func setDraggingSurfaceID(_ surfaceID: String?) {
    guard draggingSurfaceID != surfaceID else {
      return
    }

    draggingSurfaceID = surfaceID
    syncAllWorkspaceStores()
  }

  func canvasState() -> CanvasState? {
    guard let selectedWorkspaceID else { return nil }
    return canvasState(for: selectedWorkspaceID)
  }

  func canvasDocument(for workspaceID: String) -> WorkspaceCanvasDocument? {
    canvasDocumentsByWorkspaceID[workspaceID]
  }

  func canvasState(for workspaceID: String) -> CanvasState? {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surfacesByID = resolveCanvasSurfaces(for: workspaceID, document: document),
          !surfacesByID.isEmpty
    else {
      return nil
    }

    return CanvasState(
      activeGroupID: document.activeGroupID,
      groupsByID: document.groupsByID,
      surfacesByID: surfacesByID,
      activeLayoutMode: document.activeLayoutMode,
      tiledLayout: document.tiledLayout,
      spatialLayout: document.spatialLayout
    )
  }

  func canvasLayoutMode(for workspaceID: String) -> CanvasLayoutMode {
    canvasDocumentsByWorkspaceID[workspaceID]?.activeLayoutMode ?? .tiled
  }

  func activeCanvasGroupID(for workspaceID: String? = nil) -> String? {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let canvasState = canvasState(for: targetWorkspaceID)
    else {
      return nil
    }

    if let activeGroupID = canvasState.activeGroupID,
       canvasState.groupsByID[activeGroupID] != nil
    {
      return activeGroupID
    }

    return canvasGroupIDs(in: canvasState.layout).first
  }

  func activeCanvasSurfaceID(for workspaceID: String? = nil) -> String? {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let canvasState = canvasState(for: targetWorkspaceID),
          let groupID = activeCanvasGroupID(for: targetWorkspaceID),
          let group = canvasState.groupsByID[groupID]
    else {
      return nil
    }

    if let activeSurfaceID = group.activeSurfaceID,
       canvasState.surfacesByID[activeSurfaceID] != nil
    {
      return activeSurfaceID
    }

    return group.surfaceOrder.first
  }

  func canCloseActiveSurface(workspaceID: String? = nil) -> Bool {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let canvasState = canvasState(for: targetWorkspaceID),
          let surfaceID = activeCanvasSurfaceID(for: targetWorkspaceID),
          let surface = canvasState.surfacesByID[surfaceID]
    else {
      return false
    }

    return surface.isClosable
  }

  func splitActiveGroup(
    _ direction: CanvasTiledLayoutSplit.Direction,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let groupID = activeCanvasGroupID(for: targetWorkspaceID)
    else {
      return
    }

    splitGroup(groupID, direction: direction, workspaceID: targetWorkspaceID)
  }

  var cachedWorkspaceIDs: [String] {
    openedWorkspaceIDs.filter { canvasDocumentsByWorkspaceID[$0] != nil }.sorted()
  }

  func selectSurface(
    _ surfaceID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    if let document = canvasDocumentsByWorkspaceID[targetWorkspaceID],
       let surface = document.surfacesByID[surfaceID],
       surface.surfaceKind == .agent,
       let binding = AgentSurfaceBinding(binding: surface.binding)
    {
      enterAgent(
        agentID: binding.agentID,
        workspaceID: targetWorkspaceID,
        groupID: groupID,
        preferredSurfaceID: surfaceID
      )
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard let targetGroupID = groupID ?? groupIDContainingSurface(surfaceID, in: document),
            let group = document.groupsByID[targetGroupID],
            group.surfaceOrder.contains(surfaceID)
      else {
        return document
      }

      var groups = document.groupsByID
      groups[targetGroupID] = CanvasGroup(
        id: group.id,
        surfaceOrder: group.surfaceOrder,
        activeSurfaceID: surfaceID
      )

      let nextSpatialLayout =
        if document.activeLayoutMode == .spatial {
          canvasSpatialLayoutBringingGroupToFront(document.spatialLayout, groupID: targetGroupID)
        } else {
          document.spatialLayout
        }

      return WorkspaceCanvasDocument(
        activeGroupID: targetGroupID,
        groupsByID: groups,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: nextSpatialLayout
      )
    }
  }

  func selectGroup(_ groupID: String, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      let resolvedGroupID = document.groupsByID[groupID] == nil ? document.activeGroupID : groupID
      let nextSpatialLayout =
        if document.activeLayoutMode == .spatial, let resolvedGroupID {
          canvasSpatialLayoutBringingGroupToFront(document.spatialLayout, groupID: resolvedGroupID)
        } else {
          document.spatialLayout
        }

      return WorkspaceCanvasDocument(
        activeGroupID: resolvedGroupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: nextSpatialLayout
      )
    }
  }

  func setCanvasLayoutMode(_ mode: CanvasLayoutMode, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard document.activeLayoutMode != mode else {
        return document
      }

      let nextSpatialLayout =
        if mode == .spatial,
           let activeGroupID = document.activeGroupID ?? canvasGroupIDs(in: document.tiledLayout).first
        {
          canvasSpatialLayoutBringingGroupToFront(document.spatialLayout, groupID: activeGroupID)
        } else {
          document.spatialLayout
        }

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: mode,
        tiledLayout: document.tiledLayout,
        spatialLayout: nextSpatialLayout
      )
    }
  }

  func setSpatialGroupFrame(
    _ groupID: String,
    frame: CanvasSpatialFrame,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard document.groupsByID[groupID] != nil else {
        return document
      }

      return WorkspaceCanvasDocument(
        activeGroupID: groupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: canvasSpatialLayoutUpdatingFrame(
          canvasSpatialLayoutBringingGroupToFront(document.spatialLayout, groupID: groupID),
          groupID: groupID,
          frame: frame
        )
      )
    }
  }

  func setSplitRatio(_ splitID: String, ratio: Double, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: updateCanvasTiledLayoutSplitRatio(
          document.tiledLayout,
          splitID: splitID,
          ratio: ratio
        ),
        spatialLayout: document.spatialLayout
      )
    }
  }

  func reorderSurface(
    surfaceID: String,
    onto targetSurfaceID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          surfaceID != targetSurfaceID
    else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard let targetGroupID = groupID ?? groupIDContainingSurface(surfaceID, in: document),
            let group = document.groupsByID[targetGroupID],
            group.surfaceOrder.contains(surfaceID),
            group.surfaceOrder.contains(targetSurfaceID)
      else {
        return document
      }

      var groups = document.groupsByID
      groups[targetGroupID] = CanvasGroup(
        id: group.id,
        surfaceOrder: reorderedCanvasSurfaceIDs(
          group.surfaceOrder,
          movingSurfaceID: surfaceID,
          targetSurfaceID: targetSurfaceID
        ),
        activeSurfaceID: group.activeSurfaceID
      )

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: groups,
        surfacesByID: document.surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }
  }

  func dropSurface(
    surfaceID: String,
    onGroupID targetGroupID: String,
    edge: CanvasDropEdge,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      moveSurfaceToEdge(
        in: document,
        surfaceID: surfaceID,
        targetGroupID: targetGroupID,
        edge: edge,
        workspaceID: targetWorkspaceID
      )
    }
  }

  func syncCanvasDocument(for workspaceID: String) {
    let baseDocument = sanitizedCanvasDocument(
      canvasDocumentsByWorkspaceID[workspaceID] ?? defaultCanvasDocument(for: workspaceID),
      workspaceID: workspaceID
    )
    let envelope = terminalEnvelopeByWorkspaceID[workspaceID]
    let closedSurfaceIDs = closedSurfaceIDsByWorkspaceID[workspaceID] ?? []
    let terminalSurfaceRecords: [CanvasSurfaceRecord] =
      if let envelope, envelope.runtime.launchError == nil {
        envelope.terminals
          .map { terminalSurfaceRecord(for: workspaceID, terminal: $0) }
          .filter { !closedSurfaceIDs.contains($0.id) }
      } else {
        []
      }
    let nextDocument = synchronizedCanvasDocument(
      baseDocument,
      workspaceID: workspaceID,
      terminalSurfaceRecords: terminalSurfaceRecords,
      liveAgentIDs: Set(agentsByWorkspaceID[workspaceID]?.map(\.id) ?? []),
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )

    let staleSurfaceIDs = Set(baseDocument.surfacesByID.keys).subtracting(Set(nextDocument.surfacesByID.keys))
    for surfaceID in staleSurfaceIDs {
      terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    }

    canvasDocumentsByWorkspaceID[workspaceID] = nextDocument
    persistCanvasDocuments()
  }

  func updateCanvasDocument(
    for workspaceID: String,
    _ transform: (WorkspaceCanvasDocument) -> WorkspaceCanvasDocument
  ) {
    let document = sanitizedCanvasDocument(
      canvasDocumentsByWorkspaceID[workspaceID] ?? defaultCanvasDocument(for: workspaceID),
      workspaceID: workspaceID
    )
    canvasDocumentsByWorkspaceID[workspaceID] = normalizeCanvasDocument(
      sanitizedCanvasDocument(transform(document), workspaceID: workspaceID),
      workspaceID: workspaceID,
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )
    persistCanvasDocuments()
  }

  func restorePersistedCanvasDocuments(validWorkspaceIDs: Set<String>) {
    if !didRestorePersistedCanvasDocuments {
      do {
        let persistedState = try WorkspaceCanvasDocumentStore.readState()
        canvasDocumentsByWorkspaceID = persistedState.documentsByWorkspaceID.reduce(into: [:]) { partialResult, entry in
          guard validWorkspaceIDs.contains(entry.key) else {
            return
          }
          partialResult[entry.key] = sanitizedCanvasDocument(entry.value, workspaceID: entry.key)
        }
        closedSurfaceIDsByWorkspaceID = persistedState.closedSurfaceIDsByWorkspaceID.filter { entry in
          validWorkspaceIDs.contains(entry.key)
        }
        openedWorkspaceIDs.formUnion(canvasDocumentsByWorkspaceID.keys)
        didRestorePersistedCanvasDocuments = true

        if canvasDocumentsByWorkspaceID.count != persistedState.documentsByWorkspaceID.count ||
          closedSurfaceIDsByWorkspaceID.count != persistedState.closedSurfaceIDsByWorkspaceID.count
        {
          persistCanvasDocuments()
        }
      } catch {
        didRestorePersistedCanvasDocuments = true
        AppLog.error(.workspace, "Failed to restore persisted canvas documents", error: error)
      }
      return
    }

    let filteredDocuments: [String: WorkspaceCanvasDocument] = canvasDocumentsByWorkspaceID.reduce(
      into: [:]
    ) { partialResult, entry in
      guard validWorkspaceIDs.contains(entry.key) else {
        return
      }
      partialResult[entry.key] = sanitizedCanvasDocument(entry.value, workspaceID: entry.key)
    }
    let filteredClosedSurfaceIDs = closedSurfaceIDsByWorkspaceID.filter { entry in
      validWorkspaceIDs.contains(entry.key)
    }
    guard filteredDocuments.count != canvasDocumentsByWorkspaceID.count ||
      filteredClosedSurfaceIDs.count != closedSurfaceIDsByWorkspaceID.count
    else {
      return
    }

    canvasDocumentsByWorkspaceID = filteredDocuments
    closedSurfaceIDsByWorkspaceID = filteredClosedSurfaceIDs
    openedWorkspaceIDs.formIntersection(validWorkspaceIDs)
    persistCanvasDocuments()
  }

  func persistCanvasDocuments() {
    do {
      let persistedClosedSurfaceIDs = closedSurfaceIDsByWorkspaceID.filter { !$0.value.isEmpty }
      try WorkspaceCanvasDocumentStore.writeState(
        WorkspaceCanvasDocumentStoreState(
          documentsByWorkspaceID: canvasDocumentsByWorkspaceID,
          closedSurfaceIDsByWorkspaceID: persistedClosedSurfaceIDs
        )
      )
    } catch {
      AppLog.error(.workspace, "Failed to persist canvas documents", error: error)
    }
  }

  func sanitizedCanvasDocument(
    _ document: WorkspaceCanvasDocument,
    workspaceID: String
  ) -> WorkspaceCanvasDocument {
    guard !customAgentActionsEnabled else {
      return document
    }

    let surfacesByID = document.surfacesByID.filter { $0.value.surfaceKind != .agent }
    return normalizeCanvasDocument(
      WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: document.groupsByID,
        surfacesByID: surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      ),
      workspaceID: workspaceID,
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )
  }

  func resolveCanvasSurfaces(
    for workspaceID: String,
    document: WorkspaceCanvasDocument
  ) -> [String: CanvasSurface]? {
    guard let workspace = workspaceSummary(for: workspaceID) else {
      return nil
    }

    let envelope = terminalEnvelopeByWorkspaceID[workspaceID]
    let workingDirectory =
      envelope?.workspace.cwd ??
      envelope?.workspace.workspaceRoot ??
      workspace.path ??
      FileManager.default.homeDirectoryForCurrentUser.path

    let context = SurfaceResolutionContext(
      model: self,
      workspace: workspace,
      workspaceID: workspaceID,
      workingDirectory: workingDirectory,
      themeConfigPath: terminalThemeContext.themeConfigPath,
      terminalBackgroundHexColor: terminalThemeContext.backgroundHexColor,
      terminalDarkAppearance: terminalThemeContext.darkAppearance,
      backendLabel: envelope?.runtime.launchError == nil ? envelope?.runtime.backendLabel : nil,
      persistent: envelope?.runtime.launchError == nil ? envelope?.runtime.persistent : nil,
      agentsByID: Dictionary(
        uniqueKeysWithValues: (agentsByWorkspaceID[workspaceID] ?? []).map { ($0.id, $0) }
      ),
      terminalsByID: Dictionary(uniqueKeysWithValues: (envelope?.terminals ?? []).map { ($0.id, $0) }),
      connectionBySurfaceID: terminalConnectionBySurfaceID
    )

    let surfaces = document.surfacesByID.values.map { record -> (String, CanvasSurface) in
      let resolved =
        SurfaceRegistry.shared[record.surfaceKind]?.resolve(record: record, context: context) ??
        unresolvedCanvasSurface(record: record)

      return (
        record.id,
        CanvasSurface(
          id: record.id,
          surfaceKind: record.surfaceKind,
          record: record,
          content: resolved.content,
          tabPresentation: resolved.tab,
          isClosable: resolved.isClosable
        )
      )
    }

    return surfaces.isEmpty ? nil : Dictionary(uniqueKeysWithValues: surfaces)
  }

  func groupIDContainingSurface(
    _ surfaceID: String,
    in document: WorkspaceCanvasDocument
  ) -> String? {
    canvasGroupIDs(in: document.layout).first { groupID in
      document.groupsByID[groupID]?.surfaceOrder.contains(surfaceID) == true
    }
  }
}
