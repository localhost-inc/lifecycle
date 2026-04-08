import Foundation

enum BridgeBootstrapError: LocalizedError {
  case couldNotStart(URL)

  var errorDescription: String? {
    switch self {
    case let .couldNotStart(url):
      return "Failed to start the local Lifecycle bridge. Set LIFECYCLE_BRIDGE_URL, ensure `lifecycle bridge start` is available on PATH, or set LIFECYCLE_BRIDGE_START_COMMAND. Expected bridge URL: \(url.absoluteString)"
    }
  }
}

struct BridgeRegistration: Codable {
  let pid: Int
  let port: Int
}

struct BridgeDiscovery: Equatable {
  let url: URL
  let pid: Int?
}

enum BridgeBootstrap {
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
    try await AppSignpost.withInterval(.bridge, "Bridge Discovery") {
      let environment = LifecycleEnvironment()

      if let url = BridgeConfiguration.explicitBridgeURL(environment: environment) {
        AppLog.info(.bridge, "Using explicit bridge URL", metadata: ["url": url.absoluteString])
        if await isHealthy(url) {
          AppLog.debug(
            .bridge,
            "Explicit bridge URL passed health checks",
            metadata: ["url": url.absoluteString]
          )
          return BridgeDiscovery(url: url, pid: nil)
        }

        AppLog.notice(
          .bridge,
          "Explicit bridge URL is not healthy yet; waiting for external bridge owner",
          metadata: ["url": url.absoluteString]
        )
        return nil
      }

      if let discovery = await registrationDiscovery(), await isHealthy(discovery.url) {
        AppLog.debug(
          .bridge,
          "Resolved bridge from registration",
          metadata: [
            "url": discovery.url.absoluteString,
            "pid": discovery.pid.map(String.init) ?? "unknown",
          ]
        )
        return discovery
      }

      guard startIfNeeded else {
        AppLog.debug(.bridge, "No healthy bridge discovered and startup was disabled")
        return nil
      }

      AppLog.notice(.bridge, "No healthy bridge discovered; attempting local bridge startup")
      try spawnBridge()

      for _ in 0..<BridgeConfiguration.bootstrapAttempts {
        try await Task.sleep(nanoseconds: BridgeConfiguration.bootstrapWaitNanoseconds)
        if let discovery = await registrationDiscovery(), await isHealthy(discovery.url) {
          AppLog.notice(
            .bridge,
            "Local bridge became healthy after startup",
            metadata: [
              "url": discovery.url.absoluteString,
              "pid": discovery.pid.map(String.init) ?? "unknown",
            ]
          )
          return discovery
        }
      }

      AppLog.error(.bridge, "Bridge did not become healthy after local startup attempt")
      return nil
    }
  }

  private static func isHealthy(_ url: URL) async -> Bool {
    var request = URLRequest(url: url.appending(path: BridgeConfiguration.healthPath))
    request.timeoutInterval = BridgeConfiguration.healthTimeout

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
        return false
      }

      let payload = try JSONDecoder().decode(HealthPayload.self, from: data)
      return bridgeHealthSupportsDesktopRuntime(payload)
    } catch {
      return false
    }
  }

  private static func registrationDiscovery() async -> BridgeDiscovery? {
    let environment = LifecycleEnvironment()
    guard let url = try? BridgeConfiguration.bridgeRegistrationURL(environment: environment) else {
      return nil
    }

    guard let data = try? Data(contentsOf: url),
          let discovery = bridgeDiscovery(fromRegistrationData: data)
    else {
      return nil
    }

    return discovery
  }

  static func bridgeRegistrationPath(environment: [String: String]) -> String {
    let lifecycleEnvironment = LifecycleEnvironment(values: environment)
    return (try? BridgeConfiguration.bridgeRegistrationURL(environment: lifecycleEnvironment).path)
      ?? NSString(string: LifecyclePathDefaults.lifecycleRoot)
      .expandingTildeInPath
      .appending("/\(LifecyclePathDefaults.bridgeRegistrationFileName)")
  }

  private static func spawnBridge() throws {
    let environment = LifecycleEnvironment()
    let process = BridgeConfiguration.defaultStartProcess(environment: environment)
    if let overrideCommand = BridgeConfiguration.bridgeStartCommandOverride(environment: environment)
    {
      process.executableURL = URL(fileURLWithPath: "/bin/sh")
      process.arguments = ["-lc", overrideCommand]
      AppLog.notice(.bridge, "Starting bridge with override command")
    } else {
      AppLog.notice(.bridge, "Starting bridge with default command")
    }

    do {
      try process.run()
    } catch {
      AppLog.error(.bridge, "Failed to start local bridge process", error: error)
      throw error
    }
  }
}

func bridgeDiscovery(fromRegistrationData data: Data) -> BridgeDiscovery? {
  guard let registration = try? JSONDecoder().decode(BridgeRegistration.self, from: data),
        let url = URL(string: "http://127.0.0.1:\(registration.port)")
  else {
    return nil
  }

  return BridgeDiscovery(url: url, pid: registration.pid)
}

func bridgeURL(fromRegistrationData data: Data) -> URL? {
  bridgeDiscovery(fromRegistrationData: data)?.url
}

struct HealthPayload: Decodable {
  let healthy: Bool
  let capabilities: BridgeHealthCapabilities?
}

struct BridgeHealthCapabilities: Decodable, Equatable {
  let agents: Bool?

  enum CodingKeys: String, CodingKey {
    case agents = "agents"
  }
}

func bridgeHealthSupportsDesktopRuntime(_ payload: HealthPayload) -> Bool {
  payload.healthy
}
