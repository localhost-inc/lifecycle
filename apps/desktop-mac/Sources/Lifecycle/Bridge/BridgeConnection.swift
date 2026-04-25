import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

func bridgeWorkspaceSocketTopic(_ workspaceID: String) -> String {
  "workspace:\(workspaceID)"
}

func mergeTerminalActivity(
  terminals: [BridgeTerminalRecord],
  activity: BridgeWorkspaceActivitySummary
) -> [BridgeTerminalRecord] {
  var activityByTerminalID = Dictionary(
    uniqueKeysWithValues: activity.terminals.map { ($0.terminalID, $0) }
  )
  let merged = terminals.map { terminal in
    guard let terminalActivity = activityByTerminalID.removeValue(forKey: terminal.id) else {
      return terminal
    }

    return BridgeTerminalRecord(
      id: terminal.id,
      title: terminalActivity.title ?? terminal.title,
      kind: terminal.kind,
      busy: terminalActivity.busy,
      activity: terminalActivity
    )
  }

  let explicitOnly = activityByTerminalID.values
    .filter { $0.source == "explicit" }
    .sorted { $0.terminalID < $1.terminalID }
    .map { terminalActivity in
      BridgeTerminalRecord(
        id: terminalActivity.terminalID,
        title: terminalActivity.title ?? terminalActivity.provider ?? terminalActivity.terminalID,
        kind: terminalActivity.provider ?? "activity",
        busy: terminalActivity.busy,
        activity: terminalActivity
      )
    }

  return merged + explicitOnly
}

func mergeTerminalEnvelopeActivity(
  envelope: BridgeWorkspaceTerminalsEnvelope,
  activity: BridgeWorkspaceActivitySummary
) -> BridgeWorkspaceTerminalsEnvelope {
  BridgeWorkspaceTerminalsEnvelope(
    workspace: envelope.workspace,
    runtime: envelope.runtime,
    terminals: mergeTerminalActivity(terminals: envelope.terminals, activity: activity)
  )
}

@MainActor
extension AppModel {
  func loadAuthState() async throws {
    do {
      let state = try await withBridgeRequest { client in
        try await client.authState()
      }
      self.authState = state

      guard state.authenticated else {
        self.organizations = []
        return
      }

      do {
        let orgs = try await withBridgeRequest { client in
          try await client.organizations()
        }
        self.organizations = orgs
      } catch {
        self.authState = BridgeAuthState(
          authenticated: false,
          userId: nil,
          email: nil,
          displayName: nil,
          activeOrgId: nil,
          activeOrgSlug: nil,
          gitProfile: state.gitProfile
        )
        self.organizations = []
        AppLog.notice(.bridge, "Bridge auth was invalidated while loading organizations")
      }
    } catch {
      self.organizations = []
      // Auth state is best-effort — don't block the app if it fails.
      AppLog.notice(.bridge, "Failed to load auth state")
    }
  }

  func startBridgeMonitoring() {
    bridgeMonitorTask?.cancel()
    bridgeMonitorTask = Task { [weak self] in
      while !Task.isCancelled {
        do {
          let delay =
            self?.bridgeClient == nil
              ? bridgeDiscoveryRetryNanosecondsWhenDisconnected
              : bridgeDiscoveryRetryNanosecondsWhenConnected
          try await Task.sleep(nanoseconds: delay)
          guard let self else {
            continue
          }

          await self.rediscoverBridgeIfNeeded()
        } catch {
          continue
        }
      }
    }
  }

  func connectSocket() {
    guard let baseURL = bridgeURL else { return }

    bridgeSocket.connect(to: baseURL) { [weak self] event in
      guard let self else { return }
      self.handleSocketEvent(event)
    }
  }

  func handleSocketEvent(_ event: BridgeSocket.Event) {
    switch event {
    case .connected:
      subscribeToWorkspaceSocketTopics(Array(openedWorkspaceIDs))
    case .agent(let event):
      if customAgentActionsEnabled {
        applyAgentEvent(event)
      }
    case .activity(let message):
      applyActivitySocketMessage(message)
    case .serviceStarting,
      .serviceStarted,
      .serviceFailed,
      .serviceStopping,
      .serviceStopped:
      applyStackServiceSocketEvent(event)
    case .pong:
      break
    case .unknown:
      break
    }
  }

  func subscribeToWorkspaceSocketTopics(_ workspaceIDs: [String]) {
    let topics = workspaceIDs.map(bridgeWorkspaceSocketTopic)
    guard !topics.isEmpty else {
      return
    }

    bridgeSocket.subscribe(topics: topics)
  }

