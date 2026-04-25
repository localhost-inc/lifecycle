import Foundation

/// Durable WebSocket connection to the bridge `/ws` endpoint.
///
/// Automatically reconnects on failure with exponential backoff.
/// Dispatches decoded events to a registered handler on the main actor.
@MainActor
final class BridgeSocket {

  // MARK: - Types

  enum State: Equatable {
    case disconnected
    case connecting
    case connected
  }

  /// Inbound event from the bridge.
  enum Event {
    case connected(clientId: String)
    case agent(BridgeAgentSocketEvent)
    case activity(BridgeActivitySocketMessage)
    case serviceStarting(workspaceID: String, service: String)
    case serviceStarted(workspaceID: String, service: String)
    case serviceFailed(workspaceID: String, service: String, error: String)
    case serviceStopping(workspaceID: String, service: String)
    case serviceStopped(workspaceID: String, service: String)
    case pong
    case unknown(type: String, raw: [String: Any])
  }

  typealias EventHandler = @MainActor (Event) -> Void

  // MARK: - Properties

  private(set) var state: State = .disconnected
  private var baseURL: URL?
  private var task: URLSessionWebSocketTask?
  private var session: URLSession?
  private var reconnectTask: Task<Void, Never>?
  private var pingTask: Task<Void, Never>?
  private var eventHandler: EventHandler?
  private var reconnectAttempt = 0
  private var intentionalDisconnect = false

  private static let maxReconnectDelay: UInt64 = 10_000_000_000 // 10s
  private static let baseReconnectDelay: UInt64 = 500_000_000   // 0.5s
  private static let pingInterval: UInt64 = 15_000_000_000      // 15s

  // MARK: - Public API

  func connect(to baseURL: URL, onEvent: @escaping EventHandler) {
    disconnect()
    self.baseURL = baseURL
    self.eventHandler = onEvent
    intentionalDisconnect = false
    reconnectAttempt = 0
    AppLog.info(.bridge, "Opening bridge socket", metadata: ["url": baseURL.absoluteString])
    openConnection()
  }

  func disconnect() {
    intentionalDisconnect = true
    reconnectTask?.cancel()
    reconnectTask = nil
    pingTask?.cancel()
    pingTask = nil
    task?.cancel(with: .goingAway, reason: nil)
    task = nil
    session?.invalidateAndCancel()
    session = nil
    state = .disconnected
    baseURL = nil
    eventHandler = nil
    AppLog.debug(.bridge, "Bridge socket disconnected intentionally")
  }

  /// Subscribe to additional bridge topics.
  func subscribe(topics: [String]) {
    send(message: ["type": "subscribe", "topics": topics])
  }

  /// Unsubscribe from bridge topics.
  func unsubscribe(topics: [String]) {
    send(message: ["type": "unsubscribe", "topics": topics])
  }

  // MARK: - Connection Lifecycle

  private func openConnection() {
    guard let baseURL else { return }

    state = .connecting

    var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
    components.scheme = baseURL.scheme == "https" ? "wss" : "ws"
    components.path = "/ws"

    let url = components.url!
    let urlSession = URLSession(configuration: .default)
    self.session = urlSession

    let wsTask = urlSession.webSocketTask(with: url)
    self.task = wsTask
    wsTask.resume()
    receiveNext()

    // The bridge sends a `connected` event on open — we transition to `.connected` there.
  }

  private func receiveNext() {
    task?.receive { [weak self] result in
      Task { @MainActor [weak self] in
        guard let self, !self.intentionalDisconnect else { return }

        switch result {
        case .success(let message):
          self.handleMessage(message)
          self.receiveNext()
        case .failure:
          self.handleDisconnect()
        }
      }
    }
  }

  private func handleMessage(_ message: URLSessionWebSocketTask.Message) {
    guard let data = messageData(message),
          let event = decodeBridgeSocketEvent(from: data)
    else { return }

    if case .connected = event {
      state = .connected
      reconnectAttempt = 0
      startPinging()
      if case let .connected(clientId) = event {
        AppLog.notice(.bridge, "Bridge socket connected", metadata: ["clientID": clientId])
      }
    }
    eventHandler?(event)
  }

  private func handleDisconnect() {
    state = .disconnected
    pingTask?.cancel()
    pingTask = nil
    task = nil
    session?.invalidateAndCancel()
    session = nil
    AppLog.notice(.bridge, "Bridge socket disconnected; scheduling reconnect")
    scheduleReconnect()
  }

