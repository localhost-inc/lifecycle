import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func gitSnapshot(for workspaceID: String) -> BridgeWorkspaceGitResponse? {
    gitSnapshotByWorkspaceID[workspaceID]
  }

  func isGitLoading(for workspaceID: String) -> Bool {
    gitLoadingWorkspaceIDs.contains(workspaceID)
  }

  func refreshGit(for workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    Task {
      await loadGit(for: targetWorkspaceID, force: true)
    }
  }

  func loadGit(for workspaceID: String, force: Bool) async {
    if gitSnapshotByWorkspaceID[workspaceID] != nil && !force {
      return
    }

    let inserted = gitLoadingWorkspaceIDs.insert(workspaceID).inserted
    if inserted {
      syncWorkspaceStore(for: workspaceID)
    }
    defer {
      if gitLoadingWorkspaceIDs.remove(workspaceID) != nil {
        syncWorkspaceStore(for: workspaceID)
      }
    }

    do {
      let snapshot = try await AppSignpost.withInterval(.workspace, "Load Git") {
        try await withBridgeRequest { client in
          try await client.git(for: workspaceID)
        }
      }

      gitSnapshotByWorkspaceID[workspaceID] = snapshot
      syncWorkspaceStore(for: workspaceID)
      AppLog.info(
        .workspace,
        "Loaded git snapshot",
        metadata: [
          "workspaceID": workspaceID,
          "branch": snapshot.status.branch ?? "detached",
          "fileCount": String(snapshot.status.files.count),
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to load git snapshot",
        workspaceID: workspaceID
      )
    }
  }
}
