import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func clearError() {
    errorMessage = nil
  }

  func clearErrorIfVisible(for workspaceID: String) {
    if selectedWorkspaceID == workspaceID {
      clearError()
    }
  }

  func reportError(
    _ error: Error,
    category: AppLogCategory,
    message: String,
    workspaceID: String? = nil,
    metadata: [String: String] = [:]
  ) {
    var mergedMetadata = metadata
    if let workspaceID {
      mergedMetadata["workspaceID"] = workspaceID
    }

    AppLog.error(category, message, error: error, metadata: mergedMetadata)
    lastFailureSummary = "\(message): \(error.localizedDescription)"

    guard workspaceID == nil || selectedWorkspaceID == workspaceID else {
      return
    }

    errorMessage = error.localizedDescription
  }
}
