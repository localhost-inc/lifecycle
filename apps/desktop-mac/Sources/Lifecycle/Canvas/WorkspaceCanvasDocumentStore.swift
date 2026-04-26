import Foundation
import LifecyclePresentation

private let desktopUIStateStoreFileName = "ui.json"
private let desktopUIStateStoreVersion = 1
private let desktopUIStateVersionKey = "version"

struct WorkspaceCanvasDocumentStoreState: Codable {
  let documentsByWorkspaceID: [String: WorkspaceCanvasDocument]
  let closedSurfaceIDsByWorkspaceID: [String: Set<String>]

  static var empty: WorkspaceCanvasDocumentStoreState {
    WorkspaceCanvasDocumentStoreState(
      documentsByWorkspaceID: [:],
      closedSurfaceIDsByWorkspaceID: [:]
    )
  }
}

enum DesktopUIStateSection {
  static let canvas = "canvas"
  static let appSidebar = "appSidebar"
  static let extensionSidebar = "extensionSidebar"
}

enum DesktopUIStateStore {
  static func readSection<Value: Decodable>(
    _ key: String,
    as type: Value.Type,
    default defaultValue: @autoclosure () -> Value,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> Value {
    try readOptionalSection(
      key,
      as: type,
      environment: environment,
      fileManager: fileManager
    ) ?? defaultValue()
  }

  static func readOptionalSection<Value: Decodable>(
    _ key: String,
    as type: Value.Type,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> Value? {
    let object = try readObject(environment: environment, fileManager: fileManager)
    guard let section = object[key] else {
      return nil
    }

    let data = try JSONSerialization.data(withJSONObject: section)
    return try JSONDecoder().decode(Value.self, from: data)
  }

  static func writeSection<Value: Encodable>(
    _ key: String,
    value: Value,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    var object = try readObject(environment: environment, fileManager: fileManager)
    object[desktopUIStateVersionKey] = desktopUIStateStoreVersion
    object[key] = try encodedJSONObject(value)
    try writeObject(object, environment: environment, fileManager: fileManager)
  }

  private static func readObject(
    environment: [String: String],
    fileManager: FileManager
  ) throws -> [String: Any] {
    let url = try storeURL(environment: environment)
    guard fileManager.fileExists(atPath: url.path) else {
      return [desktopUIStateVersionKey: desktopUIStateStoreVersion]
    }

    let data = try Data(contentsOf: url)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return [desktopUIStateVersionKey: desktopUIStateStoreVersion]
    }

    return object
  }

  private static func writeObject(
    _ object: [String: Any],
    environment: [String: String],
    fileManager: FileManager
  ) throws {
    let url = try storeURL(environment: environment)
    try fileManager.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true,
      attributes: nil
    )

    let data = try JSONSerialization.data(
      withJSONObject: object,
      options: [.prettyPrinted, .sortedKeys]
    )
    try data.write(to: url, options: .atomic)
  }

  private static func encodedJSONObject<Value: Encodable>(_ value: Value) throws -> Any {
    let encoder = JSONEncoder()
    let data = try encoder.encode(value)
    return try JSONSerialization.jsonObject(with: data)
  }

  private static func storeURL(environment: [String: String]) throws -> URL {
    try LifecyclePaths.lifecycleRootURL(environment: environment)
      .appendingPathComponent(LifecyclePathDefaults.cacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.desktopMacCacheDirectoryName, isDirectory: true)
      .appendingPathComponent(desktopUIStateStoreFileName)
  }
}

enum WorkspaceCanvasDocumentStore {
  static func readState(
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws -> WorkspaceCanvasDocumentStoreState {
    try DesktopUIStateStore.readSection(
      DesktopUIStateSection.canvas,
      as: WorkspaceCanvasDocumentStoreState.self,
      default: .empty,
      environment: environment,
      fileManager: fileManager
    )
  }

  static func writeState(
    _ state: WorkspaceCanvasDocumentStoreState,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    fileManager: FileManager = .default
  ) throws {
    try DesktopUIStateStore.writeSection(
      DesktopUIStateSection.canvas,
      value: state,
      environment: environment,
      fileManager: fileManager
    )
  }
}