  func applyActivitySocketMessage(_ message: BridgeActivitySocketMessage) {
    for workspace in message.workspaces {
      applyWorkspaceActivity(workspace.summary)
    }
  }

  func applyWorkspaceActivity(_ activity: BridgeWorkspaceActivitySummary) {
    guard let current = terminalEnvelopeByWorkspaceID[activity.workspaceID] else {
      return
    }

    terminalEnvelopeByWorkspaceID[activity.workspaceID] = mergeTerminalEnvelopeActivity(
      envelope: current,
      activity: activity
    )
    syncWorkspaceStore(for: activity.workspaceID)
  }

  func withBridgeRequest<Response>(
    retryingConnectivityFailures: Bool = true,
    _ operation: @escaping (BridgeClient) async throws -> Response
  ) async throws -> Response {
    let client = try await ensureBridgeClient(startIfNeeded: true)

    do {
      return try await operation(client)
    } catch {
      guard retryingConnectivityFailures, isBridgeConnectivityError(error) else {
        throw error
      }

      let recoveredClient = try await rediscoverBridgeClient(
        startIfNeeded: true,
        resetTerminalConnections: true
      )
      return try await operation(recoveredClient)
    }
  }

  func ensureBridgeClient(startIfNeeded: Bool) async throws -> BridgeClient {
    if let bridgeClient {
      return bridgeClient
    }

    return try await rediscoverBridgeClient(
      startIfNeeded: startIfNeeded,
      resetTerminalConnections: false
    )
  }

  func rediscoverBridgeClient(
    startIfNeeded: Bool,
    resetTerminalConnections: Bool
  ) async throws -> BridgeClient {
    try await AppSignpost.withInterval(.bridge, "Rediscover Bridge Client") {
      let discovery: BridgeDiscovery
      if startIfNeeded {
        discovery = try await BridgeBootstrap.ensureBridgeDiscovery()
      } else if let discovered = try await BridgeBootstrap.discoverBridge(startIfNeeded: false) {
        discovery = discovered
      } else if let bridgeClient {
        return bridgeClient
      } else {
        throw BridgeBootstrapError.couldNotStart(URL(string: "http://127.0.0.1:0")!)
      }

      let shouldResetConnections =
        resetTerminalConnections ||
        bridgeClient == nil ||
        bridgeURL == nil ||
        bridgeURL != discovery.url ||
        bridgePID != discovery.pid

      let client = BridgeClient(baseURL: discovery.url)
      bridgeURL = discovery.url
      bridgePID = discovery.pid
      bridgeClient = client
      if shouldResetConnections {
        terminalConnectionBySurfaceID.removeAll()
      }

      AppLog.notice(
        .bridge,
        "Resolved bridge client",
        metadata: [
          "url": discovery.url.absoluteString,
          "pid": discovery.pid.map(String.init) ?? "unknown",
          "resetConnections": shouldResetConnections ? "true" : "false",
        ]
      )
      return client
    }
  }

  func rediscoverBridgeIfNeeded() async {
    do {
      let shouldStartIfNeeded = bridgeClient == nil
      guard let discovered = try await BridgeBootstrap.discoverBridge(
        startIfNeeded: shouldStartIfNeeded
      ) else {
        if bridgeClient == nil {
          beginBridgeRecovery()
        }
        return
      }

      let shouldReconnect =
        bridgeClient == nil ||
        bridgeURL != discovered.url ||
        bridgePID != discovered.pid
      guard shouldReconnect else {
        if isRecoveringBridge {
          endBridgeRecovery()
          clearError()
        }
        return
      }

      _ = try await rediscoverBridgeClient(startIfNeeded: false, resetTerminalConnections: true)
      try await loadRepositories()
      await openSelectedWorkspaceIfNeeded()
      connectSocket()
      endBridgeRecovery()
      clearError()
      AppLog.notice(.bridge, "Bridge rediscovered after fixed-port health or PID change")
    } catch {
      guard handleRecoverableBridgeFailure(
        error,
        message: "Bridge rediscovery is waiting for a healthy bridge"
      ) else {
        return
      }
    }
  }

  func beginBridgeRecovery(_ error: Error? = nil) {
    isRecoveringBridge = true
    if let error {
      lastFailureSummary = error.localizedDescription
    }
  }

  func endBridgeRecovery() {
    isRecoveringBridge = false
  }

  func handleRecoverableBridgeFailure(_ error: Error, message: String) -> Bool {
    guard isBridgeConnectivityError(error) || error is BridgeBootstrapError else {
      return false
    }

    beginBridgeRecovery(error)
    clearError()
    AppLog.notice(.bridge, message, metadata: ["error": error.localizedDescription])
    return true
  }
}
