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
      tab: WorkspaceExtensionTabPresentation(title: title, subtitle: nil),
      content: AnyWorkspaceExtensionContent {
        EmptyView()
      }
    )
  }
}

private struct TestWorkspaceExtensionDefinition: WorkspaceExtensionDefinition {
  let kind: WorkspaceExtensionKind
  let title: String

  func resolve(context _: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(title: title, subtitle: nil),
      content: AnyWorkspaceExtensionContent {
        EmptyView()
      }
    )
  }
}