  private func scheduleReconnect() {
    guard !intentionalDisconnect, baseURL != nil else { return }

    reconnectTask?.cancel()
    reconnectTask = Task { [weak self] in
      guard let self else { return }

      let attempt = self.reconnectAttempt
      let delay = min(
        Self.baseReconnectDelay * UInt64(1 << min(attempt, 5)),
        Self.maxReconnectDelay
      )

      do {
        try await Task.sleep(nanoseconds: delay)
      } catch { return }

      guard !Task.isCancelled else { return }
      self.reconnectAttempt = attempt + 1
      AppLog.debug(
        .bridge,
        "Reconnecting bridge socket",
        metadata: ["attempt": String(self.reconnectAttempt)]
      )
      self.openConnection()
    }
  }

  // MARK: - Ping

  private func startPinging() {
    pingTask?.cancel()
    pingTask = Task { [weak self] in
      while !Task.isCancelled {
        do {
          try await Task.sleep(nanoseconds: Self.pingInterval)
        } catch { return }

        guard let self, !Task.isCancelled else { return }
        self.send(message: ["type": "ping"])
      }
    }
  }

  // MARK: - Send

  private func send(message: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: message),
          let text = String(data: data, encoding: .utf8)
    else { return }

    task?.send(.string(text)) { _ in }
  }

  // MARK: - Decode

  private func messageData(_ message: URLSessionWebSocketTask.Message) -> Data? {
    switch message {
    case .string(let text): return text.data(using: .utf8)
    case .data(let data): return data
    @unknown default: return nil
    }
  }
}

func decodeBridgeSocketEvent(from data: Data) -> BridgeSocket.Event? {
  guard let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let type = object["type"] as? String
  else {
    return nil
  }

  switch type {
  case "connected":
    let clientId = object["clientId"] as? String ?? ""
    return .connected(clientId: clientId)

  case let type where type.hasPrefix("agent."):
    if let event = try? JSONDecoder().decode(BridgeAgentSocketEvent.self, from: data) {
      return .agent(event)
    }
    return .unknown(type: type, raw: object)

  case "activity":
    if let event = try? JSONDecoder().decode(BridgeActivitySocketMessage.self, from: data) {
      return .activity(event)
    }
    return .unknown(type: type, raw: object)

  case "service.starting":
    let workspaceID = object["workspace_id"] as? String ?? ""
    let service = object["service"] as? String ?? ""
    return .serviceStarting(workspaceID: workspaceID, service: service)

  case "service.started":
    let workspaceID = object["workspace_id"] as? String ?? ""
    let service = object["service"] as? String ?? ""
    return .serviceStarted(workspaceID: workspaceID, service: service)

  case "service.failed":
    let workspaceID = object["workspace_id"] as? String ?? ""
    let service = object["service"] as? String ?? ""
    let error = object["error"] as? String ?? ""
    return .serviceFailed(workspaceID: workspaceID, service: service, error: error)

  case "service.stopping":
    let workspaceID = object["workspace_id"] as? String ?? ""
    let service = object["service"] as? String ?? ""
    return .serviceStopping(workspaceID: workspaceID, service: service)

  case "service.stopped":
    let workspaceID = object["workspace_id"] as? String ?? ""
    let service = object["service"] as? String ?? ""
    return .serviceStopped(workspaceID: workspaceID, service: service)

  case "pong":
    return .pong

  default:
    return .unknown(type: type, raw: object)
  }
}

struct BridgeActivitySocketMessage: Decodable, Hashable {
  let type: String
  let workspaces: [BridgeActivityWorkspaceMessage]
}

struct BridgeActivityWorkspaceMessage: Decodable, Hashable {
  let workspaceID: String
  let name: String
  let repo: String
  let busy: Bool
  let terminals: [BridgeTerminalActivityRecord]
  let updatedAt: String?

  var summary: BridgeWorkspaceActivitySummary {
    BridgeWorkspaceActivitySummary(
      workspaceID: workspaceID,
      busy: busy,
      terminals: terminals,
      updatedAt: updatedAt
    )
  }

  enum CodingKeys: String, CodingKey {
    case workspaceID = "workspace_id"
    case name
    case repo
    case busy
    case terminals
    case updatedAt = "updated_at"
  }
}
