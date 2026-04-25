import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func exportFeedbackBundle() {
    Task {
      await exportFeedbackBundleTask()
    }
  }

  func exportFeedbackBundleTask() async {
    let interval = AppSignpost.begin(.feedback, "Export Feedback Bundle")

    do {
      let destinationDirectory = try FeedbackExporter.chooseDestinationDirectory()
      let snapshot = await feedbackExportSnapshot()
      let bundleURL = try FeedbackExporter.export(snapshot: snapshot, into: destinationDirectory)
      AppLog.notice(.feedback, "Exported feedback bundle", metadata: ["path": bundleURL.path])
      NSWorkspace.shared.activateFileViewerSelecting([bundleURL])
    } catch FeedbackExporterError.userCancelled {
      AppLog.debug(.feedback, "Feedback export cancelled")
    } catch {
      reportError(error, category: .feedback, message: "Failed to export feedback bundle")
    }

    AppSignpost.end(interval)
  }

  func feedbackExportSnapshot() async -> FeedbackExportSnapshot {
    let exportedAt = Date()
    let bridge = await FeedbackExporter.captureBridgeDiagnostics(
      bridgeURL: bridgeURL,
      bridgePID: bridgePID
    )
    let logs = await AppLog.snapshot(limit: 400)

    return FeedbackExportSnapshot(
      exportedAt: exportedAt,
      build: AppBuildInfo.current(),
      environment: FeedbackExporter.filteredEnvironment(from: ProcessInfo.processInfo.environment),
      bridge: bridge,
      state: feedbackAppState(),
      logs: logs
    )
  }

  func feedbackAppState() -> FeedbackAppState {
    let repositorySummaries = repositories.map { repository in
      FeedbackAppState.RepositorySummary(
        id: repository.id,
        path: repository.path,
        workspaceIDs: repository.workspaces.map(\.id)
      )
    }

    let workspaceCount = repositories.reduce(into: 0) { partialResult, repository in
      partialResult += repository.workspaces.count
    }

    return FeedbackAppState(
      selectedRepositoryID: selectedRepositoryID,
      selectedWorkspaceID: selectedWorkspaceID,
      openedWorkspaceIDs: openedWorkspaceIDs.sorted(),
      repositoryCount: repositories.count,
      workspaceCount: workspaceCount,
      terminalSurfaceCount: canvasDocumentsByWorkspaceID.values.reduce(into: 0) { count, document in
        count += document.surfacesByID.values.filter { $0.surfaceKind == .terminal }.count
      },
      terminalConnectionCount: terminalConnectionBySurfaceID.count,
      agentCount: agentsByWorkspaceID.values.reduce(0) { $0 + $1.count },
      activeAgentHandleCount: agentHandlesByID.values.reduce(into: 0) { count, handle in
        if handle.state.snapshot != nil {
          count += 1
        }
      },
      bridgeSocketState: bridgeSocketStateLabel,
      errorMessage: errorMessage,
      lastFailureSummary: lastFailureSummary,
      repositories: repositorySummaries
    )
  }

  var bridgeSocketStateLabel: String {
    switch bridgeSocket.state {
    case .disconnected:
      return "disconnected"
    case .connecting:
      return "connecting"
    case .connected:
      return "connected"
    }
  }
}
