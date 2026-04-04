import Foundation

enum BridgeBootstrapError: LocalizedError {
  case bridgeUnhealthy(URL)
  case couldNotStart(URL)

  var errorDescription: String? {
    switch self {
    case let .bridgeUnhealthy(url):
      return "Bridge at \(url.absoluteString) did not pass health checks."
    case let .couldNotStart(url):
      return "Failed to start the local Lifecycle bridge. Set LIFECYCLE_BRIDGE_URL, ensure `lifecycle bridge start` is available on PATH, or set LIFECYCLE_BRIDGE_START_COMMAND. Expected bridge URL: \(url.absoluteString)"
    }
  }
}

struct BridgePidfile: Codable {
  let pid: Int
  let port: Int
}

struct BridgeDiscovery: Equatable {
  let url: URL
  let pid: Int?
}

enum BridgeBootstrap {
  private static let bootstrapAttempts = 120
  private static let bootstrapWaitNanoseconds: UInt64 = 100_000_000

  static func ensureBridgeURL() async throws -> URL {
    if let discovered = try await discoverBridge(startIfNeeded: true) {
      return discovered.url
    }

    let fallbackURL = URL(string: "http://127.0.0.1:0")!
    throw BridgeBootstrapError.couldNotStart(fallbackURL)
  }

  static func ensureBridgeDiscovery() async throws -> BridgeDiscovery {
    if let discovered = try await discoverBridge(startIfNeeded: true) {
      return discovered
    }

    let fallbackURL = URL(string: "http://127.0.0.1:0")!
    throw BridgeBootstrapError.couldNotStart(fallbackURL)
  }

  static func discoverBridgeURL(startIfNeeded: Bool) async throws -> URL? {
    try await discoverBridge(startIfNeeded: startIfNeeded)?.url
  }

  static func discoverBridge(startIfNeeded: Bool) async throws -> BridgeDiscovery? {
    if let bridgeURL = ProcessInfo.processInfo.environment["LIFECYCLE_BRIDGE_URL"],
       let url = URL(string: bridgeURL)
    {
      guard await isHealthy(url) else {
        throw BridgeBootstrapError.bridgeUnhealthy(url)
      }
      return BridgeDiscovery(url: url, pid: nil)
    }

    if let discovery = await pidfileDiscovery(), await isHealthy(discovery.url) {
      return discovery
    }

    guard startIfNeeded else {
      return nil
    }

    try spawnBridge()

    for _ in 0..<bootstrapAttempts {
      try await Task.sleep(nanoseconds: bootstrapWaitNanoseconds)
      if let discovery = await pidfileDiscovery(), await isHealthy(discovery.url) {
        return discovery
      }
    }

    return nil
  }

  private static func isHealthy(_ url: URL) async -> Bool {
    var request = URLRequest(url: url.appending(path: "health"))
    request.timeoutInterval = 1.5

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        return false
      }

      let payload = try JSONDecoder().decode(HealthPayload.self, from: data)
      return payload.healthy
    } catch {
      return false
    }
  }

  private static func pidfileDiscovery() async -> BridgeDiscovery? {
    let path =
      ProcessInfo.processInfo.environment["LIFECYCLE_BRIDGE_PIDFILE"] ??
      NSString(string: "~/.lifecycle/bridge.json").expandingTildeInPath
    let url = URL(fileURLWithPath: path)

    guard let data = try? Data(contentsOf: url),
          let discovery = bridgeDiscovery(fromPidfileData: data)
    else {
      return nil
    }

    return discovery
  }

  private static func spawnBridge() throws {
    let process = Process()
    if let overrideCommand = ProcessInfo.processInfo.environment["LIFECYCLE_BRIDGE_START_COMMAND"],
       !overrideCommand.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      process.executableURL = URL(fileURLWithPath: "/bin/sh")
      process.arguments = ["-lc", overrideCommand]
    } else {
      process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      process.arguments = ["lifecycle", "bridge", "start"]
    }
    process.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
    process.standardError = FileHandle(forWritingAtPath: "/dev/null")
    try process.run()
  }
}

func bridgeDiscovery(fromPidfileData data: Data) -> BridgeDiscovery? {
  guard let pidfile = try? JSONDecoder().decode(BridgePidfile.self, from: data),
        let url = URL(string: "http://127.0.0.1:\(pidfile.port)")
  else {
    return nil
  }

  return BridgeDiscovery(url: url, pid: pidfile.pid)
}

func bridgeURL(fromPidfileData data: Data) -> URL? {
  bridgeDiscovery(fromPidfileData: data)?.url
}

private struct HealthPayload: Decodable {
  let healthy: Bool
}
