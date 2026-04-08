import Combine
import Foundation

private let agentHandleFlushNanoseconds: UInt64 = 8_000_000
private let maximumBufferedAgentEventsPerAgent = 200

@MainActor
final class AgentHandle: ObservableObject {
  let agentID: String
  let workspaceID: String

  @Published private(set) var state: AgentHandleState
  @Published private(set) var agentRecord: BridgeAgentRecord?
  @Published private(set) var events: [BridgeAgentSocketEvent] = []

  private var bufferedEvents: [BridgeAgentSocketEvent] = []
  private var pendingEvents: [BridgeAgentSocketEvent] = []
  private var flushTask: Task<Void, Never>?

  var agent: BridgeAgentRecord? {
    agentRecord ?? state.agent
  }

  init(
    agentID: String,
    workspaceID: String,
    agent: BridgeAgentRecord? = nil
  ) {
    self.agentID = agentID
    self.workspaceID = workspaceID
    self.state = .missing
    self.agentRecord = agent
  }

  deinit {
    flushTask?.cancel()
  }

  func syncAgentRecord(_ agent: BridgeAgentRecord) {
    guard agent.id == agentID else {
      return
    }

    guard agentRecord != agent else {
      return
    }

    agentRecord = agent
  }

  func load(
    using loader: @escaping () async throws -> BridgeAgentSnapshotEnvelope
  ) async {
    switch state.phase {
    case .loading, .ready:
      return
    case .missing, .failed:
      break
    }

    state = .loading

    do {
      var snapshot = AgentSnapshot(try await loader())
      agentRecord = snapshot.agent
      for event in bufferedEvents + pendingEvents {
        snapshot = applying(event, to: snapshot)
      }
      bufferedEvents.removeAll()
      pendingEvents.removeAll()
      flushTask?.cancel()
      flushTask = nil
      state = .ready(snapshot)
      agentRecord = snapshot.agent
    } catch {
      state = .failed(error.localizedDescription)
    }
  }

  func apply(_ event: BridgeAgentSocketEvent) {
    guard event.resolvedAgentID == agentID else {
      return
    }

    record(event)
    if let agent = event.agent {
      syncAgentRecord(agent)
    }

    guard let snapshot = state.snapshot else {
      bufferedEvents.append(event)
      return
    }

    _ = snapshot
    pendingEvents.append(event)
    scheduleFlushIfNeeded()
  }

  private func scheduleFlushIfNeeded() {
    guard flushTask == nil else {
      return
    }

    flushTask = Task { @MainActor [weak self] in
      do {
        try await Task.sleep(nanoseconds: agentHandleFlushNanoseconds)
      } catch {
        return
      }

      guard let self else {
        return
      }

      self.flushTask = nil
      self.flushPendingEvents()
    }
  }

  private func flushPendingEvents() {
    guard let snapshot = state.snapshot, !pendingEvents.isEmpty else {
      return
    }

    var nextSnapshot = snapshot
    for event in pendingEvents {
      nextSnapshot = applying(event, to: nextSnapshot)
    }
    pendingEvents.removeAll()
    state = .ready(nextSnapshot)
    agentRecord = nextSnapshot.agent
  }

  var latestStatusDetail: String? {
    for event in events.reversed() {
      if let detail = event.detail?.trimmingCharacters(in: .whitespacesAndNewlines), !detail.isEmpty {
        return detail
      }

      if let status = event.status?.trimmingCharacters(in: .whitespacesAndNewlines), !status.isEmpty {
        return status
      }

      if let error = event.error?.trimmingCharacters(in: .whitespacesAndNewlines), !error.isEmpty {
        return error
      }
    }

    return nil
  }

  private func record(_ event: BridgeAgentSocketEvent) {
    if events.count >= maximumBufferedAgentEventsPerAgent {
      events = Array(events.suffix(maximumBufferedAgentEventsPerAgent - 1)) + [event]
    } else {
      events.append(event)
    }
  }
}

private func applying(
  _ event: BridgeAgentSocketEvent,
  to snapshot: AgentSnapshot
) -> AgentSnapshot {
  let agent = event.agent ?? snapshot.agent
  var messages = snapshot.messages

  if let projectedMessage = event.projectedMessage {
    upsertAgentProjectedMessage(projectedMessage, into: &messages)
  }

  return AgentSnapshot(agent: agent, messages: messages)
}

private func upsertAgentProjectedMessage(
  _ message: BridgeAgentMessage,
  into messages: inout [BridgeAgentMessage]
) {
  if let index = messages.firstIndex(where: { $0.id == message.id }) {
    messages[index] = message
  } else {
    messages.append(message)
  }

  messages.sort(by: sortAgentProjectedMessages)
}

private func sortAgentProjectedMessages(
  _ left: BridgeAgentMessage,
  _ right: BridgeAgentMessage
) -> Bool {
  if left.createdAt == right.createdAt {
    return left.id < right.id
  }

  return left.createdAt < right.createdAt
}
