import AppKit
import Foundation

struct FeedbackBridgeDiagnostics: Codable, Equatable, Sendable {
  let baseURL: String?
  let pid: Int?
  let registrationPath: String
  let healthStatusCode: Int?
  let healthPayload: String?
  let healthError: String?
}

struct FeedbackAppState: Codable, Equatable, Sendable {
  struct RepositorySummary: Codable, Equatable, Sendable {
    let id: String
    let path: String?
    let workspaceIDs: [String]
  }

  let selectedRepositoryID: String?
  let selectedWorkspaceID: String?
  let openedWorkspaceIDs: [String]
  let repositoryCount: Int
  let workspaceCount: Int
  let terminalSurfaceCount: Int
  let terminalConnectionCount: Int
  let agentCount: Int
  let activeAgentHandleCount: Int
  let bridgeSocketState: String
  let errorMessage: String?
  let lastFailureSummary: String?
  let repositories: [RepositorySummary]
}

struct FeedbackExportSnapshot: Codable, Sendable {
  let exportedAt: Date
  let build: AppBuildInfo
  let environment: [String: String]
  let bridge: FeedbackBridgeDiagnostics
  let state: FeedbackAppState
  let logs: [AppLogEntry]
}

enum FeedbackExporterError: LocalizedError {
  case userCancelled

  var errorDescription: String? {
    switch self {
    case .userCancelled:
      return "Feedback export was cancelled."
    }
  }
}

enum FeedbackExporter {
  private static func timestampString(for date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  @MainActor
  static func chooseDestinationDirectory() throws -> URL {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = true
    panel.allowsMultipleSelection = false
    panel.prompt = "Export"
    panel.message = "Choose where to write the Lifecycle feedback bundle."
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first

    guard panel.runModal() == .OK, let url = panel.url else {
      throw FeedbackExporterError.userCancelled
    }

    return url
  }

  static func export(
    snapshot: FeedbackExportSnapshot,
    into parentDirectory: URL
  ) throws -> URL {
    let bundleURL = parentDirectory.appendingPathComponent(bundleName(exportedAt: snapshot.exportedAt))
    try FileManager.default.createDirectory(at: bundleURL, withIntermediateDirectories: true)

    let encoder = JSONEncoder()
    encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    encoder.dateEncodingStrategy = .iso8601

    try encoder.encode(snapshot).write(to: bundleURL.appendingPathComponent("report.json"))
    try encoder.encode(snapshot.state).write(to: bundleURL.appendingPathComponent("state.json"))
    try encoder.encode(snapshot.bridge).write(to: bundleURL.appendingPathComponent("bridge.json"))
    try logsJSONL(snapshot.logs).write(
      to: bundleURL.appendingPathComponent("app-log.jsonl"),
      atomically: true,
      encoding: .utf8
    )
    try summary(snapshot: snapshot).write(
      to: bundleURL.appendingPathComponent("summary.md"),
      atomically: true,
      encoding: .utf8
    )

    return bundleURL
  }

  static func bundleName(exportedAt: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = TimeZone.current
    formatter.dateFormat = "yyyy-MM-dd HH-mm-ss"
    return "Lifecycle Feedback \(formatter.string(from: exportedAt))"
  }

  static func filteredEnvironment(
    from environment: [String: String]
  ) -> [String: String] {
    let allowedKeys = [
      "LIFECYCLE_API_PORT",
      "LIFECYCLE_API_URL",
      "LIFECYCLE_BRIDGE_PORT",
      "LIFECYCLE_BRIDGE_REGISTRATION",
      "LIFECYCLE_BRIDGE_START_COMMAND",
      "LIFECYCLE_BRIDGE_URL",
      "LIFECYCLE_DEV",
      "LIFECYCLE_GIT_SHA",
      "LIFECYCLE_ROOT",
      "LIFECYCLE_RUNTIME_ROOT",
    ]

    return allowedKeys.reduce(into: [String: String]()) { partialResult, key in
      if let value = environment[key], !value.isEmpty {
        partialResult[key] = value
      }
    }
  }

  static func captureBridgeDiagnostics(
    bridgeURL: URL?,
    bridgePID: Int?
  ) async -> FeedbackBridgeDiagnostics {
    let registrationPath = BridgeBootstrap.bridgeRegistrationPath(
      environment: ProcessInfo.processInfo.environment
    )

    guard let bridgeURL else {
      return FeedbackBridgeDiagnostics(
        baseURL: nil,
        pid: bridgePID,
        registrationPath: registrationPath,
        healthStatusCode: nil,
        healthPayload: nil,
        healthError: nil
      )
    }

    var request = URLRequest(url: bridgeURL.appending(path: BridgeConfiguration.healthPath))
    request.timeoutInterval = BridgeConfiguration.healthTimeout

    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      let http = response as? HTTPURLResponse
      return FeedbackBridgeDiagnostics(
        baseURL: bridgeURL.absoluteString,
        pid: bridgePID,
        registrationPath: registrationPath,
        healthStatusCode: http?.statusCode,
        healthPayload: String(data: data, encoding: .utf8),
        healthError: nil
      )
    } catch {
      return FeedbackBridgeDiagnostics(
        baseURL: bridgeURL.absoluteString,
        pid: bridgePID,
        registrationPath: registrationPath,
        healthStatusCode: nil,
        healthPayload: nil,
        healthError: error.localizedDescription
      )
    }
  }

  private static func summary(snapshot: FeedbackExportSnapshot) -> String {
    let lines = [
      "# Lifecycle Feedback Bundle",
      "",
      "- Exported: \(timestampString(for: snapshot.exportedAt))",
      "- App: \(snapshot.build.appName)",
      "- Version: \(snapshot.build.appVersion) (\(snapshot.build.buildVersion))",
      "- Git SHA: \(snapshot.build.gitSHA ?? "unknown")",
      "- Bundle ID: \(snapshot.build.bundleIdentifier)",
      "- macOS: \(snapshot.build.macOSVersion)",
      "- Bridge URL: \(snapshot.bridge.baseURL ?? "not connected")",
      "- Bridge PID: \(snapshot.bridge.pid.map(String.init) ?? "unknown")",
      "- Selected workspace: \(snapshot.state.selectedWorkspaceID ?? "none")",
      "- Repository count: \(snapshot.state.repositoryCount)",
      "- Workspace count: \(snapshot.state.workspaceCount)",
      "- Terminal surfaces: \(snapshot.state.terminalSurfaceCount)",
      "- Terminal connections: \(snapshot.state.terminalConnectionCount)",
      "- Agents: \(snapshot.state.agentCount)",
      "- Active agent handles: \(snapshot.state.activeAgentHandleCount)",
      "- Socket state: \(snapshot.state.bridgeSocketState)",
      "- Last failure: \(snapshot.state.lastFailureSummary ?? "none")",
      "",
      "Files:",
      "- `report.json` full machine-readable export",
      "- `state.json` current UI/runtime snapshot",
      "- `bridge.json` bridge health and registration diagnostics",
      "- `app-log.jsonl` recent app log entries",
    ]

    return lines.joined(separator: "\n")
  }

  private static func logsJSONL(_ logs: [AppLogEntry]) throws -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    encoder.dateEncodingStrategy = .iso8601

    let lines = try logs.map { entry in
      let data = try encoder.encode(entry)
      guard let line = String(data: data, encoding: .utf8) else {
        throw CocoaError(.fileWriteUnknown)
      }
      return line
    }

    return lines.joined(separator: "\n")
  }
}
