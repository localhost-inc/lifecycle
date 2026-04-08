import XCTest
import SwiftUI
import Foundation
import LifecyclePresentation

@testable import LifecycleApp

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

    try WorkspaceCanvasDocumentStore.write(
      documents,
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    let restored = try WorkspaceCanvasDocumentStore.read(
      environment: ["LIFECYCLE_ROOT": rootURL.path, "HOME": NSHomeDirectory()]
    )

    XCTAssertEqual(restored[workspaceID]?.surfacesByID[surfaceID]?.surfaceKind, .agent)
    XCTAssertEqual(
      AgentSurfaceBinding(binding: restored[workspaceID]?.surfacesByID[surfaceID]?.binding ?? SurfaceBinding(params: [:]))?.agentID,
      agentID
    )
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

    XCTAssertEqual(resolved?.tab.title, "Codex")
    XCTAssertEqual(resolved?.tab.subtitle, "session-1")
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

    let resolved = TerminalSurfaceDefinition().resolve(
      record: record,
      context: surfaceResolutionContext(workspace: workspace)
    )

    XCTAssertEqual(resolved?.tab.title, "shell")
    XCTAssertEqual(resolved?.tab.subtitle, terminalID)
    XCTAssertEqual(resolved?.tab.icon, "terminal")
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

  func testBridgeHealthRequiresAgentRouteCapability() throws {
    let compatibleData = """
      {"ok":true,"healthy":true,"capabilities":{"agents":true}}
      """.data(using: .utf8)!
    let payload = try JSONDecoder().decode(HealthPayload.self, from: compatibleData)

    XCTAssertTrue(bridgeHealthSupportsAgentRoutes(payload))
  }

  func testBridgeStartProcessUsesRepoBridgeInDevMode() {
    let process = BridgeConfiguration.defaultStartProcess(
      environment: LifecycleEnvironment(values: [
        "LIFECYCLE_DEV": "1",
        "LIFECYCLE_REPO_ROOT": "/tmp/lifecycle",
        "LIFECYCLE_BRIDGE_PORT": "52222",
      ])
    )

    XCTAssertEqual(process.executableURL?.path, "/usr/bin/env")
    XCTAssertEqual(
      process.arguments ?? [],
      ["bun", "--cwd", "/tmp/lifecycle/packages/bridge", "run", "src/app.ts", "--port", "52222"]
    )
  }

  func testBridgeStartProcessFallsBackToLifecycleCliOutsideDevMode() {
    let process = BridgeConfiguration.defaultStartProcess(
      environment: LifecycleEnvironment(values: [:])
    )

    XCTAssertEqual(process.executableURL?.path, "/usr/bin/env")
    XCTAssertEqual(process.arguments ?? [], ["lifecycle", "bridge", "start"])
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
          domain: "LifecycleApp.Bridge",
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

  @MainActor
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

  @MainActor
  private func surfaceResolutionContext(workspace: BridgeWorkspaceSummary) -> SurfaceResolutionContext {
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
      terminalsByID: [:],
      connectionBySurfaceID: [:]
    )
  }
}
