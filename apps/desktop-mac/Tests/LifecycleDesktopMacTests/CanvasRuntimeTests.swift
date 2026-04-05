import XCTest
import SwiftUI

@testable import LifecycleDesktopMac

final class CanvasRuntimeTests: XCTestCase {
  func testAppRouteParsesWorkspaceURL() throws {
    let route = try XCTUnwrap(
      AppRoute(url: URL(string: "lifecycle://app/workspaces/workspace-123")!)
    )

    XCTAssertEqual(route, .workspace(id: "workspace-123"))
    XCTAssertEqual(route.path, "/workspaces/workspace-123")
  }

  func testAppRouteParsesSettingsURL() throws {
    let route = try XCTUnwrap(
      AppRoute(url: URL(string: "lifecycle://app/settings")!)
    )

    XCTAssertEqual(route, .settings)
    XCTAssertEqual(route.path, "/settings")
  }

  func testAppRouteRejectsUnknownURL() {
    XCTAssertNil(
      AppRoute(url: URL(string: "lifecycle://app/unknown")!)
    )
  }

  func testTmuxSurfaceMirrorSessionNameIsStableAndSanitized() {
    let sessionName = tmuxSurfaceMirrorSessionName(
      baseSessionName: "workspace/name 1",
      surfaceID: "surface:workspace-1:@7"
    )

    XCTAssertEqual(
      sessionName,
      tmuxSurfaceMirrorSessionName(
        baseSessionName: "workspace/name 1",
        surfaceID: "surface:workspace-1:@7"
      )
    )
    XCTAssertTrue(sessionName.hasPrefix("workspace-name-1_surface_"))
    XCTAssertFalse(sessionName.contains("/"))
    XCTAssertFalse(sessionName.contains(" "))
  }

  func testBridgeTerminalCommandWrapsPrepareAndSpecInSingleShellScript() {
    let prepare = BridgeShellLaunchSpec(
      program: "tmux",
      args: ["has-session", "-t", "workspace"],
      cwd: "/tmp/workspace",
      env: []
    )
    let spec = BridgeShellLaunchSpec(
      program: "tmux",
      args: ["attach-session", "-t", "workspace"],
      cwd: "/tmp/workspace",
      env: []
    )
    let connection = BridgeTerminalConnection(
      connectionID: "conn-1",
      terminalID: "@1",
      launchError: nil,
      transport: .spawn(
        BridgeTerminalSpawnTransport(
          kind: "spawn",
          prepare: prepare,
          spec: spec
        )
      )
    )

    let command = bridgeTerminalCommandText(connection)
    let expectedScript = "\(prepare.shellCommand) && exec \(spec.shellCommand)"
    let expected = ["/bin/sh", "-c", expectedScript].map(shellEscape).joined(separator: " ")

    XCTAssertEqual(command, expected)
  }

  func testBridgeTerminalCommandPreservesLaunchSpecEnvironment() {
    let prepare = BridgeShellLaunchSpec(
      program: "sh",
      args: ["-lc", "echo ready"],
      cwd: "/tmp/workspace",
      env: [["TERM", "xterm-256color"], ["TMUX", ""], ["TMUX_PANE", ""]]
    )
    let spec = BridgeShellLaunchSpec(
      program: "tmux",
      args: ["-L", "lifecycle-managed-v2", "-f", "/dev/null", "attach-session", "-t", "workspace"],
      cwd: "/tmp/workspace",
      env: [["TERM", "xterm-256color"], ["TMUX", ""], ["TMUX_PANE", ""]]
    )
    let connection = BridgeTerminalConnection(
      connectionID: "conn-1",
      terminalID: "@1",
      launchError: nil,
      transport: .spawn(
        BridgeTerminalSpawnTransport(
          kind: "spawn",
          prepare: prepare,
          spec: spec
        )
      )
    )

    let command = bridgeTerminalCommandText(connection)
    let expectedScript = "\(prepare.shellCommand) && exec \(spec.shellCommand)"
    let expected = ["/bin/sh", "-c", expectedScript].map(shellEscape).joined(separator: " ")

    XCTAssertEqual(command, expected)
    XCTAssertTrue(expectedScript.contains("'TMUX='"))
    XCTAssertTrue(expectedScript.contains("'TMUX_PANE='"))
  }

