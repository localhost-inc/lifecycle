import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func stackSummary(for workspaceID: String) -> BridgeWorkspaceStackSummary? {
    stackSummaryByWorkspaceID[workspaceID]
  }

  func stackServicePhase(for workspaceID: String, serviceName: String) -> StackServicePhase? {
    stackServicePhasesByWorkspaceID[workspaceID]?[serviceName]
  }

  func hasStoppingServices(for workspaceID: String) -> Bool {
    stackServicePhasesByWorkspaceID[workspaceID]?.values.contains(.stopping) ?? false
  }

  func stackLogs(
    for workspaceID: String,
    serviceName: String? = nil,
    tail: Int = 120
  ) async throws -> [BridgeWorkspaceLogLine] {
    let response = try await withBridgeRequest { client in
      try await client.workspaceLogs(
        for: workspaceID,
        service: serviceName,
        tail: tail
      )
    }

    return response.lines
  }

  func isStackActionLoading(for workspaceID: String) -> Bool {
    stackLoadingWorkspaceIDs.contains(workspaceID)
  }

  func runPrimaryStackAction(workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let actionState = workspaceStackHeaderActionState(
            summary: stackSummaryByWorkspaceID[targetWorkspaceID],
            isMutating: stackLoadingWorkspaceIDs.contains(targetWorkspaceID),
            hasStoppingServices: hasStoppingServices(for: targetWorkspaceID)
          ),
          actionState.isEnabled
    else {
      return
    }

    beginStackLoading(for: targetWorkspaceID)
    Task {
      await performStackAction(actionState.kind, workspaceID: targetWorkspaceID)
    }
  }

  func beginStackLoading(for workspaceID: String) {
    let inserted = stackLoadingWorkspaceIDs.insert(workspaceID).inserted
    if inserted {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  func endStackLoading(for workspaceID: String) {
    if stackLoadingWorkspaceIDs.remove(workspaceID) != nil {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  func applyStackServiceSocketEvent(_ event: BridgeSocket.Event) {
    guard let resolved = stackServiceLifecycleEvent(from: event) else {
      return
    }

    let workspaceID = resolved.workspaceID
    let update = applyStackServiceLifecycleEvent(
      resolved.lifecycle,
      summary: stackSummaryByWorkspaceID[workspaceID],
      phases: stackServicePhasesByWorkspaceID[workspaceID] ?? [:]
    )

    stackSummaryByWorkspaceID[workspaceID] = update.summary
    if update.phases.isEmpty {
      stackServicePhasesByWorkspaceID.removeValue(forKey: workspaceID)
    } else {
      stackServicePhasesByWorkspaceID[workspaceID] = update.phases
    }
    syncWorkspaceStore(for: workspaceID)

    guard update.shouldReload else {
      return
    }

    Task {
      await loadStack(for: workspaceID, force: true)
    }
  }

  func loadStack(for workspaceID: String, force: Bool) async {
    if stackSummaryByWorkspaceID[workspaceID] != nil && !force {
      return
    }

    do {
      let summary = try await AppSignpost.withInterval(.workspace, "Load Stack") {
        try await withBridgeRequest { client in
          try await client.stack(for: workspaceID)
        }
      }

      stackSummaryByWorkspaceID[workspaceID] = summary
      syncWorkspaceStore(for: workspaceID)
      AppLog.info(
        .workspace,
        "Loaded stack summary",
        metadata: [
          "workspaceID": workspaceID,
          "nodeCount": String(summary.nodes.count),
          "state": summary.state,
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to load stack summary",
        workspaceID: workspaceID
      )
    }
  }

  func performStackAction(
    _ kind: WorkspaceStackHeaderActionKind,
    workspaceID: String
  ) async {
    defer {
      endStackLoading(for: workspaceID)
    }

    do {
      let response = try await AppSignpost.withInterval(
        .workspace,
        kind == .stop ? "Stop Stack" : "Start"
      ) {
        try await withBridgeRequest { client in
          switch kind {
          case .start, .starting:
            try await client.startStack(for: workspaceID)
          case .stop, .stopping:
            try await client.stopStack(for: workspaceID)
          }
        }
      }

      stackSummaryByWorkspaceID[workspaceID] = response.stack
      syncWorkspaceStore(for: workspaceID)
      clearErrorIfVisible(for: workspaceID)

      let actionLabel = kind == .stop ? "Stopped stack" : "Started stack"
      let serviceNames =
        if kind == .stop {
          response.stoppedServices ?? []
        } else {
          response.startedServices ?? []
        }

      AppLog.notice(
        .workspace,
        actionLabel,
        metadata: [
          "workspaceID": workspaceID,
          "services": serviceNames.isEmpty ? "none" : serviceNames.joined(separator: ","),
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: kind == .stop ? "Failed to stop stack" : "Failed to start stack",
        workspaceID: workspaceID
      )
    }
  }
}
