import SwiftUI
import XCTest

@testable import LifecycleApp

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
      280
    )
  }

  func testExtensionSidebarWidthIsTrackedPerWorkspace() {
    let model = AppModel()

    model.setExtensionSidebarWidth(300, workspaceID: "workspace-1", availableWidth: 1200)
    model.setExtensionSidebarWidth(380, workspaceID: "workspace-2", availableWidth: 1200)

    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-1", availableWidth: 1200), 300)
    XCTAssertEqual(model.extensionSidebarWidth(for: "workspace-2", availableWidth: 1200), 380)
  }

  func testStackExtensionUsesCompactLayoutAtDefaultSidebarWidths() {
    XCTAssertTrue(
      stackExtensionUsesCompactLayout(availableWidth: defaultWorkspaceExtensionSidebarWidth)
    )
    XCTAssertTrue(
      stackExtensionUsesCompactLayout(availableWidth: minimumWorkspaceExtensionSidebarWidth)
    )
  }

  func testStackExtensionUsesTableLayoutOnlyWhenSidebarIsWideEnough() {
    XCTAssertFalse(
      stackExtensionUsesCompactLayout(availableWidth: stackExtensionMinimumTableWidth)
    )
    XCTAssertFalse(
      stackExtensionUsesCompactLayout(availableWidth: maximumWorkspaceExtensionSidebarWidth)
    )
  }

  func testStackExtensionSeparatesServiceAndTaskNodes() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: [
        stackNode(name: "api", kind: "service"),
        stackNode(name: "web", kind: "service"),
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
      "No stack configured for this workspace."
    )
  }

  func testStackExtensionSummarySubtitleUsesServiceAndTaskCounts() {
    let summary = BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: [
        stackNode(name: "api", kind: "service"),
        stackNode(name: "web", kind: "service"),
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
      runtime: kind == "service" ? "process" : nil,
      status: kind == "service" ? "ready" : nil,
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
