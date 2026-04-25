import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func selectedAgent(for workspaceID: String) -> BridgeAgentRecord? {
    let agents = agentsByWorkspaceID[workspaceID] ?? []
    guard let selectedAgentID = selectedAgentIDByWorkspaceID[workspaceID] else {
      return agents.first
    }

    return agents.first(where: { $0.id == selectedAgentID }) ?? agents.first
  }

  func agent(agentID: String, workspaceID: String) -> BridgeAgentRecord? {
    (agentsByWorkspaceID[workspaceID] ?? []).first(where: { $0.id == agentID })
  }

  func agentHandle(agentID: String, workspaceID: String) -> AgentHandle {
    ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)
  }

  func providerAuthStatus(for provider: BridgeAgentProvider) -> BridgeProviderAuthStatus {
    guard customAgentActionsEnabled else {
      return .error("Custom agent actions are disabled in this build.")
    }
    return providerAuthStatusByProvider[provider] ?? .notChecked
  }

  func refreshProviderAuthStatus(for provider: BridgeAgentProvider, force: Bool = false) {
    guard customAgentActionsEnabled else {
      return
    }
    Task {
      await loadProviderAuthStatus(for: provider, force: force)
    }
  }

  func loginProviderAuth(_ provider: BridgeAgentProvider) {
    guard customAgentActionsEnabled else {
      return
    }
    Task {
      await loginProviderAuth(for: provider)
    }
  }

  func createAgentSurface(
    provider: BridgeAgentProvider,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard customAgentActionsEnabled else {
      reportError(
        disabledCustomAgentActionError(),
        category: .agent,
        message: "Custom agent actions are disabled"
      )
      return
    }

    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    Task {
      await createAgentSurface(for: targetWorkspaceID, provider: provider, groupID: groupID)
    }
  }

  func openAgentSurface(
    agentID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard customAgentActionsEnabled else {
      reportError(
        disabledCustomAgentActionError(),
        category: .agent,
        message: "Custom agent actions are disabled"
      )
      return
    }

    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    enterAgent(agentID: agentID, workspaceID: targetWorkspaceID, groupID: groupID)
  }

  func sendAgentPrompt(
    agentID: String,
    workspaceID: String,
    text: String
  ) async throws {
    guard customAgentActionsEnabled else {
      throw disabledCustomAgentActionError()
    }

    let turnID = "turn-\(UUID().uuidString.lowercased())"
    try await AppSignpost.withInterval(.agent, "Send Agent Prompt") {
      try await withBridgeRequest { client in
        try await client.sendAgentTurn(agentID: agentID, turnID: turnID, text: text)
      }
    }
    AppLog.notice(
      .agent,
      "Sent agent prompt",
      metadata: [
        "agentID": agentID,
        "workspaceID": workspaceID,
        "turnID": turnID,
      ]
    )
  }

  func cancelAgentTurn(agentID: String) async throws {
    guard customAgentActionsEnabled else {
      throw disabledCustomAgentActionError()
    }

    try await AppSignpost.withInterval(.agent, "Cancel Agent Turn") {
      try await withBridgeRequest { client in
        try await client.cancelAgentTurn(agentID: agentID)
      }
    }
    AppLog.notice(.agent, "Cancelled agent turn", metadata: ["agentID": agentID])
  }

  func resolveAgentApproval(
    agentID: String,
    approvalID: String,
    decision: BridgeAgentApprovalDecision
  ) async throws {
    guard customAgentActionsEnabled else {
      throw disabledCustomAgentActionError()
    }

    try await AppSignpost.withInterval(.agent, "Resolve Agent Approval") {
      try await withBridgeRequest { client in
        try await client.resolveAgentApproval(
          agentID: agentID,
          approvalID: approvalID,
          decision: decision
        )
      }
    }
    AppLog.notice(
      .agent,
      "Resolved agent approval",
      metadata: [
        "agentID": agentID,
        "approvalID": approvalID,
        "decision": decision.rawValue,
      ]
    )
  }

  func loadProviderAuthStatuses(force: Bool) async {
    guard customAgentActionsEnabled else {
      return
    }

    for provider in BridgeAgentProvider.allCases {
      await loadProviderAuthStatus(for: provider, force: force)
    }
  }

  func loadProviderAuthStatus(
    for provider: BridgeAgentProvider,
    force: Bool
  ) async {
    let currentStatus = providerAuthStatus(for: provider)
    if !force {
      switch currentStatus.state {
      case .checking, .authenticating, .authenticated, .unauthenticated:
        return
      case .notChecked, .error:
        break
      }
    }

    providerAuthStatusByProvider[provider] = .checking

    do {
      let status = try await withBridgeRequest { client in
        try await client.providerAuthStatus(for: provider)
      }
      providerAuthStatusByProvider[provider] = status
      AppLog.info(
        .bridge,
        "Loaded provider auth status",
        metadata: [
          "provider": provider.rawValue,
          "state": status.state.rawValue,
        ]
      )
    } catch {
      providerAuthStatusByProvider[provider] = .error(error.localizedDescription)
      AppLog.notice(
        .bridge,
        "Failed to load provider auth status",
        metadata: [
          "provider": provider.rawValue,
          "error": error.localizedDescription,
        ]
      )
    }
  }

  func loginProviderAuth(for provider: BridgeAgentProvider) async {
    let currentStatus = providerAuthStatus(for: provider)
    switch currentStatus.state {
    case .checking, .authenticating:
      return
    case .notChecked, .authenticated, .unauthenticated, .error:
      break
    }

    providerAuthStatusByProvider[provider] = providerAuthenticatingStatus(for: provider)

    do {
      let status = try await withBridgeRequest { client in
        try await client.loginProvider(provider)
      }
      providerAuthStatusByProvider[provider] = status
      AppLog.notice(
        .bridge,
        "Completed provider authentication flow",
        metadata: [
          "provider": provider.rawValue,
          "state": status.state.rawValue,
        ]
      )
    } catch {
      providerAuthStatusByProvider[provider] = .error(error.localizedDescription)
      AppLog.notice(
        .bridge,
        "Provider authentication failed",
        metadata: [
          "provider": provider.rawValue,
          "error": error.localizedDescription,
        ]
      )
    }
  }

  func providerAuthenticatingStatus(
    for provider: BridgeAgentProvider
  ) -> BridgeProviderAuthStatus {
    .authenticating(output: ["Waiting for bridge authentication..."])
  }

  func enterVisibleAgentIfPresent(for workspaceID: String) {
    guard customAgentActionsEnabled else {
      return
    }

    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let activeGroupID = document.activeGroupID,
          let activeGroup = document.groupsByID[activeGroupID],
          let activeSurfaceID = activeGroup.activeSurfaceID,
          let surfaceRecord = document.surfacesByID[activeSurfaceID],
          surfaceRecord.surfaceKind == .agent,
          let binding = AgentSurfaceBinding(binding: surfaceRecord.binding)
    else {
      return
    }

    enterAgent(
      agentID: binding.agentID,
      workspaceID: workspaceID,
      groupID: activeGroupID,
      preferredSurfaceID: activeSurfaceID
    )
  }

  func applyAgentEvent(_ event: BridgeAgentSocketEvent) {
    if let agent = event.agent,
       let workspaceID = event.resolvedWorkspaceID
    {
      upsertAgent(agent, workspaceID: workspaceID)
    }

    guard let agentID = event.resolvedAgentID else {
      return
    }

    agentHandlesByID[agentID]?.apply(event)
  }

  func upsertAgent(_ agent: BridgeAgentRecord, workspaceID: String) {
    var agents = agentsByWorkspaceID[workspaceID] ?? []

    if let index = agents.firstIndex(where: { $0.id == agent.id }) {
      agents[index] = agent
    } else {
      agents.append(agent)
    }

    agents.sort { left, right in
      if left.updatedAt == right.updatedAt {
        return left.id < right.id
      }

      return left.updatedAt > right.updatedAt
    }

    agentsByWorkspaceID[workspaceID] = agents
    agentHandlesByID[agent.id]?.syncAgentRecord(agent)
    normalizeSelectedAgent(for: workspaceID)
    syncCanvasDocument(for: workspaceID)
  }

  func loadAgents(for workspaceID: String, force: Bool) async {
    guard customAgentActionsEnabled else {
      agentsByWorkspaceID[workspaceID] = []
      syncCanvasDocument(for: workspaceID)
      return
    }

    if agentsByWorkspaceID[workspaceID] != nil && !force {
      return
    }

    do {
      let agents = try await AppSignpost.withInterval(.agent, "Load Agents") {
        try await withBridgeRequest { client in
          try await client.agents(for: workspaceID)
        }
      }

      agentsByWorkspaceID[workspaceID] = sortedAgents(agents)
      for agent in agents {
        agentHandlesByID[agent.id]?.syncAgentRecord(agent)
      }
      normalizeSelectedAgent(for: workspaceID)
      syncCanvasDocument(for: workspaceID)
      AppLog.info(
        .agent,
        "Loaded agents",
        metadata: [
          "workspaceID": workspaceID,
          "agentCount": String(agents.count),
        ]
      )
    } catch {
      reportError(
        error,
        category: .agent,
        message: "Failed to load agents",
        workspaceID: workspaceID
      )
    }
  }

  func ensureAgentHandle(
    agentID: String,
    workspaceID: String
  ) -> AgentHandle {
    if let existing = agentHandlesByID[agentID] {
      if let agent = agent(agentID: agentID, workspaceID: workspaceID) {
        existing.syncAgentRecord(agent)
      }
      return existing
    }

    let handle = AgentHandle(
      agentID: agentID,
      workspaceID: workspaceID,
      agent: agent(agentID: agentID, workspaceID: workspaceID)
    )
    agentHandlesByID[agentID] = handle
    return handle
  }

  func loadAgentHandle(
    agentID: String,
    workspaceID: String
  ) async {
    guard customAgentActionsEnabled else {
      return
    }

    let handle = ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)
    await handle.load {
      try await AppSignpost.withInterval(.agent, "Load Agent Snapshot") {
        try await self.withBridgeRequest { client in
          try await client.agentSnapshot(agentID)
        }
      }
    }

    if let agent = handle.agent {
      upsertAgent(agent, workspaceID: agent.workspaceID)
    }

    if handle.state.phase == .failed, let errorMessage = handle.state.errorMessage {
      let failureMessage = "Failed to load agent"
      AppLog.error(
        .agent,
        failureMessage,
        metadata: [
          "workspaceID": workspaceID,
          "agentID": agentID,
          "error": errorMessage,
        ]
      )
      lastFailureSummary = "\(failureMessage): \(errorMessage)"
    }
  }

  func createAgentSurface(
    for workspaceID: String,
    provider: BridgeAgentProvider,
    groupID: String?
  ) async {
    guard customAgentActionsEnabled else {
      reportError(
        disabledCustomAgentActionError(),
        category: .agent,
        message: "Custom agent actions are disabled",
        workspaceID: workspaceID
      )
      return
    }

    do {
      let agent = try await AppSignpost.withInterval(.agent, "Create Agent") {
        try await withBridgeRequest { client in
          try await client.startAgent(for: workspaceID, provider: provider)
        }
      }

      upsertAgent(agent, workspaceID: workspaceID)
      enterAgent(agentID: agent.id, workspaceID: workspaceID, groupID: groupID)
      AppLog.notice(
        .agent,
        "Created agent",
        metadata: [
          "workspaceID": workspaceID,
          "agentID": agent.id,
          "provider": provider.rawValue,
        ]
      )
    } catch {
      reportError(
        error,
        category: .agent,
        message: "Failed to create agent",
        workspaceID: workspaceID,
        metadata: ["provider": provider.rawValue]
      )
    }
  }

  func enterAgent(
    agentID: String,
    workspaceID: String,
    groupID: String?,
    preferredSurfaceID: String? = nil
  ) {
    guard customAgentActionsEnabled else {
      return
    }

    AppLog.info(
      .agent,
      "Entering agent",
      metadata: [
        "workspaceID": workspaceID,
        "agentID": agentID,
      ]
    )
    selectedAgentIDByWorkspaceID[workspaceID] = agentID

    updateCanvasDocument(for: workspaceID) { document in
      if let existingSurfaceID = preferredSurfaceID ?? document.surfacesByID.values.first(where: { record in
        record.surfaceKind == .agent &&
          AgentSurfaceBinding(binding: record.binding)?.agentID == agentID
      })?.id {
        guard let targetGroupID = groupID ?? groupIDContainingSurface(existingSurfaceID, in: document),
              let group = document.groupsByID[targetGroupID]
        else {
          return document
        }

        var groups = document.groupsByID
        groups[targetGroupID] = CanvasGroup(
          id: group.id,
          surfaceOrder: group.surfaceOrder,
          activeSurfaceID: existingSurfaceID
        )

        return WorkspaceCanvasDocument(
          activeGroupID: targetGroupID,
          groupsByID: groups,
          surfacesByID: document.surfacesByID,
          activeLayoutMode: document.activeLayoutMode,
          tiledLayout: document.tiledLayout,
          spatialLayout: document.spatialLayout
        )
      }

      let surfaceRecord = agentSurfaceRecord(for: workspaceID, agentID: agentID)
      let targetGroupID =
        groupID ??
        document.activeGroupID ??
        canvasGroupIDs(in: document.layout).first ??
        defaultCanvasGroupID(for: workspaceID)
      let targetGroup = document.groupsByID[targetGroupID] ?? CanvasGroup(
        id: targetGroupID,
        surfaceOrder: [],
        activeSurfaceID: nil
      )

      var groups = document.groupsByID
      var surfacesByID = document.surfacesByID
      groups[targetGroupID] = CanvasGroup(
        id: targetGroup.id,
        surfaceOrder: targetGroup.surfaceOrder + [surfaceRecord.id],
        activeSurfaceID: surfaceRecord.id
      )
      surfacesByID[surfaceRecord.id] = surfaceRecord

      return WorkspaceCanvasDocument(
        activeGroupID: targetGroupID,
        groupsByID: groups,
        surfacesByID: surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }

    let _ = ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)

    Task {
      await loadAgentHandle(agentID: agentID, workspaceID: workspaceID)
    }
  }

  func agentSurfaceRecord(
    for workspaceID: String,
    agentID: String
  ) -> CanvasSurfaceRecord {
    let binding = AgentSurfaceBinding(
      workspaceID: workspaceID,
      agentID: agentID
    )
    let agent = agent(agentID: agentID, workspaceID: workspaceID)
    return CanvasSurfaceRecord(
      id: agentSurfaceID(for: workspaceID, agentID: agentID),
      title: agent.map(resolvedAgentTitle) ?? "Agent",
      surfaceKind: .agent,
      binding: binding.surfaceBinding
    )
  }

  func sortedAgents(_ agents: [BridgeAgentRecord]) -> [BridgeAgentRecord] {
    agents.sorted { left, right in
      if left.updatedAt == right.updatedAt {
        return left.id < right.id
      }

      return left.updatedAt > right.updatedAt
    }
  }

  func normalizeSelectedAgent(for workspaceID: String) {
    let agents = agentsByWorkspaceID[workspaceID] ?? []
    let nextSelectedAgentID =
      if let current = selectedAgentIDByWorkspaceID[workspaceID],
         agents.contains(where: { $0.id == current }) {
        current
      } else {
        agents.first?.id
      }

    selectedAgentIDByWorkspaceID[workspaceID] = nextSelectedAgentID
  }

  func workspaceForAgent(agentID: String) -> String? {
    for (workspaceID, agents) in agentsByWorkspaceID {
      if agents.contains(where: { $0.id == agentID }) {
        return workspaceID
      }
    }

    return agentHandlesByID[agentID]?.agent?.workspaceID
  }

  func disabledCustomAgentActionError() -> NSError {
    NSError(
      domain: "Lifecycle.Agent",
      code: 501,
      userInfo: [
        NSLocalizedDescriptionKey: "Custom agent actions are disabled in this build."
      ]
    )
  }
}
