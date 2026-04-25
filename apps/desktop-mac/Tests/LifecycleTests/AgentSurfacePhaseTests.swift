import XCTest

@testable import Lifecycle

final class AgentSurfacePhaseTests: XCTestCase {
  func testStartingEmptyAgentKeepsCenteredComposerPhase() {
    let phase = agentSurfacePhase(
      agent: makeAgent(status: "starting", lastMessageAt: nil),
      transcriptMessageCount: 0,
      handleState: .loading
    )

    XCTAssertEqual(phase, .centeredComposer)
  }

  func testHistoricalAgentWithoutDetailUsesTranscriptPhase() {
    let phase = agentSurfacePhase(
      agent: makeAgent(status: "idle", lastMessageAt: "2026-04-06T18:00:00Z"),
      transcriptMessageCount: 0,
      handleState: .loading
    )

    XCTAssertEqual(phase, .transcript)
  }

  func testMissingAgentReturnsUnavailablePhase() {
    let phase = agentSurfacePhase(
      agent: nil,
      transcriptMessageCount: 0,
      handleState: .missing
    )

    XCTAssertEqual(phase, .unavailable)
  }

  private func makeAgent(status: String, lastMessageAt: String?) -> BridgeAgentRecord {
    BridgeAgentRecord(
      id: "session-1",
      workspaceID: "workspace-1",
      provider: "codex",
      providerID: nil,
      title: "Codex",
      status: status,
      lastMessageAt: lastMessageAt,
      createdAt: "2026-04-06T18:00:00Z",
      updatedAt: "2026-04-06T18:00:00Z"
    )
  }
}
