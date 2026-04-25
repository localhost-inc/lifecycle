import CoreGraphics
import Foundation

@MainActor
extension AppModel {
  func setAppSidebarWidth(_ width: CGFloat, availableWidth: CGFloat? = nil) {
    let nextWidth =
      if let availableWidth {
        clampedAppSidebarWidth(width, availableWidth: availableWidth)
      } else {
        min(max(width, minimumAppSidebarWidth), maximumAppSidebarWidth)
      }

    guard appSidebarWidthValue != nextWidth else {
      return
    }

    appSidebarWidthValue = nextWidth
    persistAppSidebarLayoutState()
  }

  func isAppSidebarRepositoryExpanded(_ repositoryID: String) -> Bool {
    expandedAppSidebarRepositoryIDs.contains(repositoryID)
  }

  func setAppSidebarRepositoryExpanded(_ isExpanded: Bool, repositoryID: String) {
    let didChange: Bool
    if isExpanded {
      didChange = expandedAppSidebarRepositoryIDs.insert(repositoryID).inserted
    } else {
      didChange = expandedAppSidebarRepositoryIDs.remove(repositoryID) != nil
    }

    guard didChange else {
      return
    }

    persistAppSidebarLayoutState()
  }

  func toggleAppSidebarRepositoryExpanded(_ repositoryID: String) {
    setAppSidebarRepositoryExpanded(
      !expandedAppSidebarRepositoryIDs.contains(repositoryID),
      repositoryID: repositoryID
    )
  }

  func restorePersistedAppSidebarLayoutState(
    validRepositoryIDs: Set<String>,
    defaultExpandedRepositoryID: String?
  ) {
    if !didRestorePersistedAppSidebarLayoutState {
      do {
        if let persistedLayout = try AppSidebarLayoutStore.read() {
          let restoredRepositoryIDs = persistedLayout.expandedRepositoryIDs
            .intersection(validRepositoryIDs)
          expandedAppSidebarRepositoryIDs = restoredRepositoryIDs

          if let width = persistedLayout.width {
            appSidebarWidthValue = min(max(width, minimumAppSidebarWidth), maximumAppSidebarWidth)
          }

          didRestorePersistedAppSidebarLayoutState = true

          if restoredRepositoryIDs.count != persistedLayout.expandedRepositoryIDs.count {
            persistAppSidebarLayoutState()
          }
        } else {
          if let defaultExpandedRepositoryID,
             validRepositoryIDs.contains(defaultExpandedRepositoryID)
          {
            expandedAppSidebarRepositoryIDs = [defaultExpandedRepositoryID]
          }
          didRestorePersistedAppSidebarLayoutState = true
          persistAppSidebarLayoutState()
        }
      } catch {
        didRestorePersistedAppSidebarLayoutState = true
        AppLog.error(.workspace, "Failed to restore app sidebar layout state", error: error)
      }
      return
    }

    let filteredRepositoryIDs = expandedAppSidebarRepositoryIDs.intersection(validRepositoryIDs)
    guard filteredRepositoryIDs.count != expandedAppSidebarRepositoryIDs.count else {
      return
    }

    expandedAppSidebarRepositoryIDs = filteredRepositoryIDs
    persistAppSidebarLayoutState()
  }

  func persistAppSidebarLayoutState() {
    guard didRestorePersistedAppSidebarLayoutState else {
      return
    }

    do {
      try AppSidebarLayoutStore.write(
        AppSidebarLayoutState(
          expandedRepositoryIDs: expandedAppSidebarRepositoryIDs,
          width: appSidebarWidthValue
        )
      )
    } catch {
      AppLog.error(.workspace, "Failed to persist app sidebar layout state", error: error)
    }
  }
}
