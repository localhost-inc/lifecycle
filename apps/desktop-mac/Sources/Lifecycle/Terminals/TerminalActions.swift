import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  var selectedTerminalEnvelope: BridgeWorkspaceTerminalsEnvelope? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return terminalEnvelopeByWorkspaceID[selectedWorkspaceID]
  }

  func terminalEnvelope(for workspaceID: String) -> BridgeWorkspaceTerminalsEnvelope? {
    terminalEnvelopeByWorkspaceID[workspaceID]
  }

  func beginTerminalLoading(for workspaceID: String) {
    let inserted = terminalLoadingWorkspaceIDs.insert(workspaceID).inserted
    if inserted {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  func endTerminalLoading(for workspaceID: String) {
    if terminalLoadingWorkspaceIDs.remove(workspaceID) != nil {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  func createTerminalTab(
    kind: BridgeTerminalKind? = nil,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    beginTerminalLoading(for: targetWorkspaceID)
    Task {
      await createTerminalTab(for: targetWorkspaceID, kind: kind, title: nil, groupID: groupID)
    }
  }

  func splitGroup(
    _ groupID: String,
    direction: CanvasTiledLayoutSplit.Direction,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    beginTerminalLoading(for: targetWorkspaceID)
    Task {
      await splitGroup(groupID, direction: direction, for: targetWorkspaceID)
    }
  }

  func loadTerminals(for workspaceID: String, force: Bool) async {
    if terminalEnvelopeByWorkspaceID[workspaceID] != nil && !force {
      await refreshTerminals(for: workspaceID, showLoading: false)
      return
    }

    await refreshTerminals(for: workspaceID, showLoading: true)
  }

  func ensureInitialTerminalTabIfNeeded(for workspaceID: String) async {
    guard pendingInitialTerminalWorkspaceIDs.contains(workspaceID) else {
      return
    }

    let canvasDocument = canvasDocumentsByWorkspaceID[workspaceID]
    let terminalEnvelope = terminalEnvelopeByWorkspaceID[workspaceID]

    if shouldAutoCreateInitialTerminal(
      isPendingInitialTerminal: true,
      canvasDocument: canvasDocument,
      terminalEnvelope: terminalEnvelope
    ) {
      beginTerminalLoading(for: workspaceID)
      await createTerminalTab(for: workspaceID, kind: nil, title: nil, groupID: nil)
    }

    let hasCanvasSurfaces = !(canvasDocumentsByWorkspaceID[workspaceID]?.surfacesByID.isEmpty ?? true)
    let hasTerminals = !(terminalEnvelopeByWorkspaceID[workspaceID]?.terminals.isEmpty ?? true)
    let cannotCreateTerminal =
      (terminalEnvelopeByWorkspaceID[workspaceID]?.runtime.launchError != nil) ||
      (terminalEnvelopeByWorkspaceID[workspaceID]?.runtime.supportsCreate == false)

    if hasCanvasSurfaces || hasTerminals || cannotCreateTerminal {
      pendingInitialTerminalWorkspaceIDs.remove(workspaceID)
    }
  }

  func refreshTerminals(for workspaceID: String, showLoading: Bool) async {
    if showLoading {
      beginTerminalLoading(for: workspaceID)
    }

    defer {
      if showLoading {
        endTerminalLoading(for: workspaceID)
      }
    }

    do {
      let loadedEnvelope = try await AppSignpost.withInterval(.terminal, "Load Terminals") {
        try await withBridgeRequest { client in
          try await client.terminals(for: workspaceID)
        }
      }
      let envelope: BridgeWorkspaceTerminalsEnvelope
      do {
        let activity = try await withBridgeRequest { client in
          try await client.activity(for: workspaceID)
        }
        envelope = mergeTerminalEnvelopeActivity(envelope: loadedEnvelope, activity: activity)
      } catch {
        envelope = loadedEnvelope
        AppLog.notice(
          .terminal,
          "Failed to load terminal activity snapshot",
          metadata: ["workspaceID": workspaceID]
        )
      }
      terminalEnvelopeByWorkspaceID[workspaceID] = envelope
      syncCanvasDocument(for: workspaceID)
      try await ensureSurfaceConnections(for: workspaceID)
      clearErrorIfVisible(for: workspaceID)
      AppLog.info(
        .terminal,
        "Loaded terminals",
        metadata: [
          "workspaceID": workspaceID,
          "terminalCount": String(envelope.terminals.count),
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  func createTerminalTab(
    for workspaceID: String,
    kind: BridgeTerminalKind?,
    title: String?,
    groupID: String?
  ) async {
    defer {
      endTerminalLoading(for: workspaceID)
    }

    do {
      let terminals = terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
      let created = try await AppSignpost.withInterval(.terminal, "Create Terminal Tab") {
        try await withBridgeRequest { client in
          try await client.createTerminal(
            for: workspaceID,
            kind: kind,
            title: title ?? nextTerminalCreationTitle(from: terminals, kind: kind)
          )
        }
      }
      upsertTerminalEnvelope(created, for: workspaceID)

      let surfaceRecord = terminalSurfaceRecord(for: workspaceID, terminal: created.terminal)
      updateCanvasDocument(for: workspaceID) { document in
        canvasDocumentAddingSurface(
          surfaceRecord,
          to: document,
          workspaceID: workspaceID,
          groupID: groupID
        )
      }

      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
      await refreshTerminals(for: workspaceID, showLoading: false)
      AppLog.notice(
        .terminal,
        "Created terminal tab",
        metadata: [
          "workspaceID": workspaceID,
          "terminalID": created.terminal.id,
          "kind": kind?.rawValue ?? "default",
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  func splitGroup(
    _ groupID: String,
    direction: CanvasTiledLayoutSplit.Direction,
    for workspaceID: String
  ) async {
    defer {
      endTerminalLoading(for: workspaceID)
    }

    do {
      let created = try await AppSignpost.withInterval(.terminal, "Split Group") {
        try await withBridgeRequest { client in
          try await client.createTerminal(
            for: workspaceID,
            kind: .shell,
            title: nextShellTerminalTitle(
              from: self.terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
            )
          )
        }
      }
      upsertTerminalEnvelope(created, for: workspaceID)

      updateCanvasDocument(for: workspaceID) { document in
        guard document.groupsByID[groupID] != nil else {
          return document
        }

        let newGroupID = createCanvasGroupID(for: workspaceID)
        let surfaceRecord = terminalSurfaceRecord(for: workspaceID, terminal: created.terminal)
        var groups = document.groupsByID
        var surfacesByID = document.surfacesByID
        groups[newGroupID] = CanvasGroup(
          id: newGroupID,
          surfaceOrder: [surfaceRecord.id],
          activeSurfaceID: surfaceRecord.id
        )
        surfacesByID[surfaceRecord.id] = surfaceRecord
        let nextSpatialLayout = canvasSpatialLayoutPlacingGroup(
          document.spatialLayout,
          groupID: newGroupID,
          adjacentTo: groupID,
          direction: direction,
          placeBefore: false
        )

        return WorkspaceCanvasDocument(
          activeGroupID: newGroupID,
          groupsByID: groups,
          surfacesByID: surfacesByID,
          activeLayoutMode: document.activeLayoutMode,
          tiledLayout: splitCanvasTiledLayout(
            document.tiledLayout,
            targetGroupID: groupID,
            newGroupID: newGroupID,
            direction: direction,
            splitID: createCanvasSplitID(for: workspaceID)
          ),
          spatialLayout: nextSpatialLayout
        )
      }

      try await ensureSurfaceConnections(for: workspaceID)
      await refreshTerminals(for: workspaceID, showLoading: false)
      AppLog.notice(
        .terminal,
        "Split group with new terminal",
        metadata: [
          "workspaceID": workspaceID,
          "sourceGroupID": groupID,
          "terminalID": created.terminal.id,
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  func handleTerminalError(_ error: Error, workspaceID: String) {
    reportError(
      error,
      category: .terminal,
      message: "Terminal runtime operation failed",
      workspaceID: workspaceID
    )
  }

  func upsertTerminalEnvelope(
    _ created: BridgeWorkspaceTerminalEnvelope,
    for workspaceID: String
  ) {
    let current = terminalEnvelopeByWorkspaceID[workspaceID]
    var terminals = current?.terminals ?? []
    terminals.removeAll { $0.id == created.terminal.id }
    terminals.append(created.terminal)

    terminalEnvelopeByWorkspaceID[workspaceID] = BridgeWorkspaceTerminalsEnvelope(
      workspace: current?.workspace ?? created.workspace,
      runtime: created.runtime,
      terminals: terminals
    )
  }

  func terminalSurfaceRecord(
    for workspaceID: String,
    terminal: BridgeTerminalRecord
  ) -> CanvasSurfaceRecord {
    let binding = TerminalSurfaceBinding(
      workspaceID: workspaceID,
      terminalID: terminal.id
    )
    return CanvasSurfaceRecord(
      id: terminalSurfaceID(for: workspaceID, terminalID: terminal.id),
      title: terminal.title,
      surfaceKind: .terminal,
      binding: binding.surfaceBinding
    )
  }

  func surfaceOrderPreference(for workspaceID: String) -> [String] {
    (terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []).map { terminal in
      terminalSurfaceID(for: workspaceID, terminalID: terminal.id)
    }
  }

  func ensureSurfaceConnections(for workspaceID: String) async throws {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID]
    else {
      return
    }

    let validSurfaceIDs = Set(document.surfacesByID.keys)
    for (surfaceID, connection) in terminalConnectionBySurfaceID where
      surfaceID.hasPrefix("surface:\(workspaceID):") && !validSurfaceIDs.contains(surfaceID)
    {
      let terminalID = document.surfacesByID[surfaceID].flatMap { surfaceRecord -> String? in
        TerminalSurfaceBinding(binding: surfaceRecord.binding)?.terminalID
      } ?? connection.terminalID

      let _: Void? = try? await withBridgeRequest { client in
        try await client.disconnectTerminal(
          for: workspaceID,
          terminalID: terminalID,
          connectionID: connection.connectionID
        )
      }
      terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    }

    for surfaceRecord in document.surfacesByID.values {
      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
    }
  }

  func ensureSurfaceConnection(
    for workspaceID: String,
    surfaceRecord: CanvasSurfaceRecord
  ) async throws {
    guard terminalConnectionBySurfaceID[surfaceRecord.id] == nil else {
      return
    }

    switch surfaceRecord.surfaceKind {
    case .terminal:
      guard let terminalBinding = TerminalSurfaceBinding(binding: surfaceRecord.binding) else {
        return
      }

      let response = try await AppSignpost.withInterval(.terminal, "Attach Terminal Surface") {
        try await withBridgeRequest { client in
          try await client.connectTerminal(
            for: workspaceID,
            terminalID: terminalBinding.terminalID,
            clientID: surfaceRecord.id
          )
        }
      }

      if let launchError = response.connection.launchError {
        throw NSError(
          domain: "Lifecycle.Terminal",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: launchError]
        )
      }

      terminalConnectionBySurfaceID[surfaceRecord.id] = response.connection
      AppLog.info(
        .terminal,
        "Attached terminal surface connection",
        metadata: [
          "workspaceID": workspaceID,
          "surfaceID": surfaceRecord.id,
          "terminalID": terminalBinding.terminalID,
          "connectionID": response.connection.connectionID,
        ]
      )
    default:
      break
    }
  }

  func disconnectSurfaceConnection(
    for workspaceID: String,
    terminalID: String,
    surfaceID: String
  ) async throws {
    guard let connection = terminalConnectionBySurfaceID[surfaceID] else {
      return
    }

    let _: Void = try await withBridgeRequest { client in
      try await client.disconnectTerminal(
        for: workspaceID,
        terminalID: terminalID,
        connectionID: connection.connectionID
      )
    }
    terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    AppLog.debug(
      .terminal,
      "Disconnected terminal surface connection",
      metadata: [
        "workspaceID": workspaceID,
        "surfaceID": surfaceID,
        "terminalID": terminalID,
        "connectionID": connection.connectionID,
      ]
    )
  }
}
