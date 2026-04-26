import CoreGraphics
import Foundation

struct AppSidebarLayoutState: Codable, Equatable {
  var expandedRepositoryIDs: Set<String>
  var width: CGFloat?

  init(
    expandedRepositoryIDs: Set<String> = [],
    width: CGFloat? = nil
  ) {
    self.expandedRepositoryIDs = expandedRepositoryIDs
    self.width = width
  }
}

enum AppSidebarLayoutStore {
  static func read(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> AppSidebarLayoutState? {
    try DesktopUIStateStore.readOptionalSection(
      DesktopUIStateSection.appSidebar,
      as: AppSidebarLayoutState.self,
      environment: environment,
      fileManager: fileManager
    )
  }

  static func write(
    _ layout: AppSidebarLayoutState,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    try DesktopUIStateStore.writeSection(
      DesktopUIStateSection.appSidebar,
      value: layout,
      environment: environment,
      fileManager: fileManager
    )
  }
}
