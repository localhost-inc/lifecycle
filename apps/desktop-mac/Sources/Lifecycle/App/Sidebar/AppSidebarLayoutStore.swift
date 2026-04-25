import CoreGraphics
import Foundation

private let appSidebarLayoutStoreFileName = "app-sidebar-layout-state.json"

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

private struct AppSidebarLayoutSnapshot: Codable {
  let version: Int
  let layout: AppSidebarLayoutState
}

enum AppSidebarLayoutStore {
  static func read(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> AppSidebarLayoutState? {
    let url = try storeURL(environment: environment)
    guard fileManager.fileExists(atPath: url.path) else {
      return nil
    }

    let data = try Data(contentsOf: url)
    let snapshot = try JSONDecoder().decode(AppSidebarLayoutSnapshot.self, from: data)
    return snapshot.layout
  }

  static func write(
    _ layout: AppSidebarLayoutState,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    let url = try storeURL(environment: environment)
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )

    let snapshot = AppSidebarLayoutSnapshot(version: 1, layout: layout)
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    let data = try encoder.encode(snapshot)
    try data.write(to: url, options: .atomic)
  }

  private static func storeURL(environment: [String: String]) throws -> URL {
    try LifecyclePaths.lifecycleRootURL(environment: environment)
      .appendingPathComponent(LifecyclePathDefaults.cacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.desktopMacCacheDirectoryName, isDirectory: true)
      .appendingPathComponent(appSidebarLayoutStoreFileName)
  }
}
