import Foundation
import XCTest

@testable import LifecycleApp

final class DiagnosticsTests: XCTestCase {
  func testAppLogStoreRetainsNewestEntriesWithinLimit() async {
    let store = AppLogStore(limit: 2)

    await store.append(
      AppLogEntry(
        timestamp: Date(timeIntervalSince1970: 1),
        level: .info,
        category: .app,
        message: "one",
        metadata: [:]
      )
    )
    await store.append(
      AppLogEntry(
        timestamp: Date(timeIntervalSince1970: 2),
        level: .info,
        category: .app,
        message: "two",
        metadata: [:]
      )
    )
    await store.append(
      AppLogEntry(
        timestamp: Date(timeIntervalSince1970: 3),
        level: .info,
        category: .app,
        message: "three",
        metadata: [:]
      )
    )

    let entries = await store.snapshot(limit: nil)
    XCTAssertEqual(entries.map(\.message), ["two", "three"])
  }

  func testFeedbackExporterFiltersLifecycleEnvironmentKeys() {
    let filtered = FeedbackExporter.filteredEnvironment(
      from: [
        "HOME": "/Users/test",
        "LIFECYCLE_BRIDGE_URL": "http://127.0.0.1:52222",
        "LIFECYCLE_GIT_SHA": "abc123",
      ]
    )

    XCTAssertEqual(
      filtered,
      [
        "LIFECYCLE_BRIDGE_URL": "http://127.0.0.1:52222",
        "LIFECYCLE_GIT_SHA": "abc123",
      ]
    )
  }

  func testFeedbackExporterWritesBundleFiles() throws {
    let temporaryDirectory = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
    defer {
      try? FileManager.default.removeItem(at: temporaryDirectory)
    }

    let snapshot = FeedbackExportSnapshot(
      exportedAt: Date(timeIntervalSince1970: 1_712_398_400),
      build: AppBuildInfo(
        appName: "Lifecycle",
        bundleIdentifier: "inc.localhost.lifecycle.desktop-mac",
        appVersion: "1.0",
        buildVersion: "42",
        gitSHA: "abc123",
        executablePath: "/Applications/Lifecycle.app/Contents/MacOS/Lifecycle",
        bundlePath: "/Applications/Lifecycle.app",
        macOSVersion: "macOS 14",
        processID: 123
      ),
      environment: ["LIFECYCLE_BRIDGE_URL": "http://127.0.0.1:52222"],
      bridge: FeedbackBridgeDiagnostics(
        baseURL: "http://127.0.0.1:52222",
        pid: 4821,
        registrationPath: "/Users/test/.lifecycle/bridge.json",
        healthStatusCode: 200,
        healthPayload: #"{"healthy":true}"#,
        healthError: nil
      ),
      state: FeedbackAppState(
        selectedRepositoryID: "repo-1",
        selectedWorkspaceID: "workspace-1",
        openedWorkspaceIDs: ["workspace-1"],
        repositoryCount: 1,
        workspaceCount: 1,
        terminalSurfaceCount: 1,
        terminalConnectionCount: 1,
        agentCount: 1,
        activeAgentHandleCount: 1,
        bridgeSocketState: "connected",
        errorMessage: nil,
        lastFailureSummary: nil,
        repositories: [
          FeedbackAppState.RepositorySummary(
            id: "repo-1",
            path: "/tmp/repo",
            workspaceIDs: ["workspace-1"]
          )
        ]
      ),
      logs: [
        AppLogEntry(
          timestamp: Date(timeIntervalSince1970: 1_712_398_400),
          level: .notice,
          category: .feedback,
          message: "Exported feedback bundle",
          metadata: ["path": "/tmp/Lifecycle Feedback"]
        )
      ]
    )

    let bundleURL = try FeedbackExporter.export(snapshot: snapshot, into: temporaryDirectory)

    XCTAssertTrue(FileManager.default.fileExists(atPath: bundleURL.appendingPathComponent("report.json").path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: bundleURL.appendingPathComponent("state.json").path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: bundleURL.appendingPathComponent("bridge.json").path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: bundleURL.appendingPathComponent("app-log.jsonl").path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: bundleURL.appendingPathComponent("summary.md").path))
  }
}
