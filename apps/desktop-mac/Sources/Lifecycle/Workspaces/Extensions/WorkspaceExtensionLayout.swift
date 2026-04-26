import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func extensionSidebarState(for workspaceID: String? = nil) -> WorkspaceExtensionSidebarState? {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let context = workspaceExtensionContext(for: targetWorkspaceID)
    else {
      return nil
    }

    return WorkspaceExtensionSidebarState(
      workspaceID: targetWorkspaceID,
      extensions: WorkspaceExtensionRegistry.shared.resolveExtensions(context: context),
      activeKind: activeExtensionKindByWorkspaceID[targetWorkspaceID]
    )
  }

  func selectExtension(_ kind: WorkspaceExtensionKind, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    activeExtensionKindByWorkspaceID[targetWorkspaceID] = kind
    persistExtensionSidebarLayoutState()
    syncWorkspaceStore(for: targetWorkspaceID)
  }

  func collapsedExtensionKinds(for workspaceID: String) -> Set<WorkspaceExtensionKind> {
    collapsedExtensionKindsByWorkspaceID[workspaceID] ?? []
  }

  func setCollapsedExtensionKinds(
    _ collapsedKinds: Set<WorkspaceExtensionKind>,
    workspaceID: String
  ) {
    guard collapsedExtensionKindsByWorkspaceID[workspaceID] != collapsedKinds else {
      return
    }

    collapsedExtensionKindsByWorkspaceID[workspaceID] = collapsedKinds
    persistExtensionSidebarLayoutState()
    syncWorkspaceStore(for: workspaceID)
  }

  func toggleExtensionPanelCollapsed(_ kind: WorkspaceExtensionKind, workspaceID: String) {
    var collapsedKinds = collapsedExtensionKinds(for: workspaceID)
    if collapsedKinds.contains(kind) {
      collapsedKinds.remove(kind)
    } else {
      collapsedKinds.insert(kind)
    }
    setCollapsedExtensionKinds(collapsedKinds, workspaceID: workspaceID)
  }

  func appSidebarWidth(availableWidth: CGFloat? = nil) -> CGFloat {
    guard let availableWidth else {
      return appSidebarWidthValue
    }

    return clampedAppSidebarWidth(appSidebarWidthValue, availableWidth: availableWidth)
  }

  func extensionSidebarWidth(for workspaceID: String? = nil, availableWidth: CGFloat? = nil) -> CGFloat {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return defaultWorkspaceExtensionSidebarWidth
    }

    let storedWidth = extensionSidebarWidthByWorkspaceID[targetWorkspaceID] ??
      defaultWorkspaceExtensionSidebarWidth
    guard let availableWidth else {
      return storedWidth
    }

    return clampedWorkspaceExtensionSidebarWidth(storedWidth, availableWidth: availableWidth)
  }

  func setExtensionSidebarWidth(
    _ width: CGFloat,
    workspaceID: String? = nil,
    availableWidth: CGFloat? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    let nextWidth =
      if let availableWidth {
        clampedWorkspaceExtensionSidebarWidth(width, availableWidth: availableWidth)
      } else {
        min(max(width, minimumWorkspaceExtensionSidebarWidth), maximumWorkspaceExtensionSidebarWidth)
      }

    guard extensionSidebarWidthByWorkspaceID[targetWorkspaceID] != nextWidth else {
      return
    }

    extensionSidebarWidthByWorkspaceID[targetWorkspaceID] = nextWidth
    persistExtensionSidebarLayoutState()
  }

  func restorePersistedExtensionSidebarLayoutState(validWorkspaceIDs: Set<String>) {
    if !didRestorePersistedExtensionSidebarLayoutState {
      do {
        let persistedLayout = try WorkspaceExtensionSidebarLayoutStore.read()
        let restoredLayout = persistedLayout.filter { validWorkspaceIDs.contains($0.key) }
        applyExtensionSidebarLayoutState(restoredLayout)
        didRestorePersistedExtensionSidebarLayoutState = true

        if persistedLayout.count != restoredLayout.count {
          persistExtensionSidebarLayoutState()
        }
      } catch {
        didRestorePersistedExtensionSidebarLayoutState = true
        AppLog.error(.workspace, "Failed to restore extension sidebar layout state", error: error)
      }
      return
    }

    let filteredActiveExtensions = activeExtensionKindByWorkspaceID.filter { validWorkspaceIDs.contains($0.key) }
    let filteredCollapsedExtensions = collapsedExtensionKindsByWorkspaceID.filter { validWorkspaceIDs.contains($0.key) }
    let filteredWidths = extensionSidebarWidthByWorkspaceID.filter { validWorkspaceIDs.contains($0.key) }

    guard filteredActiveExtensions.count != activeExtensionKindByWorkspaceID.count ||
      filteredCollapsedExtensions.count != collapsedExtensionKindsByWorkspaceID.count ||
      filteredWidths.count != extensionSidebarWidthByWorkspaceID.count
    else {
      return
    }

    activeExtensionKindByWorkspaceID = filteredActiveExtensions
    collapsedExtensionKindsByWorkspaceID = filteredCollapsedExtensions
    extensionSidebarWidthByWorkspaceID = filteredWidths
    persistExtensionSidebarLayoutState()
    syncAllWorkspaceStores()
  }

  func applyExtensionSidebarLayoutState(
    _ layoutByWorkspaceID: [String: WorkspaceExtensionSidebarLayoutState]
  ) {
    activeExtensionKindByWorkspaceID = layoutByWorkspaceID.reduce(into: [:]) { partialResult, entry in
      if let activeKind = entry.value.activeKind {
        partialResult[entry.key] = activeKind
      }
    }
    collapsedExtensionKindsByWorkspaceID = layoutByWorkspaceID.reduce(into: [:]) { partialResult, entry in
      if !entry.value.collapsedKinds.isEmpty {
        partialResult[entry.key] = entry.value.collapsedKinds
      }
    }
    extensionSidebarWidthByWorkspaceID = layoutByWorkspaceID.reduce(into: [:]) { partialResult, entry in
      if let width = entry.value.width {
        partialResult[entry.key] = min(
          max(width, minimumWorkspaceExtensionSidebarWidth),
          maximumWorkspaceExtensionSidebarWidth
        )
      }
    }
    syncAllWorkspaceStores()
  }

  func persistExtensionSidebarLayoutState() {
    guard didRestorePersistedExtensionSidebarLayoutState else {
      return
    }

    let workspaceIDs = Set(activeExtensionKindByWorkspaceID.keys)
      .union(collapsedExtensionKindsByWorkspaceID.keys)
      .union(extensionSidebarWidthByWorkspaceID.keys)
    let layoutByWorkspaceID = workspaceIDs.reduce(into: [:]) { partialResult, workspaceID in
      partialResult[workspaceID] = WorkspaceExtensionSidebarLayoutState(
        activeKind: activeExtensionKindByWorkspaceID[workspaceID],
        collapsedKinds: collapsedExtensionKindsByWorkspaceID[workspaceID] ?? [],
        width: extensionSidebarWidthByWorkspaceID[workspaceID]
      )
    }

    do {
      try WorkspaceExtensionSidebarLayoutStore.write(layoutByWorkspaceID)
    } catch {
      AppLog.error(.workspace, "Failed to persist extension sidebar layout state", error: error)
    }
  }

  func workspaceExtensionContext(for workspaceID: String) -> WorkspaceExtensionContext? {
    guard let workspace = workspaceSummary(for: workspaceID) else {
      return nil
    }

    let repository = repositories.first { repository in
      repository.workspaces.contains(where: { $0.id == workspaceID })
    }

    return WorkspaceExtensionContext(
      model: self,
      repository: repository,
      workspace: workspace,
      terminalEnvelope: terminalEnvelopeByWorkspaceID[workspaceID],
      stackSummary: stackSummaryByWorkspaceID[workspaceID],
      gitSnapshot: gitSnapshotByWorkspaceID[workspaceID],
      isGitLoading: gitLoadingWorkspaceIDs.contains(workspaceID)
    )
  }
}
