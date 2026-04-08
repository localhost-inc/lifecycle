import XCTest

@testable import LifecycleApp

final class AgentStatusBarTests: XCTestCase {
  func testAgentStatusBarUsageAggregatesTurnUsageAcrossEvents() {
    let usage = agentStatusBarUsage(
      from: [
        makeTurnCompletedEvent(
          occurredAt: "2026-04-07T00:00:01.000Z",
          inputTokens: 1000,
          outputTokens: 200,
          cacheReadTokens: 500,
          costUSD: 0.05
        ),
        makeTurnCompletedEvent(
          occurredAt: "2026-04-07T00:00:02.000Z",
          inputTokens: 2000,
          outputTokens: 400,
          cacheReadTokens: 0,
          costUSD: 0.08
        ),
      ]
    )

    XCTAssertEqual(
      usage,
      AgentStatusBarUsage(
        inputTokens: 3000,
        outputTokens: 600,
        cacheReadTokens: 500,
        costUSD: 0.13
      )
    )
  }

  func testAgentStatusBarUsageReturnsNilWithoutUsageEvents() {
    let usage = agentStatusBarUsage(
      from: [
        BridgeAgentSocketEvent(
          type: "agent.status.updated",
          kind: "agent.status.updated",
          occurredAt: "2026-04-07T00:00:01.000Z",
          workspaceID: "workspace-1",
          agentID: "session-1",
          turnID: nil,
          messageID: nil,
          partID: nil,
          role: nil,
          status: "running",
          detail: "thinking",
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
          projectedMessage: nil
        ),
      ]
    )

    XCTAssertNil(usage)
  }

  private func makeTurnCompletedEvent(
    occurredAt: String,
    inputTokens: Int,
    outputTokens: Int,
    cacheReadTokens: Int,
    costUSD: Double
  ) -> BridgeAgentSocketEvent {
    BridgeAgentSocketEvent(
      type: "agent.turn.completed",
      kind: "agent.turn.completed",
      occurredAt: occurredAt,
      workspaceID: "workspace-1",
      agentID: "session-1",
      turnID: "turn-1",
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
      agent: nil,
      usage: BridgeAgentUsage(
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        cacheReadTokens: cacheReadTokens
      ),
      costUSD: costUSD,
      part: nil,
      toolCall: nil,
      approval: nil,
      resolution: nil,
      artifact: nil,
      payload: nil,
      projectedMessage: nil
    )
  }
}
