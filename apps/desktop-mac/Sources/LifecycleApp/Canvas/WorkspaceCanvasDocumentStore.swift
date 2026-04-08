import Foundation
import LifecyclePresentation

private let workspaceCanvasDocumentStoreFileName = "canvas-state.json"

private struct WorkspaceCanvasDocumentsSnapshot: Codable {
  let version: Int
  let documentsByWorkspaceID: [String: WorkspaceCanvasDocument]
}

enum WorkspaceCanvasDocumentStore {
  static func read(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> [String: WorkspaceCanvasDocument] {
    let url = try storeURL(environment: environment)
    guard fileManager.fileExists(atPath: url.path) else {
      return [:]
    }

    let data = try Data(contentsOf: url)
    let snapshot = try JSONDecoder().decode(WorkspaceCanvasDocumentsSnapshot.self, from: data)
    return snapshot.documentsByWorkspaceID
  }

  static func write(
    _ documentsByWorkspaceID: [String: WorkspaceCanvasDocument],
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    let url = try storeURL(environment: environment)
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )

    let snapshot = WorkspaceCanvasDocumentsSnapshot(
      version: 2,
      documentsByWorkspaceID: documentsByWorkspaceID
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
      .appendingPathComponent(workspaceCanvasDocumentStoreFileName)
  }
}
