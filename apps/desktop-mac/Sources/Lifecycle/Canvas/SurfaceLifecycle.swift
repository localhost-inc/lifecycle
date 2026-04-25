import LifecyclePresentation
import LifecycleTerminalHost

struct ClosedSurfaceSnapshot: Equatable {
  let workspaceID: String
  let surface: CanvasSurfaceRecord
  let groupID: String?
}

func lastClosedSurfaceIndex(
  in snapshots: [ClosedSurfaceSnapshot],
  workspaceID: String?
) -> Int? {
  snapshots.indices.reversed().first { index in
    guard let workspaceID else {
      return true
    }

    return snapshots[index].workspaceID == workspaceID
  }
}

@MainActor
extension AppModel {
  func closeActiveSurface(workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let surfaceID = activeCanvasSurfaceID(for: targetWorkspaceID)
    else {
      return
    }

    closeSurface(surfaceID, workspaceID: targetWorkspaceID)
  }

  func canReopenClosedSurface(workspaceID: String? = nil) -> Bool {
    lastClosedSurfaceIndex(
      in: closedSurfaceSnapshots,
      workspaceID: workspaceID ?? selectedWorkspaceID
    ) != nil
  }

  func reopenClosedSurface(workspaceID: String? = nil) {
    let targetWorkspaceID = workspaceID ?? selectedWorkspaceID
    guard let index = lastClosedSurfaceIndex(
      in: closedSurfaceSnapshots,
      workspaceID: targetWorkspaceID
    ) else {
      return
    }

    let snapshot = closedSurfaceSnapshots.remove(at: index)
    restoreSurface(snapshot)
    Task {
      await SurfaceRegistry.shared[snapshot.surface.surfaceKind]?.didReopen(
        record: snapshot.surface,
        context: SurfaceLifecycleContext(model: self, workspaceID: snapshot.workspaceID)
      )
    }
  }

  func closeSurface(_ surfaceID: String, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    guard let surface = recordClosedSurface(surfaceID, for: targetWorkspaceID) else {
      return
    }

    removeSurface(surfaceID, for: targetWorkspaceID)
    Task {
      await SurfaceRegistry.shared[surface.surfaceKind]?.didClose(
        record: surface,
        context: SurfaceLifecycleContext(model: self, workspaceID: targetWorkspaceID)
      )
    }
  }

  func detachTerminalSurface(record: CanvasSurfaceRecord, workspaceID: String) {
    terminalConnectionBySurfaceID.removeValue(forKey: record.id)
    LifecycleTerminalHostView.closeTerminal(withID: terminalHostID(for: record.id))
  }

  func attachSurfaceConnection(record: CanvasSurfaceRecord, workspaceID: String) async {
    do {
      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: record)
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  func recordClosedSurface(_ surfaceID: String, for workspaceID: String) -> CanvasSurfaceRecord? {
    guard let document = canvasDocument(for: workspaceID),
          let surface = document.surfacesByID[surfaceID]
    else {
      return nil
    }

    let groupID = groupIDContainingSurface(surfaceID, in: document)
    let snapshot = ClosedSurfaceSnapshot(
      workspaceID: workspaceID,
      surface: surface,
      groupID: groupID
    )

    closedSurfaceSnapshots.removeAll { $0.workspaceID == workspaceID && $0.surface.id == surfaceID }
    closedSurfaceSnapshots.append(snapshot)
    return surface
  }

  func restoreSurface(_ snapshot: ClosedSurfaceSnapshot) {
    closedSurfaceIDsByWorkspaceID[snapshot.workspaceID]?.remove(snapshot.surface.id)
    updateCanvasDocument(for: snapshot.workspaceID) { document in
      guard document.surfacesByID[snapshot.surface.id] == nil else {
        return document
      }

      return canvasDocumentAddingSurface(
        snapshot.surface,
        to: document,
        workspaceID: snapshot.workspaceID,
        groupID: snapshot.groupID
      )
    }
  }

  func removeSurface(_ surfaceID: String, for workspaceID: String) {
    closedSurfaceIDsByWorkspaceID[workspaceID, default: []].insert(surfaceID)
    updateCanvasDocument(for: workspaceID) { document in
      var groups = document.groupsByID
      let surfacesByID = document.surfacesByID.filter { $0.key != surfaceID }

      for (groupID, group) in groups {
        let nextSurfaceOrder = group.surfaceOrder.filter { $0 != surfaceID }
        let nextActiveSurfaceID = nextCanvasActiveSurfaceIDAfterClosing(
          surfaceID,
          in: group.surfaceOrder,
          activeSurfaceID: group.activeSurfaceID
        )
        groups[groupID] = CanvasGroup(
          id: group.id,
          surfaceOrder: nextSurfaceOrder,
          activeSurfaceID: nextActiveSurfaceID
        )
      }

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: groups,
        surfacesByID: surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }
  }
}
