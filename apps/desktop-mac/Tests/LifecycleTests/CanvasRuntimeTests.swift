import XCTest
import SwiftUI
import Foundation
import LifecyclePresentation

@testable import Lifecycle

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

  func testWorkspacePaneOpacityDimsOnlyInactiveUnhoveredPanes() {
    let settings = WorkspacePaneDimmingSettings(isEnabled: true, inactiveOpacity: 0.52)

    XCTAssertEqual(workspacePaneOpacity(isActive: true, isHovering: false, settings: settings), 1, accuracy: 0.001)
    XCTAssertEqual(workspacePaneOpacity(isActive: false, isHovering: true, settings: settings), 1, accuracy: 0.001)
    XCTAssertEqual(workspacePaneOpacity(isActive: false, isHovering: false, settings: settings), 0.52, accuracy: 0.001)
    XCTAssertEqual(
      workspacePaneOpacity(
        isActive: false,
        isHovering: false,
        settings: WorkspacePaneDimmingSettings(isEnabled: false, inactiveOpacity: 0.52)
      ),
      1,
      accuracy: 0.001
    )
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
    let expectedScript = "\(prepare.shellCommand) && printf '\\033[?1007l' && exec \(spec.shellCommand)"
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
    let expectedScript = "\(prepare.shellCommand) && printf '\\033[?1007l' && exec \(spec.shellCommand)"
    let expected = ["/bin/sh", "-c", expectedScript].map(shellEscape).joined(separator: " ")

    XCTAssertEqual(command, expected)
    XCTAssertTrue(expectedScript.contains("printf '\\033[?1007l'"))
    XCTAssertTrue(expectedScript.contains("'TMUX='"))
    XCTAssertTrue(expectedScript.contains("'TMUX_PANE='"))
  }

  func testShouldAutoCreateInitialTerminalRequiresPendingEmptyCanvasAndNoExistingTerminals() {
    let workspaceID = "workspace-1"
    let emptyDocument = defaultCanvasDocument(for: workspaceID)
    let envelope = BridgeWorkspaceTerminalsEnvelope(
      workspace: BridgeWorkspaceScope(
        binding: "current",
        workspaceID: workspaceID,
        workspaceName: "Workspace",
        repoName: "Repo",
        host: "local",
        status: "active",
        sourceRef: "main",
        cwd: "/tmp/workspace",
        workspaceRoot: "/tmp/workspace",
        resolutionNote: nil,
        resolutionError: nil
      ),
      runtime: BridgeTerminalRuntime(
        backendLabel: "tmux",
        runtimeID: "runtime-1",
        launchError: nil,
        persistent: true,
        supportsCreate: true,
        supportsClose: true,
        supportsConnect: true,
        supportsRename: true
      ),
      terminals: []
    )

    XCTAssertTrue(
      shouldAutoCreateInitialTerminal(
        isPendingInitialTerminal: true,
        canvasDocument: emptyDocument,
        terminalEnvelope: envelope
      )
    )
    XCTAssertFalse(
      shouldAutoCreateInitialTerminal(
        isPendingInitialTerminal: false,
        canvasDocument: emptyDocument,
        terminalEnvelope: envelope
      )
    )
  }

  func testShouldAutoCreateInitialTerminalSkipsWhenWorkspaceAlreadyHasContentOrTerminalCreationUnavailable() {
    let workspaceID = "workspace-1"
    let surfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let nonEmptyDocument = WorkspaceCanvasDocument(
      activeGroupID: defaultCanvasGroupID(for: workspaceID),
      groupsByID: [
        defaultCanvasGroupID(for: workspaceID): CanvasGroup(
          id: defaultCanvasGroupID(for: workspaceID),
          surfaceOrder: [surfaceID],
          activeSurfaceID: surfaceID
        ),
      ],
      surfacesByID: [
        surfaceID: terminalSurfaceRecord(id: surfaceID, title: "shell"),
      ],
      layout: .tiled(.group(defaultCanvasGroupID(for: workspaceID)))
    )
    let blockedEnvelope = BridgeWorkspaceTerminalsEnvelope(
      workspace: BridgeWorkspaceScope(
        binding: "current",
        workspaceID: workspaceID,
        workspaceName: "Workspace",
        repoName: "Repo",
        host: "local",
        status: "active",
        sourceRef: "main",
        cwd: "/tmp/workspace",
        workspaceRoot: "/tmp/workspace",
        resolutionNote: nil,
        resolutionError: nil
      ),
      runtime: BridgeTerminalRuntime(
        backendLabel: "tmux",
        runtimeID: "runtime-1",
        launchError: "terminal runtime unavailable",
        persistent: true,
        supportsCreate: false,
        supportsClose: true,
        supportsConnect: true,
        supportsRename: true
      ),
      terminals: [
        BridgeTerminalRecord(id: "@1", title: "shell", kind: "shell", busy: false),
      ]
    )

    XCTAssertFalse(
      shouldAutoCreateInitialTerminal(
        isPendingInitialTerminal: true,
        canvasDocument: nonEmptyDocument,
        terminalEnvelope: blockedEnvelope
      )
    )
    XCTAssertFalse(
      shouldAutoCreateInitialTerminal(
        isPendingInitialTerminal: true,
        canvasDocument: defaultCanvasDocument(for: workspaceID),
        terminalEnvelope: blockedEnvelope
      )
    )
  }

  func testNextTerminalCreationTitleUsesGenericShellTabsAndProfileSpecificNames() {
    let terminals = [
      BridgeTerminalRecord(id: "@1", title: "Tab 2", kind: "shell", busy: false),
      BridgeTerminalRecord(id: "@2", title: "Claude", kind: "claude", busy: false),
      BridgeTerminalRecord(id: "@3", title: "Claude 2", kind: "claude", busy: false),
      BridgeTerminalRecord(id: "@4", title: "Codex", kind: "codex", busy: false),
    ]

    XCTAssertEqual(nextTerminalCreationTitle(from: terminals, kind: .shell), "Tab 5")
    XCTAssertEqual(nextTerminalCreationTitle(from: terminals, kind: .claude), "Claude 3")
    XCTAssertEqual(nextTerminalCreationTitle(from: terminals, kind: .codex), "Codex 2")
    XCTAssertNil(nextTerminalCreationTitle(from: terminals, kind: Optional<BridgeTerminalKind>.none))
  }

  func testLastClosedSurfaceIndexPrefersMostRecentMatchingWorkspace() {
    let snapshots = [
      ClosedSurfaceSnapshot(
        workspaceID: "workspace-1",
        surface: terminalSurfaceRecord(id: "surface:workspace-1:@1", title: "Tab 1"),
        groupID: nil
      ),
      ClosedSurfaceSnapshot(
        workspaceID: "workspace-2",
        surface: terminalSurfaceRecord(id: "surface:workspace-2:@1", title: "Tab 1"),
        groupID: nil
      ),
      ClosedSurfaceSnapshot(
        workspaceID: "workspace-1",
        surface: terminalSurfaceRecord(id: "surface:workspace-1:@2", title: "Tab 2"),
        groupID: nil
      ),
    ]

    XCTAssertEqual(lastClosedSurfaceIndex(in: snapshots, workspaceID: "workspace-1"), 2)
    XCTAssertEqual(lastClosedSurfaceIndex(in: snapshots, workspaceID: "workspace-2"), 1)
    XCTAssertEqual(lastClosedSurfaceIndex(in: snapshots, workspaceID: nil), 2)
    XCTAssertNil(lastClosedSurfaceIndex(in: snapshots, workspaceID: "workspace-3"))
  }

  @MainActor
  func testTerminalHostSurfaceContextResolvesOwningWorkspaceAndGroup() {
    let model = AppModel()
    let workspaceID = "workspace-1"
    let groupID = defaultCanvasGroupID(for: workspaceID)
    let surfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    model.canvasDocumentsByWorkspaceID[workspaceID] = WorkspaceCanvasDocument(
      activeGroupID: groupID,
      groupsByID: [
        groupID: CanvasGroup(
          id: groupID,
          surfaceOrder: [surfaceID],
          activeSurfaceID: surfaceID
        ),
      ],
      surfacesByID: [
        surfaceID: terminalSurfaceRecord(id: surfaceID, title: "Tab 1"),
      ],
      layout: .tiled(.group(groupID))
    )

    XCTAssertEqual(
      model.terminalHostSurfaceContext(for: terminalHostID(for: surfaceID)),
      TerminalHostSurfaceContext(
        workspaceID: workspaceID,
        surfaceID: surfaceID,
        groupID: groupID
      )
    )
    XCTAssertNil(model.terminalHostSurfaceContext(for: surfaceID))
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

  func testNormalizeCanvasDocumentKeepsSpatialLayoutAlignedWithSharedGroups() {
    let workspaceID = "workspace-1"
    let firstGroupID = defaultCanvasGroupID(for: workspaceID)
    let secondGroupID = "group:\(workspaceID):two"
    let staleGroupID = "group:\(workspaceID):stale"
    let firstSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let secondSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let document = WorkspaceCanvasDocument(
      activeGroupID: secondGroupID,
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
      activeLayoutMode: .spatial,
      tiledLayout: .split(
        CanvasTiledLayoutSplit(
          id: "split:\(workspaceID):1",
          direction: .row,
          first: .group(firstGroupID),
          second: .group(secondGroupID),
          ratio: 0.5
        )
      ),
      spatialLayout: CanvasSpatialLayout(
        framesByGroupID: [
          firstGroupID: CanvasSpatialFrame(
            x: 40,
            y: 60,
            width: 800,
            height: 500,
            zIndex: 7
          ),
          staleGroupID: CanvasSpatialFrame(
            x: 10,
            y: 20,
            width: 100,
            height: 100,
            zIndex: 1
          ),
        ]
      )
    )

    let normalized = normalizeCanvasDocument(
      document,
      workspaceID: workspaceID,
      surfaceOrderPreference: []
    )

    XCTAssertEqual(normalized.activeLayoutMode, .spatial)
    XCTAssertEqual(
      Set(normalized.spatialLayout.framesByGroupID.keys),
      Set([firstGroupID, secondGroupID])
    )
    XCTAssertEqual(normalized.spatialLayout.framesByGroupID[firstGroupID]?.x, 40)
    XCTAssertNotNil(normalized.spatialLayout.framesByGroupID[secondGroupID])
  }

  func testCanvasSpatialLayoutBringingGroupToFrontAssignsHighestZIndex() {
    let layout = CanvasSpatialLayout(
      framesByGroupID: [
        "group-1": CanvasSpatialFrame(x: 40, y: 60, width: 800, height: 520, zIndex: 2),
        "group-2": CanvasSpatialFrame(x: 120, y: 140, width: 760, height: 480, zIndex: 5),
      ]
    )

    let updated = canvasSpatialLayoutBringingGroupToFront(layout, groupID: "group-1")

    XCTAssertEqual(updated.framesByGroupID["group-1"]?.zIndex, 6)
    XCTAssertEqual(updated.framesByGroupID["group-2"]?.zIndex, 5)
  }

  func testCanvasSpatialLayoutPlacingGroupOffsetsNewGroupBesideAnchor() throws {
    let layout = CanvasSpatialLayout(
      framesByGroupID: [
        "anchor": CanvasSpatialFrame(x: 100, y: 120, width: 900, height: 600, zIndex: 1),
        "new": CanvasSpatialFrame(x: 0, y: 0, width: 900, height: 600, zIndex: 0),
      ]
    )

    let updated = canvasSpatialLayoutPlacingGroup(
      layout,
      groupID: "new",
      adjacentTo: "anchor",
      direction: .row,
      placeBefore: false
    )

    let frame = try XCTUnwrap(updated.framesByGroupID["new"])
    XCTAssertGreaterThan(frame.x, 1_000)
    XCTAssertEqual(frame.width, 792, accuracy: 0.001)
    XCTAssertEqual(frame.zIndex, 2)
  }

  func testCanvasDocumentAddingSurfaceCreatesNewGroupWhenSpatialCanvasAddsTerminal() throws {
    let workspaceID = "workspace-1"
    let rootGroupID = defaultCanvasGroupID(for: workspaceID)
    let existingSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let newSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let document = WorkspaceCanvasDocument(
      activeGroupID: rootGroupID,
      groupsByID: [
        rootGroupID: CanvasGroup(
          id: rootGroupID,
          surfaceOrder: [existingSurfaceID],
          activeSurfaceID: existingSurfaceID
        )
      ],
      surfacesByID: [
        existingSurfaceID: terminalSurfaceRecord(id: existingSurfaceID, title: "Terminal 1")
      ],
      activeLayoutMode: .spatial,
      tiledLayout: .group(rootGroupID),
      spatialLayout: CanvasSpatialLayout(
        framesByGroupID: [
          rootGroupID: CanvasSpatialFrame(x: 120, y: 100, width: 900, height: 600, zIndex: 1)
        ]
      )
    )

    let updated = canvasDocumentAddingSurface(
      terminalSurfaceRecord(id: newSurfaceID, title: "Terminal 2"),
      to: document,
      workspaceID: workspaceID
    )

    let newGroupID = try XCTUnwrap(updated.activeGroupID)
    XCTAssertNotEqual(newGroupID, rootGroupID)
    XCTAssertEqual(updated.groupsByID[rootGroupID]?.surfaceOrder, [existingSurfaceID])
    XCTAssertEqual(updated.groupsByID[newGroupID]?.surfaceOrder, [newSurfaceID])
    XCTAssertEqual(updated.groupsByID[newGroupID]?.activeSurfaceID, newSurfaceID)
    XCTAssertNotNil(updated.surfacesByID[newSurfaceID])
    XCTAssertEqual(Set(canvasGroupIDs(in: updated.tiledLayout)), Set([rootGroupID, newGroupID]))
    XCTAssertNotNil(updated.spatialLayout.framesByGroupID[newGroupID])
  }

  func testCanvasDocumentAddingSurfaceAppendsToExplicitSpatialGroup() {
    let workspaceID = "workspace-1"
    let rootGroupID = defaultCanvasGroupID(for: workspaceID)
    let existingSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let newSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let document = WorkspaceCanvasDocument(
      activeGroupID: rootGroupID,
      groupsByID: [
        rootGroupID: CanvasGroup(
          id: rootGroupID,
          surfaceOrder: [existingSurfaceID],
          activeSurfaceID: existingSurfaceID
        )
      ],
      surfacesByID: [
        existingSurfaceID: terminalSurfaceRecord(id: existingSurfaceID, title: "Terminal 1")
      ],
      activeLayoutMode: .spatial,
      tiledLayout: .group(rootGroupID),
      spatialLayout: CanvasSpatialLayout(
        framesByGroupID: [
          rootGroupID: CanvasSpatialFrame(x: 120, y: 100, width: 900, height: 600, zIndex: 1)
        ]
      )
    )

    let updated = canvasDocumentAddingSurface(
      terminalSurfaceRecord(id: newSurfaceID, title: "Terminal 2"),
      to: document,
      workspaceID: workspaceID,
      groupID: rootGroupID
    )

    XCTAssertEqual(updated.activeGroupID, rootGroupID)
    XCTAssertEqual(updated.groupsByID[rootGroupID]?.surfaceOrder, [existingSurfaceID, newSurfaceID])
    XCTAssertEqual(updated.groupsByID[rootGroupID]?.activeSurfaceID, newSurfaceID)
    XCTAssertEqual(canvasGroupIDs(in: updated.tiledLayout), [rootGroupID])
    XCTAssertEqual(updated.spatialLayout.framesByGroupID.count, 1)
  }

  func testMoveSurfaceToEdgePlacesNewSpatialGroupBesideTarget() throws {
    let workspaceID = "workspace-1"
    let sourceGroupID = defaultCanvasGroupID(for: workspaceID)
    let targetGroupID = "group:\(workspaceID):target"
    let sourceSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@1")
    let targetSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let targetFrame = CanvasSpatialFrame(
      x: 260,
      y: 180,
      width: 840,
      height: 560,
      zIndex: 3
    )
    let document = WorkspaceCanvasDocument(
      activeGroupID: sourceGroupID,
      groupsByID: [
        sourceGroupID: CanvasGroup(
          id: sourceGroupID,
          surfaceOrder: [sourceSurfaceID],
          activeSurfaceID: sourceSurfaceID
        ),
        targetGroupID: CanvasGroup(
          id: targetGroupID,
          surfaceOrder: [targetSurfaceID],
          activeSurfaceID: targetSurfaceID
        ),
      ],
      surfacesByID: [
        sourceSurfaceID: terminalSurfaceRecord(id: sourceSurfaceID, title: "Source"),
        targetSurfaceID: terminalSurfaceRecord(id: targetSurfaceID, title: "Target"),
      ],
      activeLayoutMode: .spatial,
      tiledLayout: .split(
        CanvasTiledLayoutSplit(
          id: "split:\(workspaceID):1",
          direction: .row,
          first: .group(sourceGroupID),
          second: .group(targetGroupID),
          ratio: 0.5
        )
      ),
      spatialLayout: CanvasSpatialLayout(
        framesByGroupID: [
          sourceGroupID: CanvasSpatialFrame(x: 80, y: 80, width: 840, height: 560, zIndex: 1),
          targetGroupID: targetFrame,
        ]
      )
    )

    let moved = moveSurfaceToEdge(
      in: document,
      surfaceID: sourceSurfaceID,
      targetGroupID: targetGroupID,
      edge: .right,
      workspaceID: workspaceID
    )
    let newGroupIDs = Set(moved.groupsByID.keys).subtracting([sourceGroupID, targetGroupID])
    let newGroupID = try XCTUnwrap(newGroupIDs.first)
    let newFrame = try XCTUnwrap(moved.spatialLayout.framesByGroupID[newGroupID])

    XCTAssertGreaterThan(newFrame.x, targetFrame.x + targetFrame.width)
    XCTAssertEqual(newFrame.zIndex, 4)
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

  func testSynchronizedCanvasDocumentPreservesAgentSurfaceBeforeSessionListLoads() {
    let workspaceID = "workspace-1"
    let groupID = defaultCanvasGroupID(for: workspaceID)
    let agentID = "session-1"
    let surfaceID = agentSurfaceID(for: workspaceID, agentID: agentID)
    let document = WorkspaceCanvasDocument(
      activeGroupID: groupID,
      groupsByID: [
        groupID: CanvasGroup(
          id: groupID,
          surfaceOrder: [surfaceID],
          activeSurfaceID: surfaceID
        ),
      ],
      surfacesByID: [
        surfaceID: agentSurfaceRecord(
          id: surfaceID,
          workspaceID: workspaceID,
          agentID: agentID,
          title: "Codex"
        ),
      ],
      layout: .tiled(.group(groupID))
    )

    let synchronized = synchronizedCanvasDocument(
      document,
      workspaceID: workspaceID,
      terminalSurfaceRecords: [],
      liveAgentIDs: nil,
      surfaceOrderPreference: []
    )

    XCTAssertEqual(synchronized.surfacesByID.keys.sorted(), [surfaceID])
    XCTAssertEqual(synchronized.groupsByID[groupID]?.surfaceOrder, [surfaceID])
    XCTAssertEqual(synchronized.groupsByID[groupID]?.activeSurfaceID, surfaceID)
  }

  func testSynchronizedCanvasDocumentDropsMissingAgentSurfaceAfterAuthoritativeSessionLoad() {
    let workspaceID = "workspace-1"
    let groupID = defaultCanvasGroupID(for: workspaceID)
    let agentID = "session-1"
    let surfaceID = agentSurfaceID(for: workspaceID, agentID: agentID)
    let document = WorkspaceCanvasDocument(
      activeGroupID: groupID,
      groupsByID: [
        groupID: CanvasGroup(
          id: groupID,
          surfaceOrder: [surfaceID],
          activeSurfaceID: surfaceID
        ),
      ],
      surfacesByID: [
        surfaceID: agentSurfaceRecord(
          id: surfaceID,
          workspaceID: workspaceID,
          agentID: agentID,
          title: "Codex"
        ),
      ],
      layout: .tiled(.group(groupID))
    )

    let synchronized = synchronizedCanvasDocument(
      document,
      workspaceID: workspaceID,
      terminalSurfaceRecords: [],
      liveAgentIDs: [],
      surfaceOrderPreference: []
    )

    XCTAssertTrue(synchronized.surfacesByID.isEmpty)
    XCTAssertEqual(synchronized.groupsByID[groupID]?.surfaceOrder, [])
    XCTAssertNil(synchronized.groupsByID[groupID]?.activeSurfaceID)
  }

  func testWorkspaceCanvasDocumentStoreRoundTripsAgentSurfaceRecords() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer {
      try? FileManager.default.removeItem(at: rootURL)
    }

    let workspaceID = "workspace-1"
    let groupID = defaultCanvasGroupID(for: workspaceID)
    let agentID = "session-1"
    let surfaceID = agentSurfaceID(for: workspaceID, agentID: agentID)
    let documents = [
      workspaceID: WorkspaceCanvasDocument(
        activeGroupID: groupID,
        groupsByID: [
          groupID: CanvasGroup(
            id: groupID,
            surfaceOrder: [surfaceID],
            activeSurfaceID: surfaceID
          ),
        ],
        surfacesByID: [
          surfaceID: agentSurfaceRecord(
            id: surfaceID,
            workspaceID: workspaceID,
            agentID: agentID,
            title: "Codex"
          ),
        ],
        layout: .tiled(.group(groupID))
      ),
    ]

    try WorkspaceCanvasDocumentStore.writeState(
      WorkspaceCanvasDocumentStoreState(
        documentsByWorkspaceID: documents,
        closedSurfaceIDsByWorkspaceID: [:]
      ),
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    let restored = try WorkspaceCanvasDocumentStore.readState(
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    XCTAssertEqual(
      restored.documentsByWorkspaceID[workspaceID]?.surfacesByID[surfaceID]?.surfaceKind,
      .agent
    )
    XCTAssertEqual(
      AgentSurfaceBinding(
        binding: restored.documentsByWorkspaceID[workspaceID]?.surfacesByID[surfaceID]?.binding ??
          SurfaceBinding(params: [:])
      )?.agentID,
      agentID
    )
  }

  func testWorkspaceCanvasDocumentStoreRoundTripsClosedSurfaceIDs() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer {
      try? FileManager.default.removeItem(at: rootURL)
    }

    let workspaceID = "workspace-1"
    let hiddenSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let state = WorkspaceCanvasDocumentStoreState(
      documentsByWorkspaceID: [
        workspaceID: defaultCanvasDocument(for: workspaceID),
      ],
      closedSurfaceIDsByWorkspaceID: [
        workspaceID: [hiddenSurfaceID],
      ]
    )

    try WorkspaceCanvasDocumentStore.writeState(
      state,
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    let restored = try WorkspaceCanvasDocumentStore.readState(
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    XCTAssertEqual(restored.closedSurfaceIDsByWorkspaceID[workspaceID], [hiddenSurfaceID])
  }

  func testDesktopUIStateStoreKeepsTypedSectionsInOneFile() throws {
    let rootURL = FileManager.default.temporaryDirectory
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    defer {
      try? FileManager.default.removeItem(at: rootURL)
    }

    let environment = ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    let workspaceID = "workspace-1"
    let hiddenSurfaceID = terminalSurfaceID(for: workspaceID, terminalID: "@2")
    let canvasState = WorkspaceCanvasDocumentStoreState(
      documentsByWorkspaceID: [
        workspaceID: defaultCanvasDocument(for: workspaceID),
      ],
      closedSurfaceIDsByWorkspaceID: [
        workspaceID: [hiddenSurfaceID],
      ]
    )
    let appSidebarState = AppSidebarLayoutState(
      expandedRepositoryIDs: ["repo-1"],
      width: 300
    )
    let extensionSidebarState = [
      workspaceID: WorkspaceExtensionSidebarLayoutState(
        activeKind: .debug,
        collapsedKinds: [.stack],
        width: 360
      ),
    ]

    try WorkspaceCanvasDocumentStore.writeState(canvasState, environment: environment)
    try AppSidebarLayoutStore.write(appSidebarState, environment: environment)
    try WorkspaceExtensionSidebarLayoutStore.write(extensionSidebarState, environment: environment)

    let restoredCanvasState = try WorkspaceCanvasDocumentStore.readState(environment: environment)
    let restoredAppSidebarState = try AppSidebarLayoutStore.read(environment: environment)
    let restoredExtensionSidebarState = try WorkspaceExtensionSidebarLayoutStore.read(environment: environment)
    let uiURL = rootURL
      .appendingPathComponent(LifecyclePathDefaults.cacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.desktopMacCacheDirectoryName, isDirectory: true)
      .appendingPathComponent("ui.json")

    XCTAssertTrue(FileManager.default.fileExists(atPath: uiURL.path))
    XCTAssertEqual(restoredCanvasState.closedSurfaceIDsByWorkspaceID[workspaceID], [hiddenSurfaceID])
    XCTAssertEqual(restoredAppSidebarState, appSidebarState)
    XCTAssertEqual(restoredExtensionSidebarState, extensionSidebarState)
  }

  func testWorkspaceCanvasDocumentDecodesLegacyLayoutPayload() throws {
    let workspaceID = "workspace-1"
    let groupID = defaultCanvasGroupID(for: workspaceID)
    let json = """
      {
        "activeGroupID": "\(groupID)",
        "groupsByID": {
          "\(groupID)": {
            "id": "\(groupID)",
            "surfaceOrder": [],
            "activeSurfaceID": null
          }
        },
        "surfacesByID": {},
        "layout": {
          "kind": "tiled",
          "tiledRoot": {
            "kind": "group",
            "groupID": "\(groupID)"
          }
        }
      }
      """

    let document = try JSONDecoder().decode(
      WorkspaceCanvasDocument.self,
      from: Data(json.utf8)
    )

    XCTAssertEqual(document.activeLayoutMode, .tiled)
    XCTAssertEqual(canvasGroupIDs(in: document.tiledLayout), [groupID])
    XCTAssertEqual(Set(document.spatialLayout.framesByGroupID.keys), Set([groupID]))
  }

  @MainActor
  func testAgentSurfaceDefinitionResolvesWithoutHydratedSessionRecord() {
    let workspace = BridgeWorkspaceSummary(
      id: "workspace-1",
      name: "Workspace",
      host: "local",
      status: "active",
      ref: nil,
      path: "/tmp/workspace"
    )
    let record = agentSurfaceRecord(
      id: agentSurfaceID(for: workspace.id, agentID: "session-1"),
      workspaceID: workspace.id,
      agentID: "session-1",
      title: "Codex"
    )

    let resolved = AgentSurfaceDefinition().resolve(
      record: record,
      context: surfaceResolutionContext(workspace: workspace)
    )

    XCTAssertEqual(resolved?.tab.label, "Codex")
    XCTAssertEqual(resolved?.tab.icon, "sparkles")
  }

  @MainActor
  func testTerminalSurfaceDefinitionResolvesPendingSurfaceWithoutConnection() {
    let workspace = BridgeWorkspaceSummary(
      id: "workspace-1",
      name: "Workspace",
      host: "local",
      status: "active",
      ref: nil,
      path: "/tmp/workspace"
    )
    let terminalID = "@7"
    let surfaceID = terminalSurfaceID(for: workspace.id, terminalID: terminalID)
    let record = terminalSurfaceRecord(id: surfaceID, title: "shell")
    let terminal = BridgeTerminalRecord(id: terminalID, title: "Codex", kind: "codex", busy: false)

    let resolved = TerminalSurfaceDefinition().resolve(
      record: record,
      context: surfaceResolutionContext(
        workspace: workspace,
        terminalsByID: [terminalID: terminal]
      )
    )

    XCTAssertEqual(resolved?.tab.label, "Codex")
    XCTAssertEqual(resolved?.tab.icon, "asset:provider-openai")
  }

  func testBridgeDiscoveryParsesRegistrationPortAndPID() throws {
    let data = try JSONEncoder().encode(
      BridgeRegistration(pid: 4821, port: 52036)
    )

    let discovery = try XCTUnwrap(bridgeDiscovery(fromRegistrationData: data))

    XCTAssertEqual(discovery.pid, 4821)
    XCTAssertEqual(discovery.url.absoluteString, "http://127.0.0.1:52036")
  }

  func testBridgeRegistrationPathUsesRuntimeRootWhenPresent() {
    let path = BridgeBootstrap.bridgeRegistrationPath(
      environment: ["LIFECYCLE_RUNTIME_ROOT": "/tmp/lifecycle-runtime"]
    )

    XCTAssertEqual(path, "/tmp/lifecycle-runtime/bridge.json")
  }

  func testBridgeRegistrationPathPrefersExplicitOverride() {
    let path = BridgeBootstrap.bridgeRegistrationPath(
      environment: [
        "LIFECYCLE_RUNTIME_ROOT": "/tmp/lifecycle-runtime",
        "LIFECYCLE_BRIDGE_REGISTRATION": "/tmp/custom-bridge.json",
      ]
    )

    XCTAssertEqual(path, "/tmp/custom-bridge.json")
  }

  func testBridgeHealthAllowsHealthyBridgeOutsideDevMode() throws {
    let compatibleData = """
      {"ok":true,"healthy":true,"repoRoot":null}
      """.data(using: .utf8)!
    let payload = try JSONDecoder().decode(HealthPayload.self, from: compatibleData)

    XCTAssertTrue(bridgeHealthSupportsDesktopRuntime(payload, environment: LifecycleEnvironment(values: [:])))
  }

  func testWorkspaceCanvasDocumentContainsAgentSurfaceDetectsPersistedAgentTabs() {
    let emptyDocument = defaultCanvasDocument(for: "workspace-1")
    XCTAssertFalse(workspaceCanvasDocumentContainsAgentSurface(emptyDocument))

    let agentDocument = WorkspaceCanvasDocument(
      activeGroupID: "group:workspace-1:root",
      groupsByID: [
        "group:workspace-1:root": CanvasGroup(
          id: "group:workspace-1:root",
          surfaceOrder: ["surface:workspace-1:agent:1"],
          activeSurfaceID: "surface:workspace-1:agent:1"
        )
      ],
      surfacesByID: [
        "surface:workspace-1:agent:1": CanvasSurfaceRecord(
          id: "surface:workspace-1:agent:1",
          title: "Agent",
          surfaceKind: .agent,
          binding: SurfaceBinding(params: [:])
        )
      ],
      activeLayoutMode: .tiled,
      tiledLayout: .group("group:workspace-1:root"),
      spatialLayout: CanvasSpatialLayout(
        framesByGroupID: [
          "group:workspace-1:root": CanvasSpatialFrame(
            x: 0,
            y: 0,
            width: 800,
            height: 600,
            zIndex: 0
          )
        ]
      )
    )

    XCTAssertTrue(workspaceCanvasDocumentContainsAgentSurface(agentDocument))
  }

  func testBridgeStartProcessUsesRepoBridgeInDevMode() {
    let process = BridgeConfiguration.defaultStartProcess(
      environment: LifecycleEnvironment(values: [
        "LIFECYCLE_DEV": "1",
        "LIFECYCLE_REPO_ROOT": "/tmp/lifecycle",
        "LIFECYCLE_BRIDGE_PORT": "52300",
      ])
    )

    XCTAssertEqual(process.executableURL?.path, "/usr/bin/env")
    XCTAssertEqual(
      process.arguments ?? [],
      ["bun", "--cwd", "/tmp/lifecycle/apps/cli", "run", "src/bridge/app.ts", "--port", "52300"]
    )
  }

  func testBridgeStartProcessUsesConfiguredCliOutsideDevMode() {
    let process = BridgeConfiguration.defaultStartProcess(
      environment: LifecycleEnvironment(values: [
        "LIFECYCLE_CLI_PATH": "/tmp/lifecycle",
      ])
    )

    XCTAssertEqual(process.executableURL?.path, "/tmp/lifecycle")
    XCTAssertEqual(process.arguments ?? [], ["bridge", "start"])
    XCTAssertEqual(process.environment?["LIFECYCLE_CLI_PATH"], "/tmp/lifecycle")
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
          domain: "Lifecycle.Bridge",
          code: 404,
          userInfo: [NSLocalizedDescriptionKey: "Not found"]
        )
      )
    )
  }

  func testBridgeSocketDecodesAgentCreatedEvent() throws {
    let payload = """
      {
        "type": "agent.created",
        "kind": "agent.created",
        "workspaceId": "workspace-1",
        "agent": {
          "id": "session-1",
          "workspace_id": "workspace-1",
          "provider": "codex",
          "provider_id": null,
          "title": "Codex Session",
          "status": "starting",
          "last_message_at": null,
          "created_at": "2026-04-04T00:00:00.000Z",
          "updated_at": "2026-04-04T00:00:00.000Z"
        }
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .agent(let event) = decoded else {
      return XCTFail("Expected agent event.")
    }

    XCTAssertEqual(event.type, "agent.created")
    XCTAssertEqual(event.resolvedWorkspaceID, "workspace-1")
    XCTAssertEqual(event.resolvedAgentID, "session-1")
    XCTAssertEqual(event.agent?.provider, "codex")
    XCTAssertEqual(event.agent?.status, "starting")
  }

  func testBridgeSocketDecodesRawAgentProviderPayloads() throws {
    let payload = """
      {
        "type": "agent.provider.event",
        "kind": "agent.provider.event",
        "workspaceId": "workspace-1",
        "agentId": "session-1",
        "turnId": "turn-1",
        "eventType": "codex.notification.turn/started",
        "payload": {
          "jsonrpc": "2.0",
          "method": "turn/started",
          "params": {
            "turn": {
              "id": "provider-turn-1"
            }
          }
        }
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .agent(let event) = decoded else {
      return XCTFail("Expected agent event.")
    }

    XCTAssertEqual(event.type, "agent.provider.event")
    XCTAssertEqual(event.resolvedWorkspaceID, "workspace-1")
    XCTAssertEqual(event.resolvedAgentID, "session-1")
    XCTAssertEqual(event.turnID, "turn-1")
    XCTAssertEqual(event.eventType, "codex.notification.turn/started")

    guard case let .object(payloadObject)? = event.payload,
          case let .object(params)? = payloadObject["params"],
          case let .object(turn)? = params["turn"],
          case let .string(turnID)? = turn["id"]
    else {
      return XCTFail("Expected provider payload object.")
    }

    XCTAssertEqual(turnID, "provider-turn-1")
  }

  func testBridgeSocketDecodesProjectedAgentMessages() throws {
    let payload = """
      {
        "type": "agent.message.part.completed",
        "kind": "agent.message.part.completed",
        "occurredAt": "2026-04-06T18:00:01.000Z",
        "workspaceId": "workspace-1",
        "agentId": "session-1",
        "messageId": "turn-1:assistant",
        "partId": "turn-1:assistant:part:1",
        "part": {
          "type": "text",
          "text": "hello"
        },
        "projectedMessage": {
          "id": "turn-1:assistant",
          "agent_id": "session-1",
          "role": "assistant",
          "text": "hello",
          "turn_id": "turn-1",
          "created_at": "2026-04-06T18:00:00.000Z",
          "parts": [
            {
              "id": "turn-1:assistant:part:1",
              "message_id": "turn-1:assistant",
              "agent_id": "session-1",
              "part_index": 1,
              "part_type": "text",
              "text": "hello",
              "data": null,
              "created_at": "2026-04-06T18:00:00.000Z"
            }
          ]
        }
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .agent(let event) = decoded else {
      return XCTFail("Expected agent event.")
    }

    XCTAssertEqual(event.occurredAt, "2026-04-06T18:00:01.000Z")
    XCTAssertEqual(event.projectedMessage?.id, "turn-1:assistant")
    XCTAssertEqual(event.projectedMessage?.parts.count, 1)
  }

  func testBridgeSocketDecodesActivityEvent() throws {
    let payload = """
      {
        "type": "activity",
        "workspaces": [
          {
            "workspace_id": "workspace-1",
            "name": "main",
            "repo": "lifecycle",
            "busy": true,
            "updated_at": "2026-04-25T12:00:00.000Z",
            "terminals": [
              {
                "terminal_id": "@1",
                "state": "tool_active",
                "source": "explicit",
                "busy": true,
                "provider": "codex",
                "turn_id": "turn-1",
                "tool_name": "Bash",
                "waiting_kind": null,
                "last_event_at": "2026-04-25T12:00:00.000Z",
                "updated_at": "2026-04-25T12:00:00.000Z"
              }
            ]
          }
        ]
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .activity(let event) = decoded else {
      return XCTFail("Expected activity event.")
    }

    XCTAssertEqual(event.workspaces.count, 1)
    XCTAssertEqual(event.workspaces.first?.workspaceID, "workspace-1")
    XCTAssertEqual(event.workspaces.first?.busy, true)
    XCTAssertEqual(event.workspaces.first?.terminals.first?.terminalID, "@1")
    XCTAssertEqual(event.workspaces.first?.terminals.first?.state, "tool_active")
    XCTAssertEqual(event.workspaces.first?.terminals.first?.toolName, "Bash")
  }

  func testBridgeSocketDecodesServiceStartingEvent() throws {
    let payload = """
      {
        "type": "service.starting",
        "workspace_id": "workspace-1",
        "service": "api"
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .serviceStarting(let workspaceID, let service) = decoded else {
      return XCTFail("Expected service starting event.")
    }

    XCTAssertEqual(workspaceID, "workspace-1")
    XCTAssertEqual(service, "api")
  }

  func testMergeTerminalActivityUpdatesExistingAndKeepsExplicitOnlyRecords() {
    let terminals = [
      BridgeTerminalRecord(id: "@1", title: "Codex", kind: "codex", busy: false)
    ]
    let existingActivity = BridgeTerminalActivityRecord(
      terminalID: "@1",
      state: "tool_active",
      source: "explicit",
      busy: true,
      provider: "codex",
      prompt: "Implement prompt based tab titles",
      title: "Prompt Based Tab Titles",
      turnID: "turn-1",
      toolName: "Bash",
      waitingKind: nil,
      lastEventAt: "2026-04-25T12:00:00.000Z",
      updatedAt: "2026-04-25T12:00:00.000Z"
    )
    let explicitOnlyActivity = BridgeTerminalActivityRecord(
      terminalID: "@2",
      state: "waiting",
      source: "explicit",
      busy: true,
      provider: "claude-code",
      prompt: "Review the current diff and fix the tests",
      title: "Review Diff Fix Tests",
      turnID: "turn-2",
      toolName: nil,
      waitingKind: "approval",
      lastEventAt: "2026-04-25T12:00:01.000Z",
      updatedAt: "2026-04-25T12:00:01.000Z"
    )
    let heuristicOnlyActivity = BridgeTerminalActivityRecord(
      terminalID: "@3",
      state: "idle",
      source: "heuristic",
      busy: false,
      provider: nil,
      prompt: nil,
      title: nil,
      turnID: nil,
      toolName: nil,
      waitingKind: nil,
      lastEventAt: nil,
      updatedAt: nil
    )
    let activity = BridgeWorkspaceActivitySummary(
      workspaceID: "workspace-1",
      busy: true,
      terminals: [existingActivity, explicitOnlyActivity, heuristicOnlyActivity],
      updatedAt: "2026-04-25T12:00:01.000Z"
    )

    let merged = mergeTerminalActivity(terminals: terminals, activity: activity)

    XCTAssertEqual(merged.map(\.id), ["@1", "@2"])
    XCTAssertEqual(merged[0].busy, true)
    XCTAssertEqual(merged[0].title, "Prompt Based Tab Titles")
    XCTAssertEqual(merged[0].activity?.toolName, "Bash")
    XCTAssertEqual(merged[1].title, "Review Diff Fix Tests")
    XCTAssertEqual(merged[1].activity?.waitingKind, "approval")
  }

  func testMergeTerminalEnvelopeActivityPreservesRuntimeAndAppliesTitles() {
    let envelope = BridgeWorkspaceTerminalsEnvelope(
      workspace: BridgeWorkspaceScope(
        binding: "current",
        workspaceID: "workspace-1",
        workspaceName: "Workspace",
        repoName: "Repo",
        host: "local",
        status: "active",
        sourceRef: "main",
        cwd: "/repo",
        workspaceRoot: "/repo",
        resolutionNote: nil,
        resolutionError: nil
      ),
      runtime: BridgeTerminalRuntime(
        backendLabel: "tmux",
        runtimeID: "runtime-1",
        launchError: nil,
        persistent: true,
        supportsCreate: true,
        supportsClose: true,
        supportsConnect: true,
        supportsRename: true
      ),
      terminals: [
        BridgeTerminalRecord(id: "@1", title: "Codex", kind: "codex", busy: false)
      ]
    )
    let activity = BridgeWorkspaceActivitySummary(
      workspaceID: "workspace-1",
      busy: true,
      terminals: [
        BridgeTerminalActivityRecord(
          terminalID: "@1",
          state: "turn_active",
          source: "explicit",
          busy: true,
          provider: "codex",
          prompt: "we're testing our title generation",
          title: "Testing Title Generation",
          turnID: "turn-1",
          toolName: nil,
          waitingKind: nil,
          lastEventAt: "2026-04-25T12:00:00.000Z",
          updatedAt: "2026-04-25T12:00:00.000Z"
        )
      ],
      updatedAt: "2026-04-25T12:00:00.000Z"
    )

    let merged = mergeTerminalEnvelopeActivity(envelope: envelope, activity: activity)

    XCTAssertEqual(merged.workspace.workspaceID, "workspace-1")
    XCTAssertEqual(merged.runtime.supportsCreate, true)
    XCTAssertEqual(merged.terminals[0].title, "Testing Title Generation")
    XCTAssertEqual(merged.terminals[0].activity?.prompt, "we're testing our title generation")
  }

  func testBridgeSocketDecodesServiceStoppingEvent() throws {
    let payload = """
      {
        "type": "service.stopping",
        "workspace_id": "workspace-1",
        "service": "api"
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try XCTUnwrap(decodeBridgeSocketEvent(from: data))

    guard case .serviceStopping(let workspaceID, let service) = decoded else {
      return XCTFail("Expected service stopping event.")
    }

    XCTAssertEqual(workspaceID, "workspace-1")
    XCTAssertEqual(service, "api")
  }

  @MainActor
  func testRenderedSurfacesOnlyReturnsActiveTab() {
    let firstSurface = canvasSurface(id: "surface:workspace-1:@1", title: "Tab 1")
    let secondSurface = canvasSurface(id: "surface:workspace-1:@2", title: "Tab 2")

    let rendered = renderedSurfaces(
      for: [firstSurface, secondSurface],
      activeSurfaceID: secondSurface.id,
      groupIsActive: true
    )

    XCTAssertEqual(rendered.map(\.id), [secondSurface.id])
    XCTAssertEqual(
      rendered[0].renderState,
      SurfaceRenderState(
        isFocused: true,
        isVisible: true,
        isInteractionBlocked: false,
        presentationScale: 1
      )
    )
  }

  @MainActor
  func testRenderedSurfacesCanBlockSurfaceInteractionDuringCanvasDrag() {
    let surface = canvasSurface(id: "surface:workspace-1:@1", title: "Tab 1")

    let rendered = renderedSurfaces(
      for: [surface],
      activeSurfaceID: surface.id,
      groupIsActive: true,
      isInteractionBlocked: true
    )

    XCTAssertEqual(rendered[0].renderState.isInteractionBlocked, true)
  }

  func testAgentSurfaceBindingRoundTripsWorkspaceAndAgent() throws {
    let binding = AgentSurfaceBinding(workspaceID: "workspace-1", agentID: "session-1")
    let decoded = try XCTUnwrap(AgentSurfaceBinding(binding: binding.surfaceBinding))

    XCTAssertEqual(decoded.workspaceID, "workspace-1")
    XCTAssertEqual(decoded.agentID, "session-1")
    XCTAssertEqual(agentSurfaceID(for: "workspace-1", agentID: "session-1"), "surface:workspace-1:agent:session-1")
  }

  func testTerminalIdentifiersCanonicalizePollutedWindowIDs() throws {
    XCTAssertEqual(canonicalTmuxTerminalID("@8_Tab_4_0_0"), "@8")
    XCTAssertEqual(canonicalTmuxTerminalID("@8 Tab 4 0 0"), "@8")
    XCTAssertEqual(canonicalTmuxTerminalID("0104"), "@104")
    XCTAssertEqual(terminalSurfaceID(for: "workspace-1", terminalID: "@8_Tab_4_0_0"), "surface:workspace-1:@8")
    XCTAssertEqual(terminalSurfaceID(for: "workspace-1", terminalID: "0104"), "surface:workspace-1:@104")

    let binding = try XCTUnwrap(
      TerminalSurfaceBinding(
        binding: SurfaceBinding(
          params: [
            "workspaceID": "workspace-1",
            "terminalID": "@8_Tab_4_0_0",
          ]
        )
      )
    )

    XCTAssertEqual(binding.terminalID, "@8")
    XCTAssertEqual(TerminalSurfaceBinding(workspaceID: "workspace-1", terminalID: "0104").terminalID, "@104")
  }

  func testBridgeTerminalDecodingCanonicalizesPollutedTerminalIDs() throws {
    let terminalsPayload = """
      {
        "workspace": {
          "binding": "workspace-1",
          "workspace_id": "workspace-1",
          "workspace_name": "Workspace",
          "repo_name": "repo",
          "host": "local",
          "status": "active",
          "source_ref": "main",
          "cwd": "/tmp/workspace",
          "workspace_root": "/tmp/workspace",
          "resolution_note": null,
          "resolution_error": null
        },
        "runtime": {
          "backend_label": "local tmux",
          "runtime_id": "runtime-1",
          "launch_error": null,
          "persistent": true,
          "supports_create": true,
          "supports_close": true,
          "supports_connect": true,
          "supports_rename": false
        },
        "terminals": [
          {
            "id": "@8_Tab_4_0_0",
            "title": "Tab 4",
            "kind": "custom",
            "busy": false
          }
        ]
      }
      """

    let terminalsData = try XCTUnwrap(terminalsPayload.data(using: .utf8))
    let terminalsEnvelope = try JSONDecoder().decode(BridgeWorkspaceTerminalsEnvelope.self, from: terminalsData)
    XCTAssertEqual(terminalsEnvelope.terminals[0].id, "@8")

    let connectionPayload = """
      {
        "workspace": {
          "binding": "workspace-1",
          "workspace_id": "workspace-1",
          "workspace_name": "Workspace",
          "repo_name": "repo",
          "host": "local",
          "status": "active",
          "source_ref": "main",
          "cwd": "/tmp/workspace",
          "workspace_root": "/tmp/workspace",
          "resolution_note": null,
          "resolution_error": null
        },
        "runtime": {
          "backend_label": "local tmux",
          "runtime_id": "runtime-1",
          "launch_error": null,
          "persistent": true,
          "supports_create": true,
          "supports_close": true,
          "supports_connect": true,
          "supports_rename": false
        },
        "connection": {
          "connection_id": "conn-1",
          "terminal_id": "@8_Tab_4_0_0",
          "launch_error": null,
          "transport": null
        }
      }
      """

    let connectionData = try XCTUnwrap(connectionPayload.data(using: .utf8))
    let connectionEnvelope = try JSONDecoder().decode(
      BridgeWorkspaceTerminalConnectionEnvelope.self,
      from: connectionData
    )
    XCTAssertEqual(connectionEnvelope.connection.terminalID, "@8")
  }

  func testBridgeTerminalDecodingSurvivesMissingNonCriticalFields() throws {
    let payload = """
      {
        "workspace": {
          "binding": "bound",
          "workspace_id": "workspace-1",
          "workspace_name": "Workspace",
          "repo_name": "repo",
          "host": "local",
          "status": "active",
          "source_ref": "main",
          "cwd": "/tmp/workspace",
          "workspace_root": "/tmp/workspace",
          "resolution_note": null,
          "resolution_error": null
        },
        "runtime": {
          "backend_label": "local tmux",
          "runtime_id": "runtime-1",
          "launch_error": null,
          "persistent": true,
          "supports_create": true,
          "supports_close": true,
          "supports_connect": true
        },
        "terminals": [
          {
            "id": "@8"
          }
        ]
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let envelope = try JSONDecoder().decode(BridgeWorkspaceTerminalsEnvelope.self, from: data)

    XCTAssertEqual(envelope.runtime.backendLabel, "local tmux")
    XCTAssertFalse(envelope.runtime.supportsRename)
    XCTAssertEqual(envelope.terminals[0].id, "@8")
    XCTAssertEqual(envelope.terminals[0].title, "@8")
    XCTAssertEqual(envelope.terminals[0].kind, "shell")
    XCTAssertFalse(envelope.terminals[0].busy)
  }

  func testBridgeTerminalDecodingSurvivesMissingRuntimeAndTerminalList() throws {
    let payload = """
      {
        "workspace": {
          "binding": "bound",
          "workspace_id": "workspace-1",
          "workspace_name": "Workspace",
          "repo_name": "repo",
          "host": "local",
          "status": "active",
          "source_ref": "main",
          "cwd": "/tmp/workspace",
          "workspace_root": "/tmp/workspace",
          "resolution_note": null,
          "resolution_error": null
        }
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let envelope = try JSONDecoder().decode(BridgeWorkspaceTerminalsEnvelope.self, from: data)

    XCTAssertEqual(envelope.runtime.backendLabel, "unavailable")
    XCTAssertNotNil(envelope.runtime.launchError)
    XCTAssertTrue(envelope.terminals.isEmpty)
  }

  func testBridgeAgentSnapshotDecodesTranscriptMessages() throws {
    let payload = """
      {
        "agent": {
          "id": "session-1",
          "workspace_id": "workspace-1",
          "provider": "claude",
          "provider_id": null,
          "title": "",
          "status": "waiting_approval",
          "last_message_at": "2026-04-05T00:00:00.000Z",
          "created_at": "2026-04-05T00:00:00.000Z",
          "updated_at": "2026-04-05T00:00:00.000Z"
        },
        "messages": [
          {
            "id": "turn-1:assistant",
            "agent_id": "session-1",
            "role": "assistant",
            "text": "Need approval.",
            "turn_id": "turn-1",
            "created_at": "2026-04-05T00:00:00.000Z",
            "parts": [
              {
                "id": "part-1",
                "message_id": "turn-1:assistant",
                "agent_id": "session-1",
                "part_index": 1,
                "part_type": "approval_ref",
                "text": null,
                "data": "{\\"approval_id\\":\\"approval-1\\",\\"kind\\":\\"command\\",\\"message\\":\\"Run git status?\\",\\"status\\":\\"pending\\"}",
                "created_at": "2026-04-05T00:00:00.000Z"
              }
            ]
          }
        ]
      }
      """

    let data = try XCTUnwrap(payload.data(using: .utf8))
    let decoded = try JSONDecoder().decode(BridgeAgentSnapshotEnvelope.self, from: data)

    XCTAssertEqual(decoded.agent.id, "session-1")
    XCTAssertEqual(decoded.messages.count, 1)
    XCTAssertEqual(decoded.messages[0].parts[0].partType, "approval_ref")
    XCTAssertEqual(
      decoded.messages[0].parts[0].decodeData(as: BridgeAgentApprovalPartData.self)?.approvalID,
      "approval-1"
    )
  }

  func testNextCanvasActiveSurfaceIDAfterClosingSelectsRightNeighbor() {
    XCTAssertEqual(
      nextCanvasActiveSurfaceIDAfterClosing(
        "surface:workspace-1:@2",
        in: [
          "surface:workspace-1:@1",
          "surface:workspace-1:@2",
          "surface:workspace-1:@3",
        ],
        activeSurfaceID: "surface:workspace-1:@2"
      ),
      "surface:workspace-1:@3"
    )
  }

  func testNextCanvasActiveSurfaceIDAfterClosingFallsBackToLeftForLastTab() {
    XCTAssertEqual(
      nextCanvasActiveSurfaceIDAfterClosing(
        "surface:workspace-1:@3",
        in: [
          "surface:workspace-1:@1",
          "surface:workspace-1:@2",
          "surface:workspace-1:@3",
        ],
        activeSurfaceID: "surface:workspace-1:@3"
      ),
      "surface:workspace-1:@2"
    )
  }

  func testNextCanvasActiveSurfaceIDAfterClosingInactiveTabPreservesSelection() {
    XCTAssertEqual(
      nextCanvasActiveSurfaceIDAfterClosing(
        "surface:workspace-1:@1",
        in: [
          "surface:workspace-1:@1",
          "surface:workspace-1:@2",
          "surface:workspace-1:@3",
        ],
        activeSurfaceID: "surface:workspace-1:@2"
      ),
      "surface:workspace-1:@2"
    )
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

  private func agentSurfaceRecord(
    id: String,
    workspaceID: String,
    agentID: String,
    title: String
  ) -> CanvasSurfaceRecord {
    CanvasSurfaceRecord(
      id: id,
      title: title,
      surfaceKind: .agent,
      binding: AgentSurfaceBinding(workspaceID: workspaceID, agentID: agentID).surfaceBinding
    )
  }

  @MainActor
  private func canvasSurface(id: String, title: String) -> CanvasSurface {
    let record = terminalSurfaceRecord(id: id, title: title)
    return CanvasSurface(
      id: id,
      surfaceKind: .terminal,
      record: record,
      content: AnySurfaceContent(id: id) { _ in
        EmptyView()
      },
      tabPresentation: SurfaceTabPresentation(
        label: title,
        icon: "terminal"
      ),
      isClosable: true
    )
  }

  @MainActor
  private func surfaceResolutionContext(
    workspace: BridgeWorkspaceSummary,
    terminalsByID: [String: BridgeTerminalRecord] = [:]
  ) -> SurfaceResolutionContext {
    SurfaceResolutionContext(
      model: AppModel(),
      workspace: workspace,
      workspaceID: workspace.id,
      workingDirectory: workspace.path ?? "/tmp",
      themeConfigPath: "",
      terminalBackgroundHexColor: "#131110",
      terminalDarkAppearance: true,
      backendLabel: nil,
      persistent: nil,
      agentsByID: [:],
      terminalsByID: terminalsByID,
      connectionBySurfaceID: [:]
    )
  }
}
