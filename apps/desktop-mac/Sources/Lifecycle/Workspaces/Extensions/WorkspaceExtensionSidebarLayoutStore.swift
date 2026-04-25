import Foundation
import CoreGraphics

private let workspaceExtensionSidebarLayoutStoreFileName = "extension-sidebar-layout-state.json"

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

private struct WorkspaceExtensionSidebarLayoutSnapshot: Codable {
  let version: Int
  let layoutByWorkspaceID: [String: WorkspaceExtensionSidebarLayoutState]
}

enum WorkspaceExtensionSidebarLayoutStore {
  static func read(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> [String: WorkspaceExtensionSidebarLayoutState] {
    let url = try storeURL(environment: environment)
    guard fileManager.fileExists(atPath: url.path) else {
      return [:]
    }

    let data = try Data(contentsOf: url)
    let snapshot = try JSONDecoder().decode(WorkspaceExtensionSidebarLayoutSnapshot.self, from: data)
    return snapshot.layoutByWorkspaceID
  }

  static func write(
    _ layoutByWorkspaceID: [String: WorkspaceExtensionSidebarLayoutState],
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    let url = try storeURL(environment: environment)
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )

    let snapshot = WorkspaceExtensionSidebarLayoutSnapshot(
      version: 1,
      layoutByWorkspaceID: layoutByWorkspaceID
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(snapshot)
    try data.write(to: url, options: .atomic)
  }

  private static func storeURL(environment: [String: String]) throws -> URL {
    try LifecyclePaths.lifecycleRootURL(environment: environment)
      .appendingPathComponent(LifecyclePathDefaults.cacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.desktopMacCacheDirectoryName, isDirectory: true)
      .appendingPathComponent(workspaceExtensionSidebarLayoutStoreFileName)
  }
}
