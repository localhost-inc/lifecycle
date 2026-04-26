import Foundation
import CoreGraphics

struct WorkspaceExtensionSidebarLayoutState: Codable, Equatable {
  var activeKind: WorkspaceExtensionKind?
  var collapsedKinds: Set<WorkspaceExtensionKind>
  var width: CGFloat?

  init(
    activeKind: WorkspaceExtensionKind? = nil,
    collapsedKinds: Set<WorkspaceExtensionKind> = [],
    width: CGFloat? = nil
  ) {
    self.activeKind = activeKind
    self.collapsedKinds = collapsedKinds
    self.width = width
  }
}

enum WorkspaceExtensionSidebarLayoutStore {
  static func read(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> [String: WorkspaceExtensionSidebarLayoutState] {
    try DesktopUIStateStore.readSection(
      DesktopUIStateSection.extensionSidebar,
      as: [String: WorkspaceExtensionSidebarLayoutState].self,
      default: [:],
      environment: environment,
      fileManager: fileManager
    )
  }

  static func write(
    _ layoutByWorkspaceID: [String: WorkspaceExtensionSidebarLayoutState],
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    try DesktopUIStateStore.writeSection(
      DesktopUIStateSection.extensionSidebar,
      value: layoutByWorkspaceID,
      environment: environment,
      fileManager: fileManager
    )
  }
}
