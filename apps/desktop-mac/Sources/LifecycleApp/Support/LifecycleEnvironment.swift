import Foundation

enum LifecycleEnvironmentKey {
  static let bridgePort = "LIFECYCLE_BRIDGE_PORT"
  static let bridgeRegistration = "LIFECYCLE_BRIDGE_REGISTRATION"
  static let bridgeStartCommand = "LIFECYCLE_BRIDGE_START_COMMAND"
  static let bridgeURL = "LIFECYCLE_BRIDGE_URL"
  static let dev = "LIFECYCLE_DEV"
  static let home = "HOME"
  static let lifecycleRoot = "LIFECYCLE_ROOT"
  static let lifecycleRuntimeRoot = "LIFECYCLE_RUNTIME_ROOT"
  static let repoRoot = "LIFECYCLE_REPO_ROOT"
}

enum LifecyclePathDefaults {
  static let bridgeRegistrationFileName = "bridge.json"
  static let cacheDirectoryName = "cache"
  static let desktopMacCacheDirectoryName = "desktop-mac"
  static let ghosttyCacheDirectoryName = "ghostty"
  static let lifecycleRoot = "~/.lifecycle"
  static let settingsFileName = "settings.json"
}

enum LifecycleEnvironmentError: LocalizedError {
  case homeDirectoryUnavailable
  case invalidAbsolutePath(variableName: String, path: String)

  var errorDescription: String? {
    switch self {
    case .homeDirectoryUnavailable:
      "HOME is not set, so desktop settings could not be resolved."
    case let .invalidAbsolutePath(variableName, path):
      "\(variableName) must be absolute or start with ~/: \(path)"
    }
  }
}

struct LifecycleEnvironment {
  let values: [String: String]

  init(values: [String: String] = ProcessInfo.processInfo.environment) {
    self.values = values
  }

  func string(for key: String) -> String? {
    let trimmed = values[key]?.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed?.isEmpty == false ? trimmed : nil
  }

  func url(for key: String) -> URL? {
    guard let value = string(for: key) else {
      return nil
    }

    return URL(string: value)
  }

  func lifecycleRootURL() throws -> URL {
    try expandedAbsoluteURL(
      path: string(for: LifecycleEnvironmentKey.lifecycleRoot) ?? LifecyclePathDefaults.lifecycleRoot,
      variableName: LifecycleEnvironmentKey.lifecycleRoot
    )
  }

  func lifecycleRuntimeRootURL() throws -> URL {
    try expandedAbsoluteURL(
      path: string(for: LifecycleEnvironmentKey.lifecycleRuntimeRoot)
        ?? string(for: LifecycleEnvironmentKey.lifecycleRoot)
        ?? LifecyclePathDefaults.lifecycleRoot,
      variableName: LifecycleEnvironmentKey.lifecycleRuntimeRoot
    )
  }

  func bridgeRegistrationURL() throws -> URL {
    if let explicitPath = string(for: LifecycleEnvironmentKey.bridgeRegistration) {
      return try expandedAbsoluteURL(
        path: explicitPath,
        variableName: LifecycleEnvironmentKey.bridgeRegistration
      )
    }

    return try lifecycleRuntimeRootURL().appendingPathComponent(
      LifecyclePathDefaults.bridgeRegistrationFileName
    )
  }

  private func expandedAbsoluteURL(path: String, variableName: String) throws -> URL {
    let expanded: String
    if path == "~" || path.hasPrefix("~/") {
      guard let home = string(for: LifecycleEnvironmentKey.home) else {
        throw LifecycleEnvironmentError.homeDirectoryUnavailable
      }

      expanded = NSString(
        string: path.replacingOccurrences(of: "~", with: home, options: [.anchored], range: nil)
      ).expandingTildeInPath
    } else {
      expanded = NSString(string: path).expandingTildeInPath
    }

    guard expanded.hasPrefix("/") else {
      throw LifecycleEnvironmentError.invalidAbsolutePath(variableName: variableName, path: path)
    }

    return URL(fileURLWithPath: expanded, isDirectory: true)
  }
}
