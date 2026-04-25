import SwiftUI

enum AgentSurfacePhase: Equatable {
  case centeredComposer
  case transcript
  case unavailable
}

func agentSurfacePhase(
  agent: BridgeAgentRecord?,
  transcriptMessageCount: Int,
  handleState: AgentHandleState
) -> AgentSurfacePhase {
  guard let agent else {
    return .unavailable
  }

  let hasKnownTranscriptHistory =
    transcriptMessageCount > 0 || agent.lastMessageAt?.isEmpty == false
  let status = agent.status.lowercased()

  if (status == "idle" || status == "starting") && !hasKnownTranscriptHistory {
    return .centeredComposer
  }

  if hasKnownTranscriptHistory ||
    handleState.snapshot != nil ||
    handleState.isLoading ||
    status == "starting" ||
    status == "running" ||
    status == "waiting_approval" ||
    status == "failed"
  {
    return .transcript
  }

  return .unavailable
}

struct AgentSurfaceView: View {
  @Environment(\.appTheme) private var theme

  let model: AppModel
  let workspace: BridgeWorkspaceSummary
  @ObservedObject var handle: AgentHandle

  @State private var draftPrompt = ""
  @State private var actionErrorMessage: String?
  @State private var isSending = false
  @State private var resolvingApprovalIDs = Set<String>()

  private var agent: BridgeAgentRecord? {
    handle.agent
  }

  private var handleState: AgentHandleState {
    handle.state
  }

  private var transcriptMessages: [AgentRenderableMessage] {
    buildAgentTranscriptMessages(from: handleState.messages)
  }

  private var latestStatus: String? {
    handle.latestStatusDetail
  }

  private var statusBarUsage: AgentStatusBarUsage? {
    agentStatusBarUsage(from: handle.events)
  }

  private var surfaceErrorMessage: String? {
    if let actionErrorMessage, !actionErrorMessage.isEmpty {
      return actionErrorMessage
    }

    return handleState.errorMessage
  }

  private var displayStatus: AgentDisplayStatus {
    AgentDisplayStatus(agentStatus: agent?.status)
  }

  private var statusBarDebugData: AgentStatusBarDebugData {
    AgentStatusBarDebugData(
      agent: agent,
      handleState: handleState,
      latestStatus: latestStatus,
      errorMessage: surfaceErrorMessage,
      usage: statusBarUsage,
      messageCount: handleState.messages.count,
      eventCount: handle.events.count,
      canSend: canSend,
      canCancel: canCancel
    )
  }

  private var canSend: Bool {
    let trimmed = draftPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty,
          agent != nil,
          !isSending
    else {
      return false
    }

    switch agent?.status.lowercased() {
    case "running", "starting", "waiting_approval":
      return false
    default:
      return true
    }
  }

  private var canEdit: Bool {
    guard let agent else {
      return false
    }

    return agent.status.lowercased() != "running" && agent.status.lowercased() != "waiting_approval"
  }

  private var canCancel: Bool {
    guard let agent else {
      return false
    }

    let status = agent.status.lowercased()
    return status == "running" || status == "waiting_approval"
  }

  private var cancelAction: (() async -> Void)? {
    guard canCancel, let agent else {
      return nil
    }

    return {
      await cancelTurn(for: agent.id)
    }
  }

  private var showActivityBar: Bool {
    guard let agent else {
      return false
    }

    let status = agent.status.lowercased()
    return status == "running" || status == "starting"
  }

  private var surfacePhase: AgentSurfacePhase {
    agentSurfacePhase(
      agent: agent,
      transcriptMessageCount: transcriptMessages.count,
      handleState: handleState
    )
  }

  private var transcriptStatusRows: [AgentTranscriptStatusRow] {
    guard let agent else {
      return []
    }

    let status = agent.status.lowercased()
    var rows: [AgentTranscriptStatusRow] = []
    if status == "starting" {
      rows.append(
        AgentTranscriptStatusRow(
          id: "starting",
          text: "starting \(agent.provider)...",
          tone: .muted
        )
      )
    }

    if handleState.phase == .loading {
      rows.insert(
        AgentTranscriptStatusRow(
          id: "loading",
          text: "loading agent...",
          tone: .muted
        ),
        at: 0
      )
    }

    if let handleErrorMessage = handleState.errorMessage,
       status != "failed"
    {
      rows.append(
        AgentTranscriptStatusRow(
          id: "detail-error",
          text: handleErrorMessage,
          tone: .error
        )
      )
    }

    if status == "failed" {
      rows.append(
        AgentTranscriptStatusRow(
          id: "failed",
          text: surfaceErrorMessage ?? "failed to start \(agent.provider)",
          tone: .error
        )
      )
    }

    return rows
  }