  func testNormalizeCanvasDocumentAppendsUnassignedSurfaceToActiveGroup() {
    let workspaceID = "workspace-1"
    let rootGroupID = defaultCanvasGroupID(for: workspaceID)
    let emptyGroupID = "group:\(workspaceID):empty"
    let assignedSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let unassignedSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let document = WorkspaceCanvasDocument(
      activeGroupID: rootGroupID,
      groupsByID: [
        rootGroupID: CanvasGroup(
          id: rootGroupID,
          surfaceOrder: [assignedSurfaceID],
          activeSurfaceID: assignedSurfaceID
        ),
        emptyGroupID: CanvasGroup(
          id: emptyGroupID,
          surfaceOrder: [],
          activeSurfaceID: nil
        ),
      ],
      surfacesByID: [
        assignedSurfaceID: terminalSurfaceRecord(id: assignedSurfaceID, title: "Tab 1"),
        unassignedSurfaceID: terminalSurfaceRecord(id: unassignedSurfaceID, title: "Tab 2"),
      ],
      layout: .tiled(
        .split(
          CanvasTiledLayoutSplit(
            id: "split:\(workspaceID):1",
            direction: .row,
            first: .group(rootGroupID),
            second: .group(emptyGroupID),
            ratio: 0.5
          )
        )
      )
    )

    let normalized = normalizeCanvasDocument(
      document,
      workspaceID: workspaceID,
      surfaceOrderPreference: [unassignedSurfaceID, assignedSurfaceID]
    )

    XCTAssertEqual(normalized.activeGroupID, rootGroupID)
    XCTAssertEqual(normalized.groupsByID.count, 1)
    XCTAssertEqual(
      normalized.groupsByID[rootGroupID]?.surfaceOrder,
      [assignedSurfaceID, unassignedSurfaceID]
    )
    XCTAssertEqual(normalized.groupsByID[rootGroupID]?.activeSurfaceID, assignedSurfaceID)
  }

  func testActiveCanvasSurfaceIDsReturnsActiveSurfacePerVisibleGroup() {
    let workspaceID = "workspace-1"
    let firstGroupID = defaultCanvasGroupID(for: workspaceID)
    let secondGroupID = "group:\(workspaceID):two"
    let firstSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let secondSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let document = WorkspaceCanvasDocument(
      activeGroupID: firstGroupID,
      groupsByID: [
        firstGroupID: CanvasGroup(
          id: firstGroupID,
          surfaceOrder: [firstSurfaceID],
          activeSurfaceID: firstSurfaceID
        ),
        secondGroupID: CanvasGroup(
          id: secondGroupID,
          surfaceOrder: [secondSurfaceID],
          activeSurfaceID: secondSurfaceID
        ),
      ],
      surfacesByID: [
        firstSurfaceID: terminalSurfaceRecord(id: firstSurfaceID, title: "Tab 1"),
        secondSurfaceID: terminalSurfaceRecord(id: secondSurfaceID, title: "Tab 2"),
      ],
      layout: .tiled(
        .split(
          CanvasTiledLayoutSplit(
            id: "split:\(workspaceID):1",
            direction: .row,
            first: .group(firstGroupID),
            second: .group(secondGroupID),
            ratio: 0.5
          )
        )
      )
    )

    XCTAssertEqual(activeCanvasSurfaceIDs(in: document), [firstSurfaceID, secondSurfaceID])
  }

  func testBridgeDiscoveryParsesRegistrationPortAndPID() throws {
    let data = try JSONEncoder().encode(
      BridgeRegistration(pid: 4821, port: 52036)
    )

    let discovery = try XCTUnwrap(bridgeDiscovery(fromRegistrationData: data))

    XCTAssertEqual(discovery.pid, 4821)
    XCTAssertEqual(discovery.url.absoluteString, "http://127.0.0.1:52036")
  }

  func testBridgeConnectivityErrorRecognizesConnectionFailures() {
    XCTAssertTrue(
      isBridgeConnectivityError(
        URLError(.cannotConnectToHost)
      )
    )
    XCTAssertTrue(
      isBridgeConnectivityError(
        URLError(.networkConnectionLost)
      )
    )
    XCTAssertFalse(
      isBridgeConnectivityError(
        NSError(
          domain: "LifecycleDesktopMac.Bridge",
          code: 404,
          userInfo: [NSLocalizedDescriptionKey: "Not found"]
        )
      )
    )
  }

  func testRenderedSurfacesKeepsInactiveTabsMounted() {
    let firstSurface = canvasSurface(id: "surface:workspace-1:@1", title: "Tab 1")
    let secondSurface = canvasSurface(id: "surface:workspace-1:@2", title: "Tab 2")

    let rendered = renderedSurfaces(
      for: [firstSurface, secondSurface],
      activeSurfaceID: secondSurface.id,
      groupIsActive: true
    )

    XCTAssertEqual(rendered.map(\.id), [firstSurface.id, secondSurface.id])
    XCTAssertEqual(rendered[0].renderState, SurfaceRenderState(isFocused: false, isVisible: false))
    XCTAssertEqual(rendered[1].renderState, SurfaceRenderState(isFocused: true, isVisible: true))
  }

  private func terminalSurfaceRecord(id: String, title: String) -> CanvasSurfaceRecord {
    CanvasSurfaceRecord(
      id: id,
      title: title,
      surfaceKind: .terminal,
      binding: SurfaceBinding(
        params: [
          "workspaceID": "workspace-1",
          "terminalID": id.components(separatedBy: ":").last ?? id,
        ]
      )
    )
  }

  private func canvasSurface(id: String, title: String) -> CanvasSurface {
    let record = terminalSurfaceRecord(id: id, title: title)
    return CanvasSurface(
      id: id,
      title: title,
      surfaceKind: .terminal,
      record: record,
      content: AnySurfaceContent(id: id) { _ in
        EmptyView()
      },
      tabPresentation: SurfaceTabPresentation(
        title: title,
        subtitle: nil,
        icon: "terminal"
      ),
      isClosable: true
    )
  }
}
