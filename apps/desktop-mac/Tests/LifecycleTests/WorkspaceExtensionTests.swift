import SwiftUI
import XCTest

@testable import Lifecycle

@MainActor
final class WorkspaceExtensionTests: XCTestCase {
  func testWorkspaceExtensionRegistryPreservesRegistrationOrder() {
    let registry = WorkspaceExtensionRegistry()
    registry.register(
      TestWorkspaceExtensionDefinition(
        kind: WorkspaceExtensionKind(rawValue: "debug"),
        title: "Debug"
      )
    )
    registry.register(
      TestWorkspaceExtensionDefinition(
        kind: WorkspaceExtensionKind(rawValue: "environment"),
        title: "Environment"
      )
    )

    let extensions = registry.resolveExtensions(context: makeContext())

    XCTAssertEqual(extensions.map(\.kind.rawValue), ["debug", "environment"])
    XCTAssertEqual(extensions.map(\.tab.title), ["Debug", "Environment"])
  }

  func testWorkspaceExtensionSidebarStateFallsBackToFirstExtension() {
    let first = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "debug"), title: "Debug")
    let second = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "environment"), title: "Environment")

    let state = WorkspaceExtensionSidebarState(
      workspaceID: "workspace-1",
      extensions: [first, second],
      activeKind: WorkspaceExtensionKind(rawValue: "missing")
    )

    XCTAssertEqual(state?.activeKind.rawValue, "debug")
    XCTAssertEqual(state?.activeExtension.id, "debug")
  }

  func testWorkspaceExtensionSidebarStateKeepsRequestedExtensionWhenAvailable() {
    let first = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "debug"), title: "Debug")
    let second = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "environment"), title: "Environment")

    let state = WorkspaceExtensionSidebarState(
      workspaceID: "workspace-1",
      extensions: [first, second],
      activeKind: WorkspaceExtensionKind(rawValue: "environment")
    )

    XCTAssertEqual(state?.activeKind.rawValue, "environment")
    XCTAssertEqual(state?.activeExtension.id, "environment")
  }

  func testWorkspaceExtensionSidebarStateKeepsAllExtensionsVisible() {
    let first = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "stack"), title: "Stack")
    let second = resolvedExtension(kind: WorkspaceExtensionKind(rawValue: "debug"), title: "Debug")

    let state = WorkspaceExtensionSidebarState(
      workspaceID: "workspace-1",
      extensions: [first, second],
      activeKind: WorkspaceExtensionKind(rawValue: "debug")
    )

    XCTAssertEqual(state?.activeExtension.id, "debug")
    XCTAssertEqual(state?.visibleExtensions.map(\.id), ["stack", "debug"])
  }

  func testSessionsExtensionSubtitleSummarizesTerminalActivity() {
    XCTAssertEqual(sessionsExtensionSubtitle(terminals: []), "no sessions")
    XCTAssertEqual(
      sessionsExtensionSubtitle(terminals: [
        BridgeTerminalRecord(id: "1", title: "Shell", kind: "shell", busy: false),
        BridgeTerminalRecord(id: "2", title: "Codex", kind: "codex", busy: false),
      ]),
      "2 idle"
    )
    XCTAssertEqual(
      sessionsExtensionSubtitle(terminals: [
        BridgeTerminalRecord(id: "1", title: "Shell", kind: "shell", busy: false),
        BridgeTerminalRecord(id: "2", title: "Codex", kind: "codex", busy: true),
        BridgeTerminalRecord(id: "3", title: "Codex", kind: "codex", busy: true),
      ]),
      "2 active, 3 total"
    )
  }

  func testSessionsExtensionActivityLabelIncludesToolAndWaitingDetails() {
    XCTAssertEqual(
      sessionsExtensionActivityLabel(for: BridgeTerminalRecord(id: "1", title: "Shell", kind: "shell", busy: false)),
      "Idle"
    )
    XCTAssertEqual(
      sessionsExtensionActivityLabel(for: BridgeTerminalRecord(
        id: "2",
        title: "Codex",
        kind: "codex",
        busy: true,
        activity: BridgeTerminalActivityRecord(
          terminalID: "2",
          state: "tool_active",
          source: "codex",
          busy: true,
          provider: "codex",
          prompt: nil,
          title: nil,
          turnID: nil,
          toolName: "Bash",
          waitingKind: nil,
          lastEventAt: nil,
          updatedAt: nil
        )
      )),
      "Bash"
    )
    XCTAssertEqual(
      sessionsExtensionActivityLabel(for: BridgeTerminalRecord(
        id: "3",
        title: "Codex",
        kind: "codex",
        busy: true,
        activity: BridgeTerminalActivityRecord(
          terminalID: "3",
          state: "waiting",
          source: "codex",
          busy: true,
          provider: "codex",
          prompt: nil,
          title: nil,
          turnID: nil,
          toolName: nil,
          waitingKind: "approval",
          lastEventAt: nil,
          updatedAt: nil
        )
      )),
      "Approval"
    )
  }

  func testSessionsExtensionHourGroupsSortNewestFirstAndCollectMissingActivity() {
    let groups = sessionsExtensionHourGroups(terminals: [
      BridgeTerminalRecord(
        id: "older",
        title: "Older",
        kind: "codex",
        busy: false,
        activity: BridgeTerminalActivityRecord(
          terminalID: "older",
          state: "interactive_quiet",
          source: "codex",
          busy: false,
          provider: "codex",
          prompt: nil,
          title: nil,
          turnID: nil,
          toolName: nil,
          waitingKind: nil,
          lastEventAt: nil,
          updatedAt: "2026-04-25T16:05:00.000Z"
        )
      ),
      BridgeTerminalRecord(
        id: "missing",
        title: "Missing",
        kind: "shell",
        busy: false
      ),
      BridgeTerminalRecord(
        id: "newer",
        title: "Newer",
        kind: "codex",
        busy: true,
        activity: BridgeTerminalActivityRecord(
          terminalID: "newer",
          state: "turn_active",
          source: "codex",
          busy: true,
          provider: "codex",
          prompt: nil,
          title: nil,
          turnID: nil,
          toolName: nil,
          waitingKind: nil,
          lastEventAt: nil,
          updatedAt: "2026-04-25T17:30:00.000Z"
        )
      ),
    ])

    XCTAssertEqual(groups.count, 3)
    XCTAssertEqual(groups[0].terminals.map(\.id), ["newer"])
    XCTAssertEqual(groups[1].terminals.map(\.id), ["older"])
    XCTAssertEqual(groups[2].title, "No Recent Activity")
    XCTAssertEqual(groups[2].terminals.map(\.id), ["missing"])
  }

  func testExtensionSidebarWidthDefaultsToStandardWidth() {
    let model = AppModel()

    XCTAssertEqual(
      model.extensionSidebarWidth(for: "workspace-1", availableWidth: 1200),
      defaultWorkspaceExtensionSidebarWidth
    )
  }

  func testExtensionSidebarWidthClampsToAvailableCanvasSpace() {
    let model = AppModel()
    let availableWidth: CGFloat = 760

    model.setExtensionSidebarWidth(
      420,
      workspaceID: "workspace-1",
      availableWidth: availableWidth
    )

    XCTAssertEqual(
      model.extensionSidebarWidth(for: "workspace-1", availableWidth: availableWidth),
      clampedWorkspaceExtensionSidebarWidth(420, availableWidth: availableWidth)
    )
    XCTAssertEqual(
      model.extensionSidebarWidth(for: "workspace-1", availableWidth: availableWidth),
      279
    )
  }

  func testExtensionSidebarWidthIsTrackedPerWorkspace() {
    let model = AppModel()

    model.setExtensionSidebarWidth(300, workspaceID: "workspace-1", availableWidth: 1200)
    model.setExtensionSidebarWidth(380, workspaceID: "workspace-2", availableWidth: 1200)

    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-1", availableWidth: 1200), 300)
    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-2", availableWidth: 1200), 380)
  }

  func testExtensionSidebarPreferredWidthSurvivesTightWindowClamp() {
    let model = AppModel()

    model.setExtensionSidebarWidth(380, workspaceID: "workspace-1", availableWidth: 1200)

    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-1", availableWidth: 700), 260)
    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-1", availableWidth: 1200), 380)
  }

  func testCollapsedExtensionKindsAreTrackedPerWorkspace() {
    let model = AppModel()

    model.setCollapsedExtensionKinds([.debug], workspaceID: "workspace-1")
    model.setCollapsedExtensionKinds([.stack], workspaceID: "workspace-2")

    XCTAssertEqual(model.collapsedExtensionKinds(for: "workspace-1"), [.debug])
    XCTAssertEqual(model.collapsedExtensionKinds(for: "workspace-2"), [.stack])
  }

  func testWorkspaceExtensionSidebarLayoutStoreRoundTripsState() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent("lifecycle-extension-sidebar-\(UUID().uuidString)")
    defer {
      try? FileManager.default.removeItem(at: rootURL)
    }

    let layoutByWorkspaceID = [
      "workspace-1": WorkspaceExtensionSidebarLayoutState(
        activeKind: .debug,
        collapsedKinds: [.stack],
        width: 380
      ),
    ]

    try WorkspaceExtensionSidebarLayoutStore.write(
      layoutByWorkspaceID,
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    let restored = try WorkspaceExtensionSidebarLayoutStore.read(
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    XCTAssertEqual(restored, layoutByWorkspaceID)
  }

  func testStackExtensionServiceMetadataKeepsRowsSingleLine() {
    let node = BridgeStackNode(
      workspaceID: "workspace-1",
      name: "api",
      kind: "process",
      dependsOn: ["postgres", "migrate"],
      status: "ready",
      statusReason: nil,
      assignedPort: 3000,
      previewURL: nil,
      createdAt: nil,
      updatedAt: nil,
      runOn: nil,
      command: nil,
      writeFilesCount: nil
    )

    XCTAssertEqual(
      stackExtensionServiceMetadata(node),
      ":3000  depends on postgres, migrate"
    )
  }

  func testStackExtensionTaskMetadataSummarizesTriggerDependenciesAndWrites() {
    let node = BridgeStackNode(
      workspaceID: "workspace-1",
      name: "seed",
      kind: "task",
      dependsOn: ["postgres"],
      status: nil,
      statusReason: nil,
      assignedPort: nil,
      previewURL: nil,
      createdAt: nil,
      updatedAt: nil,
      runOn: "start",
      command: "bun run seed",
      writeFilesCount: 3
    )

    XCTAssertEqual(
      stackExtensionTaskMetadata(node),
      "run_on start  depends on postgres  write_files 3"
    )
  }

  func testStackExtensionServiceStatusLabelPrefersStoppingPhase() {
    let node = BridgeStackNode(
      workspaceID: "workspace-1",
      name: "api",
      kind: "process",
      dependsOn: [],
      status: "ready",
      statusReason: nil,
      assignedPort: nil,
      previewURL: nil,
      createdAt: nil,
      updatedAt: nil,
      runOn: nil,
      command: nil,
      writeFilesCount: nil
    )

    XCTAssertEqual(
      stackExtensionServiceStatusLabel(node, phase: .stopping),
      "stopping"
    )
  }

  func testStackExtensionSanitizedLogTextStripsANSIEscapeSequences() {
    XCTAssertEqual(
      stackExtensionSanitizedLogText("\u{001B}[38;2;255;136;0mready\u{001B}[39m"),
      "ready"
    )
  }

  func testStackExtensionLogPlainTextCombinesSanitizedLines() {
    let lines = [
      BridgeWorkspaceLogLine(
        service: "www",
        stream: "stdout",
        text: "\u{001B}[90mhello\u{001B}[39m",
        timestamp: "2026-04-11T18:00:00.000Z"
      ),
      BridgeWorkspaceLogLine(
        service: "www",
        stream: "stderr",
        text: "warn\r",
        timestamp: "2026-04-11T18:00:01.000Z"
      ),
    ]

    XCTAssertEqual(
      stackExtensionLogPlainText(lines),
      "hello\nwarn"
    )
  }

  func testStackExtensionSeparatesServiceAndTaskNodes() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: [
        stackNode(name: "api", kind: "process"),
        stackNode(name: "web", kind: "process"),
        stackNode(name: "seed", kind: "task"),
      ]
    )

    XCTAssertEqual(stackExtensionServiceNodes(from: summary).map(\.name), ["api", "web"])
    XCTAssertEqual(stackExtensionTaskNodes(from: summary).map(\.name), ["seed"])
  }

  func testStackExtensionSummarySubtitleUsesMissingCopy() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "missing",
      errors: [],
      nodes: []
    )

    XCTAssertEqual(
      stackExtensionSummarySubtitle(summary: summary),
      "No lifecycle.json found for this workspace."
    )
  }

  func testStackExtensionSummarySubtitleUsesUnconfiguredCopy() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "unconfigured",
      errors: [],
      nodes: []
    )

    XCTAssertEqual(
      stackExtensionSummarySubtitle(summary: summary),
      "No stack configured for this workspace."
    )
  }

  func testStackExtensionSummarySubtitleUsesInvalidCopy() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "invalid",
      errors: ["nodes.api.command is required"],
      nodes: []
    )

    XCTAssertEqual(
      stackExtensionSummarySubtitle(summary: summary),
      "Lifecycle couldn't parse this workspace's stack configuration. Fix lifecycle.json and reload the workspace."
    )
  }

  func testStackExtensionEmptyStateContentIncludesInvalidDetails() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "invalid",
      errors: [
        "nodes.api.command is required",
        "nodes.web.depends_on references missing node 'db'",
      ],
      nodes: []
    )

    XCTAssertEqual(
      stackExtensionEmptyStateContent(summary: summary),
      StackExtensionEmptyStateContent(
        symbolName: "exclamationmark.triangle.fill",
        title: "Stack config is invalid",
        description: "Lifecycle couldn't parse this workspace's stack configuration. Fix lifecycle.json and reload the workspace.",
        tone: .error,
        details: [
          "nodes.api.command is required",
          "nodes.web.depends_on references missing node 'db'",
        ]
      )
    )
  }

  func testStackExtensionEmptyStateContentReturnsNilForReadySummary() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: [stackNode(name: "api", kind: "process")]
    )

    XCTAssertNil(stackExtensionEmptyStateContent(summary: summary))
  }

  func testWorkspaceExtensionEmptyStateVisualConfigurationUsesToneAccent() {
    let theme = AppThemeCatalog.defaultPreset.theme

    XCTAssertEqual(
      workspaceExtensionEmptyStateVisualConfiguration(
        theme: theme,
        tone: .warning,
        reduceMotion: false
      ),
      WorkspaceExtensionEmptyStateVisualConfiguration(
        accentHex: theme.statusWarning,
        backgroundHex: theme.background.chromeHex,
        animationSpeed: 0.9,
        intensity: 0.94
      )
    )
  }

  func testWorkspaceExtensionEmptyStateVisualConfigurationDisablesAnimationForReducedMotion() {
    let theme = AppThemeCatalog.defaultPreset.theme

    XCTAssertEqual(
      workspaceExtensionEmptyStateVisualConfiguration(
        theme: theme,
        tone: .error,
        reduceMotion: true
      ),
      WorkspaceExtensionEmptyStateVisualConfiguration(
        accentHex: theme.statusDanger,
        backgroundHex: theme.background.chromeHex,
        animationSpeed: 0,
        intensity: 0.82
      )
    )
  }

  func testWorkspaceExtensionEmptyStateGlyphStyleMatchesKnownStates() {
    XCTAssertEqual(
      workspaceExtensionEmptyStateGlyphStyle(
        symbolName: "shippingbox.circle.fill",
        tone: .warning
      ),
      .manifestMissing
    )
    XCTAssertEqual(
      workspaceExtensionEmptyStateGlyphStyle(
        symbolName: "shippingbox.circle",
        tone: .neutral
      ),
      .stackUnconfigured
    )
    XCTAssertEqual(
      workspaceExtensionEmptyStateGlyphStyle(
        symbolName: "exclamationmark.triangle.fill",
        tone: .error
      ),
      .invalid
    )
  }

  func testWorkspaceExtensionEmptyStateAsciiAnimationUsesConsistentFrameGeometry() {
    let animation = workspaceExtensionEmptyStateAsciiAnimation(style: .manifestMissing)
    let expectedLineCount = animation.frames.first?.lines.count
    let expectedLineWidth = animation.frames.first?.lines.first?.count

    XCTAssertNotNil(expectedLineCount)
    XCTAssertNotNil(expectedLineWidth)
    XCTAssertEqual(animation.stillFrameIndex, 0)

    for frame in animation.frames {
      XCTAssertEqual(frame.lines.count, expectedLineCount)
      XCTAssertTrue(frame.lines.allSatisfy { $0.count == expectedLineWidth })
    }
  }

  func testWorkspaceExtensionEmptyStateAsciiFrameUsesManifestFrameSequence() {
    XCTAssertEqual(
      workspaceExtensionEmptyStateAsciiFrame(
        style: .manifestMissing,
        step: 0,
        reduceMotion: false
      ),
      WorkspaceExtensionEmptyStateAsciiFrame(
        lines: ["  .--. ", " /_  / ", "| {} | ", "| ?? | ", "`----' "]
      )
    )
    XCTAssertEqual(
      workspaceExtensionEmptyStateAsciiFrame(
        style: .manifestMissing,
        step: 3,
        reduceMotion: false
      ),
      WorkspaceExtensionEmptyStateAsciiFrame(
        lines: ["  .--. ", " /_  / ", "| {} | ", "| _  | ", "`----' "]
      )
    )
  }

  func testWorkspaceExtensionEmptyStateAsciiFrameFreezesOnStillFrameForReducedMotion() {
    XCTAssertEqual(
      workspaceExtensionEmptyStateAsciiFrame(
        style: .invalid,
        step: 99,
        reduceMotion: true
      ),
      WorkspaceExtensionEmptyStateAsciiFrame(
        lines: ["  .--. ", " /_  / ", "| !! | ", "| xx | ", "`----' "]
      )
    )
  }

  func testStackExtensionSummarySubtitleUsesServiceAndTaskCounts() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: [
        stackNode(name: "api", kind: "process"),
        stackNode(name: "web", kind: "process"),
        stackNode(name: "seed", kind: "task"),
      ]
    )

    XCTAssertEqual(
      stackExtensionSummarySubtitle(summary: summary),
      "2 services, 1 task"
    )
  }

  private func makeContext() -> WorkspaceExtensionContext {
    WorkspaceExtensionContext(
      model: AppModel(),
      repository: BridgeRepository(
        id: "repo-1",
        name: "lifecycle",
        source: "local",
        path: "/tmp/lifecycle",
        workspaces: [
          BridgeWorkspaceSummary(
            id: "workspace-1",
            name: "dev",
            host: "local",
            status: "active",
            ref: "main",
            path: "/tmp/lifecycle"
          ),
        ]
      ),
      workspace: BridgeWorkspaceSummary(
        id: "workspace-1",
        name: "dev",
        host: "local",
        status: "active",
        ref: "main",
        path: "/tmp/lifecycle"
      ),
      terminalEnvelope: nil,
      stackSummary: nil
    )
  }

  private func resolvedExtension(
    kind: WorkspaceExtensionKind,
    title: String
  ) -> ResolvedWorkspaceExtension {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        icon: "square.stack",
        title: title,
        subtitle: nil
      ),
      content: AnyWorkspaceExtensionContent {
        EmptyView()
      }
    )
  }

  private func stackNode(name: String, kind: String) -> BridgeStackNode {
    BridgeStackNode(
      workspaceID: "workspace-1",
      name: name,
      kind: kind,
      dependsOn: [],
      status: kind == "task" ? nil : "ready",
      statusReason: nil,
      assignedPort: nil,
      previewURL: nil,
      createdAt: nil,
      updatedAt: nil,
      runOn: kind == "task" ? "create" : nil,
      command: kind == "task" ? "echo ok" : nil,
      writeFilesCount: kind == "task" ? 0 : nil
    )
  }
}

private struct TestWorkspaceExtensionDefinition: WorkspaceExtensionDefinition {
  let kind: WorkspaceExtensionKind
  let title: String

  func resolve(context _: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        icon: "square.stack",
        title: title,
        subtitle: nil
      ),
      content: AnyWorkspaceExtensionContent {
        EmptyView()
      }
    )
  }
}
