import XCTest

@testable import LifecycleApp

@MainActor
final class AgentHandleTests: XCTestCase {
  func testHandleExposesSeededAgentBeforeSnapshotLoad() {
    let seededAgent = makeAgent(status: "starting")
    let handle = AgentHandle(
      agentID: "session-1",
      workspaceID: "workspace-1",
      agent: seededAgent
    )

    XCTAssertEqual(handle.agent?.status, "starting")
    XCTAssertEqual(handle.state.phase, .missing)
  }

  func testHandleAppliesBufferedProjectedEventsAfterInitialLoad() async throws {
    let handle = AgentHandle(agentID: "session-1", workspaceID: "workspace-1")

    handle.apply(
      BridgeAgentSocketEvent(
        type: "agent.message.part.completed",
        kind: "agent.message.part.completed",
        occurredAt: "2026-04-06T18:00:01.000Z",
        workspaceID: "workspace-1",
        agentID: "session-1",
        turnID: nil,
        messageID: "turn-1:assistant",
        partID: "turn-1:assistant:part:1",
        role: nil,
        status: nil,
        detail: nil,
        error: nil,
        eventType: nil,
        provider: nil,
        authenticated: nil,
        mode: nil,
        agent: nil,
        usage: nil,
        costUSD: nil,
        part: nil,
        toolCall: nil,
        approval: nil,
        resolution: nil,
        artifact: nil,
        payload: nil,
        projectedMessage: makeMessage(
          id: "turn-1:assistant",
          text: "hello",
          createdAt: "2026-04-06T18:00:00.000Z"
        )
      )
    )

    await handle.load {
      BridgeAgentSnapshotEnvelope(
        agent: self.makeAgent(status: "running"),
        messages: []
      )
    }

    XCTAssertEqual(handle.state.phase, .ready)
    XCTAssertEqual(handle.state.messages.map(\.id), ["turn-1:assistant"])
    XCTAssertEqual(handle.state.messages.first?.text, "hello")
  }

  func testHandleUpsertsProjectedMessagesIntoReadySnapshot() async throws {
    let handle = AgentHandle(agentID: "session-1", workspaceID: "workspace-1")

    await handle.load {
      BridgeAgentSnapshotEnvelope(
        agent: self.makeAgent(status: "idle"),
        messages: [
          self.makeMessage(
            id: "turn-1:user",
            role: "user",
            text: "hi",
            createdAt: "2026-04-06T18:00:00.000Z"
          ),
        ]
      )
    }

    handle.apply(
      BridgeAgentSocketEvent(
        type: "agent.message.part.completed",
        kind: "agent.message.part.completed",
        occurredAt: "2026-04-06T18:00:02.000Z",
        workspaceID: "workspace-1",
        agentID: "session-1",
        turnID: nil,
        messageID: "turn-1:assistant",
        partID: "turn-1:assistant:part:1",
        role: nil,
        status: nil,
        detail: nil,
        error: nil,
        eventType: nil,
        provider: nil,
        authenticated: nil,
        mode: nil,
        agent: makeAgent(status: "running"),
        usage: nil,
        costUSD: nil,
        part: nil,
        toolCall: nil,
        approval: nil,
        resolution: nil,
        artifact: nil,
        payload: nil,
        projectedMessage: makeMessage(
          id: "turn-1:assistant",
          text: "Here.",
          createdAt: "2026-04-06T18:00:01.000Z"
        )
      )
    )

    try await Task.sleep(nanoseconds: 20_000_000)

    XCTAssertEqual(handle.state.agent?.status, "running")
    XCTAssertEqual(handle.state.messages.map(\.id), ["turn-1:user", "turn-1:assistant"])
    XCTAssertEqual(handle.state.messages.last?.text, "Here.")
  }

  func testHandleCoalescesMessageAndSessionCompletionIntoOneVisibleSnapshot() async throws {
    let handle = AgentHandle(agentID: "session-1", workspaceID: "workspace-1")

    await handle.load {
      BridgeAgentSnapshotEnvelope(
        agent: self.makeAgent(status: "running"),
        messages: []
      )
    }

    handle.apply(
      BridgeAgentSocketEvent(
        type: "agent.message.part.completed",
        kind: "agent.message.part.completed",
        occurredAt: "2026-04-06T18:00:01.000Z",
        workspaceID: "workspace-1",
        agentID: "session-1",
        turnID: nil,
        messageID: "turn-1:assistant",
        partID: "turn-1:assistant:part:1",
        role: nil,
        status: nil,
        detail: nil,
        error: nil,
        eventType: nil,
        provider: nil,
        authenticated: nil,
        mode: nil,
        agent: nil,
        usage: nil,
        costUSD: nil,
        part: nil,
        toolCall: nil,
        approval: nil,
        resolution: nil,
        artifact: nil,
        payload: nil,
        projectedMessage: makeMessage(
          id: "turn-1:assistant",
          text: "done",
          createdAt: "2026-04-06T18:00:01.000Z"
        )
      )
    )

    handle.apply(
      BridgeAgentSocketEvent(
        type: "agent.updated",
        kind: "agent.updated",
        occurredAt: "2026-04-06T18:00:01.005Z",
        workspaceID: "workspace-1",
        agentID: nil,
        turnID: nil,
        messageID: nil,
        partID: nil,
        role: nil,
        status: nil,
        detail: nil,
        error: nil,
        eventType: nil,
        provider: nil,
        authenticated: nil,
        mode: nil,
        agent: makeAgent(status: "idle"),
        usage: nil,
        costUSD: nil,
        part: nil,
        toolCall: nil,
        approval: nil,
        resolution: nil,
        artifact: nil,
        payload: nil,
        projectedMessage: nil
      )
    )

    XCTAssertEqual(handle.state.agent?.status, "running")
    XCTAssertEqual(handle.state.messages.count, 0)

    try await Task.sleep(nanoseconds: 20_000_000)

    XCTAssertEqual(handle.state.agent?.status, "idle")
    XCTAssertEqual(handle.state.messages.map(\.id), ["turn-1:assistant"])
  }

  private func makeAgent(status: String) -> BridgeAgentRecord {
    BridgeAgentRecord(
      id: "session-1",
      workspaceID: "workspace-1",
      provider: "codex",
      providerID: nil,
      title: "",
      status: status,
      lastMessageAt: nil,
      createdAt: "2026-04-06T18:00:00.000Z",
      updatedAt: "2026-04-06T18:00:00.000Z"
    )
  }

  private func makeMessage(
    id: String,
    role: String = "assistant",
    text: String,
    createdAt: String
  ) -> BridgeAgentMessage {
    BridgeAgentMessage(
      id: id,
      agentID: "session-1",
      role: role,
      text: text,
      turnID: "turn-1",
      parts: [],
      createdAt: createdAt
    )
  }
}
