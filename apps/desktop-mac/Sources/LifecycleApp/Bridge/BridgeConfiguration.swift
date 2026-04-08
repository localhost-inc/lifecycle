import Foundation

enum BridgeConfiguration {
  static let bootstrapAttempts = 120
  static let bootstrapWaitNanoseconds: UInt64 = 100_000_000
  static let healthPath = "health"
  static let healthTimeout: TimeInterval = 1.5

  static func explicitBridgeURL(environment: LifecycleEnvironment) -> URL? {
    environment.url(for: LifecycleEnvironmentKey.bridgeURL)
  }

  static func bridgeRegistrationURL(environment: LifecycleEnvironment) throws -> URL {
    try environment.bridgeRegistrationURL()
  }

  static func bridgeStartCommandOverride(environment: LifecycleEnvironment) -> String? {
    environment.string(for: LifecycleEnvironmentKey.bridgeStartCommand)
  }

  static func defaultStartProcess(environment: LifecycleEnvironment) -> Process {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    process.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
    process.standardError = FileHandle(forWritingAtPath: "/dev/null")

    if let repoRoot = environment.string(for: LifecycleEnvironmentKey.repoRoot),
       environment.string(for: LifecycleEnvironmentKey.dev) == "1"
    {
      var arguments = [
        "bun",
        "--cwd",
        "\(repoRoot)/packages/bridge",
        "run",
        "src/app.ts",
      ]
      if let port = requestedPort(environment: environment) {
        arguments.append(contentsOf: ["--port", port])
      }
      process.arguments = arguments
    } else {
      process.arguments = ["lifecycle", "bridge", "start"]
    }

    return process
  }

  private static func requestedPort(environment: LifecycleEnvironment) -> String? {
    if let explicitPort = environment.string(for: LifecycleEnvironmentKey.bridgePort) {
      return explicitPort
    }

    if let explicitURL = environment.url(for: LifecycleEnvironmentKey.bridgeURL),
       let port = explicitURL.port
    {
      return String(port)
    }

    return nil
  }
}