  var body: some View {
    Group {
      switch surfacePhase {
      case .centeredComposer:
        VStack {
          Spacer(minLength: 0)

          VStack(alignment: .leading, spacing: 8) {
            AgentComposerView(
              draftPrompt: $draftPrompt,
              layout: .centered,
              isSending: isSending,
              canEdit: canEdit,
              planMode: false
            )

            AgentStatusBarView(
              providerLabel: agent?.provider ?? "agent",
              status: displayStatus,
              latestStatus: latestStatus,
              errorMessage: surfaceErrorMessage,
              usage: statusBarUsage,
              debugData: statusBarDebugData,
              isSending: isSending,
              canSend: canSend,
              onSend: sendPrompt
            )
          }
          .frame(maxWidth: 880)
          .padding(.horizontal, 24)

          Spacer(minLength: 0)
        }
      case .transcript:
        VStack(spacing: 0) {
          Group {
            AgentTranscriptView(
              messages: transcriptMessages,
              statusRows: transcriptStatusRows,
              isRunning: showActivityBar,
              activityBarVisible: showActivityBar,
              activityBarAgentStatus: agent?.status,
              activityBarLatestStatus: latestStatus,
              activityBarCanCancel: canCancel,
              activityBarOnCancel: cancelAction,
              resolvingApprovalIDs: resolvingApprovalIDs,
              onResolveApproval: resolveApproval
            )
          }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

          AgentComposerView(
            draftPrompt: $draftPrompt,
            layout: .docked,
            isSending: isSending,
            canEdit: canEdit,
            planMode: false
          )

          AgentStatusBarView(
            providerLabel: agent?.provider ?? "agent",
            status: displayStatus,
            latestStatus: latestStatus,
            errorMessage: surfaceErrorMessage,
            usage: statusBarUsage,
            debugData: statusBarDebugData,
            isSending: isSending,
            canSend: canSend,
            onSend: sendPrompt
          )
        }
      case .unavailable:
        AgentUnavailableStateView()
      }
    }
    .background(theme.surfaceBackground)
    .contentShape(Rectangle())
  }

  private func sendPrompt() async {
    guard let agent else {
      actionErrorMessage = "Agent not found."
      return
    }

    let trimmed = draftPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      return
    }

    isSending = true
    actionErrorMessage = nil

    do {
      try await model.sendAgentPrompt(
        agentID: agent.id,
        workspaceID: workspace.id,
        text: trimmed
      )
      draftPrompt = ""
    } catch {
      actionErrorMessage = error.localizedDescription
    }

    isSending = false
  }

  private func cancelTurn(for agentID: String) async {
    actionErrorMessage = nil

    do {
      try await model.cancelAgentTurn(agentID: agentID)
    } catch {
      actionErrorMessage = error.localizedDescription
    }
  }

  private func resolveApproval(
    _ approvalID: String,
    _ decision: BridgeAgentApprovalDecision
  ) async {
    guard let agent else {
      return
    }

    resolvingApprovalIDs.insert(approvalID)
    actionErrorMessage = nil

    do {
      try await model.resolveAgentApproval(
        agentID: agent.id,
        approvalID: approvalID,
        decision: decision
      )
    } catch {
      actionErrorMessage = error.localizedDescription
    }

    resolvingApprovalIDs.remove(approvalID)
  }
}

private struct AgentUnavailableStateView: View {
  @Environment(\.appTheme) private var theme

  var body: some View {
    VStack(spacing: 12) {
      Text("Agent unavailable")
        .font(.lc(size: 16, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)

      Text("The bridge has not loaded transcript data for this agent yet.")
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
        .multilineTextAlignment(.center)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(24)
  }
}
