import Foundation

enum AgentHandlePhase: Equatable {
  case missing
  case loading
  case ready
  case failed
}

struct AgentSnapshot: Equatable {
  let agent: BridgeAgentRecord
  let messages: [BridgeAgentMessage]

  init(agent: BridgeAgentRecord, messages: [BridgeAgentMessage]) {
    self.agent = agent
    self.messages = messages
  }

  init(_ envelope: BridgeAgentSnapshotEnvelope) {
    self.init(agent: envelope.agent, messages: envelope.messages)
  }
}

struct AgentHandleState: Equatable {
  let phase: AgentHandlePhase
  let snapshot: AgentSnapshot?
  let errorMessage: String?

  static let missing = AgentHandleState(
    phase: .missing,
    snapshot: nil,
    errorMessage: nil
  )

  static let loading = AgentHandleState(
    phase: .loading,
    snapshot: nil,
    errorMessage: nil
  )

  static func ready(_ snapshot: AgentSnapshot) -> AgentHandleState {
    AgentHandleState(
      phase: .ready,
      snapshot: snapshot,
      errorMessage: nil
    )
  }

  static func failed(
    _ errorMessage: String,
    snapshot: AgentSnapshot? = nil
  ) -> AgentHandleState {
    AgentHandleState(
      phase: .failed,
      snapshot: snapshot,
      errorMessage: errorMessage
    )
  }

  var agent: BridgeAgentRecord? {
    snapshot?.agent
  }

  var messages: [BridgeAgentMessage] {
    snapshot?.messages ?? []
  }

  var isLoading: Bool {
    phase == .loading
  }
}
