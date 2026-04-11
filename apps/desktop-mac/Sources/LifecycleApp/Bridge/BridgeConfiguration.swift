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

  private static func bundledCliPath() -> String {
    Bundle.main.bundleURL
      .appendingPathComponent("Contents/Helpers/lifecycle")
      .path
  }

  private static func resolvedCliPath(environment: LifecycleEnvironment) -> String {
    environment.string(for: LifecycleEnvironmentKey.cliPath) ?? bundledCliPath()
  }

  static func defaultStartProcess(environment: LifecycleEnvironment) -> Process {
    let process = Process()
    process.standardOutput = FileHandle(forWritingAtPath: "/dev/null")
    process.standardError = FileHandle(forWritingAtPath: "/dev/null")
    process.environment = environment.values

    if let repoRoot = environment.string(for: LifecycleEnvironmentKey.repoRoot),
       environment.string(for: LifecycleEnvironmentKey.dev) == "1"
    {
      process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
      var arguments = [
        "bun",
        "--cwd",
        "\(repoRoot)/apps/cli",
        "run",
        "src/bridge/app.ts",
      ]
      if let port = requestedPort(environment: environment) {
        arguments.append(contentsOf: ["--port", port])
      }
      process.arguments = arguments
    } else {
      let cliPath = resolvedCliPath(environment: environment)
      process.executableURL = URL(fileURLWithPath: cliPath)
      process.arguments = ["bridge", "start"]
      process.environment?[LifecycleEnvironmentKey.cliPath] = cliPath
      if let port = requestedPort(environment: environment) {
        process.arguments?.append(contentsOf: ["--port", port])
      }
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
