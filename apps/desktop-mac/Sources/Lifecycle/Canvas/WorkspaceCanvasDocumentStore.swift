import Foundation
import LifecyclePresentation

private let workspaceCanvasDocumentStoreFileName = "canvas-state.json"

private struct WorkspaceCanvasDocumentsSnapshot: Codable {
  let version: Int
  let documentsByWorkspaceID: [String: WorkspaceCanvasDocument]
  let closedSurfaceIDsByWorkspaceID: [String: Set<String>]

  private enum CodingKeys: String, CodingKey {
    case version
    case documentsByWorkspaceID
    case closedSurfaceIDsByWorkspaceID
  }

  init(
    version: Int,
    documentsByWorkspaceID: [String: WorkspaceCanvasDocument],
    closedSurfaceIDsByWorkspaceID: [String: Set<String>]
  ) {
    self.version = version
    self.documentsByWorkspaceID = documentsByWorkspaceID
    self.closedSurfaceIDsByWorkspaceID = closedSurfaceIDsByWorkspaceID
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    version = try container.decode(Int.self, forKey: .version)
    documentsByWorkspaceID = try container.decode(
      [String: WorkspaceCanvasDocument].self,
      forKey: .documentsByWorkspaceID
    )
    closedSurfaceIDsByWorkspaceID = try container.decodeIfPresent(
      [String: Set<String>].self,
      forKey: .closedSurfaceIDsByWorkspaceID
    ) ?? [:]
  }
}

struct WorkspaceCanvasDocumentStoreState {
  let documentsByWorkspaceID: [String: WorkspaceCanvasDocument]
  let closedSurfaceIDsByWorkspaceID: [String: Set<String>]
}

enum WorkspaceCanvasDocumentStore {
  static func readState(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> WorkspaceCanvasDocumentStoreState {
    let url = try storeURL(environment: environment)
    guard fileManager.fileExists(atPath: url.path) else {
      return WorkspaceCanvasDocumentStoreState(
        documentsByWorkspaceID: [:],
        closedSurfaceIDsByWorkspaceID: [:]
      )
    }

    let data = try Data(contentsOf: url)
    let snapshot = try JSONDecoder().decode(WorkspaceCanvasDocumentsSnapshot.self, from: data)
    return WorkspaceCanvasDocumentStoreState(
      documentsByWorkspaceID: snapshot.documentsByWorkspaceID,
      closedSurfaceIDsByWorkspaceID: snapshot.closedSurfaceIDsByWorkspaceID
    )
  }

  static func writeState(
    _ state: WorkspaceCanvasDocumentStoreState,
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
      version: 3,
      documentsByWorkspaceID: state.documentsByWorkspaceID,
      closedSurfaceIDsByWorkspaceID: state.closedSurfaceIDsByWorkspaceID
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
