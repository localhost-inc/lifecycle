import AppKit
import SwiftUI

enum AgentDisplayStatus {
  case idle
  case working
  case waiting
  case failed

  init(agentStatus: String?) {
    switch agentStatus?.lowercased() {
    case "running", "starting":
      self = .working
    case "waiting_approval", "waiting_input":
      self = .waiting
    case "failed", "cancelled":
      self = .failed
    default:
      self = .idle
    }
  }

  var label: String {
    switch self {
    case .idle:
      "Idle"
    case .working:
      "Working"
    case .waiting:
      "Waiting"
    case .failed:
      "Failed"
    }
  }
}

struct AgentStatusBarUsage: Equatable {
  let inputTokens: Int
  let outputTokens: Int
  let cacheReadTokens: Int
  let costUSD: Double

  var contextTokens: Int {
    inputTokens + cacheReadTokens
  }

  var hasUsage: Bool {
    contextTokens > 0 || costUSD > 0
  }
}

struct AgentStatusBarDebugData {
  let agent: BridgeAgentRecord?
  let handleState: AgentHandleState
  let latestStatus: String?
  let errorMessage: String?
  let usage: AgentStatusBarUsage?
  let messageCount: Int
  let eventCount: Int
  let canSend: Bool
  let canCancel: Bool
}

func agentStatusBarUsage(
  from events: [BridgeAgentSocketEvent]
) -> AgentStatusBarUsage? {
  var inputTokens = 0
  var outputTokens = 0
  var cacheReadTokens = 0
  var costUSD = 0.0
  var sawUsage = false
  var sawCost = false

  for event in events {
    if let usage = event.usage {
      sawUsage = true
      inputTokens += usage.inputTokens
      outputTokens += usage.outputTokens
      cacheReadTokens += usage.cacheReadTokens ?? 0
    }

    if let turnCostUSD = event.costUSD {
      sawCost = true
      costUSD += turnCostUSD
    }
  }

  guard sawUsage || sawCost else {
    return nil
  }

  return AgentStatusBarUsage(
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    cacheReadTokens: cacheReadTokens,
    costUSD: costUSD
  )
}

struct AgentStatusBarView: View {
  @Environment(\.appTheme) private var theme

  let providerLabel: String
  let status: AgentDisplayStatus
  let latestStatus: String?
  let errorMessage: String?
  let usage: AgentStatusBarUsage?
  let debugData: AgentStatusBarDebugData?
  let isSending: Bool
  let canSend: Bool
  let onSend: (() async -> Void)?

  @State private var isDebugInspectorPresented = false

  var body: some View {
    HStack(spacing: 12) {
      AgentProviderBadgeView(label: providerLabel)

      if let statusText = displayStatusText {
        Text(verbatim: statusText)
          .lineLimit(1)
          .truncationMode(.tail)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(displayStatusColor.opacity(0.78))
      }

      Spacer(minLength: 0)

      if let usage, usage.hasUsage {
        Text(usageSummaryText(usage))
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.72))
          .help(
            """
            Input: \(usage.inputTokens.formatted()) \
            | Output: \(usage.outputTokens.formatted()) \
            | Cache read: \(usage.cacheReadTokens.formatted())
            """
          )
      }

      AgentStatusIndicator(status: status)

      if let debugData {
        Button {
          isDebugInspectorPresented = true
        } label: {
          Image(systemName: "ladybug")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(theme.mutedColor.opacity(0.55))
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .help("Agent debug")
        .sheet(isPresented: $isDebugInspectorPresented) {
          AgentDebugInspectorView(debugData: debugData)
        }
      }

      if let onSend {
        Button {
          Task {
            await onSend()
          }
        } label: {
          Text(isSending ? "sending..." : "send")
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(canSend ? theme.primaryTextColor : theme.mutedColor.opacity(0.45))
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .disabled(!canSend)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 6)
    .overlay(alignment: .top) {
      Rectangle()
        .fill(theme.borderColor.opacity(0.55))
        .frame(height: 1)
    }
  }

  private var displayStatusText: String? {
    if let errorMessage, !errorMessage.isEmpty {
      return errorMessage
    }

    guard let latestStatus, !latestStatus.isEmpty else {
      return nil
    }

    return latestStatus
  }

  private var displayStatusColor: Color {
    switch status {
    case .idle:
      return theme.mutedColor
    case .working:
      return theme.accentColor
    case .waiting:
      return theme.warningColor
    case .failed:
      return theme.errorColor
    }
  }

  private func usageSummaryText(_ usage: AgentStatusBarUsage) -> String {
    let context = "\(formatAgentTokenCount(usage.contextTokens)) ctx"
    guard usage.costUSD > 0 else {
      return context
    }

    return "\(context) · $\(formatAgentCost(usage.costUSD))"
  }
}

private struct AgentProviderBadgeView: View {
  @Environment(\.appTheme) private var theme

  let label: String

  var body: some View {
    HStack(spacing: 6) {
      Circle()
        .fill(theme.accentColor.opacity(0.85))
        .frame(width: 6, height: 6)

      Text(label.uppercased())
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .tracking(0.9)
        .foregroundStyle(theme.mutedColor)
    }
  }
}

private struct AgentStatusIndicator: View {
  @Environment(\.appTheme) private var theme

  let status: AgentDisplayStatus

  var body: some View {
    HStack(spacing: 6) {
      statusIcon
      Text(status.label)
        .font(.system(size: 11, weight: .medium, design: .monospaced))
    }
    .foregroundStyle(statusColor)
  }

  @ViewBuilder
  private var statusIcon: some View {
    switch status {
    case .idle:
      Image(systemName: "message")
        .font(.system(size: 11, weight: .medium))
    case .working:
      ProgressView()
        .controlSize(.small)
        .scaleEffect(0.6)
        .frame(width: 10, height: 10)
    case .waiting:
      Image(systemName: "pause.fill")
        .font(.system(size: 9, weight: .bold))
    case .failed:
      Image(systemName: "exclamationmark.triangle.fill")
        .font(.system(size: 10, weight: .bold))
    }
  }

  private var statusColor: Color {
    switch status {
    case .idle:
      theme.mutedColor.opacity(0.72)
    case .working:
      theme.accentColor
    case .waiting:
      theme.warningColor
    case .failed:
      theme.errorColor
    }
  }
}

private struct AgentDebugInspectorView: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.appTheme) private var theme

  let debugData: AgentStatusBarDebugData

  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 12) {
        Text("Agent Debug")
          .font(.system(size: 12, weight: .semibold))
          .textCase(.uppercase)
          .tracking(1.2)
          .foregroundStyle(theme.primaryTextColor)

        Spacer(minLength: 0)

        Button("Copy JSON") {
          copyDebugJSON()
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)

        Button("Close") {
          dismiss()
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .overlay(alignment: .bottom) {
        Rectangle()
          .fill(theme.borderColor.opacity(0.55))
          .frame(height: 1)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          AgentDebugSection(title: "Agent Record") {
            if let agent = debugData.agent {
              AgentDebugKeyValueGrid(
                rows: [
                  ("id", agent.id),
                  ("workspace_id", agent.workspaceID),
                  ("provider", agent.provider),
                  ("provider_id", agent.providerID ?? "—"),
                  ("title", agent.title.isEmpty ? "—" : agent.title),
                  ("status", agent.status),
                  ("last_message_at", agent.lastMessageAt ?? "—"),
                  ("created_at", agent.createdAt),
                  ("updated_at", agent.updatedAt),
                ]
              )
            } else {
              AgentDebugEmptyState(text: "Agent not found.")
            }
          }

          AgentDebugSection(title: "Live State") {
            AgentDebugKeyValueGrid(
              rows: [
                ("handle_phase", handlePhaseLabel(debugData.handleState.phase)),
                ("latest_status", debugData.latestStatus ?? "—"),
                ("error", debugData.errorMessage ?? "—"),
                ("message_count", "\(debugData.messageCount)"),
                ("event_count", "\(debugData.eventCount)"),
                ("can_send", debugData.canSend ? "true" : "false"),
                ("can_cancel", debugData.canCancel ? "true" : "false"),
                ("usage.input_tokens", "\(debugData.usage?.inputTokens ?? 0)"),
                ("usage.output_tokens", "\(debugData.usage?.outputTokens ?? 0)"),
                ("usage.cache_read_tokens", "\(debugData.usage?.cacheReadTokens ?? 0)"),
                ("usage.cost_usd", debugData.usage.map { formatAgentCost($0.costUSD) } ?? "0.000"),
              ]
            )
          }

          AgentDebugSection(title: "Messages (\(debugData.handleState.messages.count))") {
            if debugData.handleState.messages.isEmpty {
              AgentDebugEmptyState(text: "No messages.")
            } else {
              VStack(spacing: 0) {
                ForEach(Array(debugData.handleState.messages.enumerated()), id: \.element.id) {
                  index,
                  message in
                  AgentDebugMessageRow(index: index, message: message)
                }
              }
              .background(theme.surfaceBackground.opacity(0.55))
              .overlay {
                RoundedRectangle(cornerRadius: 6)
                  .stroke(theme.borderColor.opacity(0.55), lineWidth: 1)
              }
            }
          }
        }
        .padding(16)
      }
    }
    .frame(minWidth: 760, minHeight: 520)
    .background(theme.surfaceBackground)
  }

  private func copyDebugJSON() {
    let pasteboard = NSPasteboard.general
    pasteboard.clearContents()
    pasteboard.setString(debugJSONString(debugData), forType: .string)
  }
}

private struct AgentDebugSection<Content: View>: View {
  @Environment(\.appTheme) private var theme

  let title: String
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title)
        .font(.system(size: 11, weight: .semibold))
        .textCase(.uppercase)
        .tracking(1.0)
        .foregroundStyle(theme.mutedColor)

      content
    }
  }
}

private struct AgentDebugKeyValueGrid: View {
  @Environment(\.appTheme) private var theme

  let rows: [(String, String)]

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
        HStack(alignment: .top, spacing: 12) {
          Text(row.0)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
            .frame(width: 160, alignment: .leading)

          Text(verbatim: row.1)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.primaryTextColor)
            .textSelection(.enabled)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)

        if index < rows.count - 1 {
          Rectangle()
            .fill(theme.borderColor.opacity(0.4))
            .frame(height: 1)
        }
      }
    }
    .background(theme.surfaceBackground.opacity(0.55))
    .overlay {
      RoundedRectangle(cornerRadius: 6)
        .stroke(theme.borderColor.opacity(0.55), lineWidth: 1)
    }
  }
}

private struct AgentDebugEmptyState: View {
  @Environment(\.appTheme) private var theme

  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .medium, design: .monospaced))
      .foregroundStyle(theme.mutedColor.opacity(0.72))
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .background(theme.surfaceBackground.opacity(0.55))
      .overlay {
        RoundedRectangle(cornerRadius: 6)
          .stroke(theme.borderColor.opacity(0.55), lineWidth: 1)
      }
  }
}

private struct AgentDebugMessageRow: View {
  @Environment(\.appTheme) private var theme

  let index: Int
  let message: BridgeAgentMessage

  @State private var isExpanded = false

  var body: some View {
    DisclosureGroup(isExpanded: $isExpanded) {
      VStack(alignment: .leading, spacing: 10) {
        AgentDebugKeyValueGrid(
          rows: [
            ("id", message.id),
            ("agent_id", message.agentID),
            ("role", message.role),
            ("turn_id", message.turnID ?? "—"),
            ("created_at", message.createdAt),
            ("text_length", "\(message.text.count)"),
            ("parts_count", "\(message.parts.count)"),
          ]
        )

        if !message.text.isEmpty {
          ScrollView(.horizontal) {
            Text(verbatim: message.text)
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor)
              .textSelection(.enabled)
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(12)
          }
          .background(theme.surfaceRaised.opacity(0.45))
          .overlay {
            RoundedRectangle(cornerRadius: 6)
              .stroke(theme.borderColor.opacity(0.5), lineWidth: 1)
          }
        }
      }
      .padding(.leading, 18)
      .padding(.trailing, 12)
      .padding(.bottom, 12)
    } label: {
      HStack(spacing: 10) {
        Text("\(index)")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.5))
          .frame(width: 18, alignment: .trailing)

        Text(message.role)
          .font(.system(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(roleColor)
          .frame(width: 72, alignment: .leading)

        Text(verbatim: messagePreview(message))
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor.opacity(0.78))
          .lineLimit(1)

        Spacer(minLength: 0)

        Text(message.parts.isEmpty ? "text-only" : "\(message.parts.count) parts")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.55))
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .contentShape(Rectangle())
    }
    .accentColor(theme.mutedColor)
    .overlay(alignment: .bottom) {
      Rectangle()
        .fill(theme.borderColor.opacity(0.4))
        .frame(height: 1)
    }
  }

  private var roleColor: Color {
    switch message.role {
    case "user":
      theme.accentColor
    case "assistant":
      theme.successColor
    default:
      theme.mutedColor
    }
  }
}

private func messagePreview(_ message: BridgeAgentMessage) -> String {
  let source = message.text.isEmpty ? message.parts.compactMap(\.text).joined(separator: " ") : message.text
  let cleaned = source.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
  guard cleaned.count > 120 else {
    return cleaned.isEmpty ? "(empty)" : cleaned
  }

  return String(cleaned.prefix(120)) + "..."
}

private func handlePhaseLabel(_ phase: AgentHandlePhase) -> String {
  switch phase {
  case .missing:
    "missing"
  case .loading:
    "loading"
  case .ready:
    "ready"
  case .failed:
    "failed"
  }
}

private func debugJSONString(_ debugData: AgentStatusBarDebugData) -> String {
  let object = debugJSONObject(debugData)
  guard JSONSerialization.isValidJSONObject(object),
        let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted]),
        let string = String(data: data, encoding: .utf8)
  else {
    return "{}"
  }

  return string
}

private func debugJSONObject(_ debugData: AgentStatusBarDebugData) -> [String: Any] {
  [
    "agent": debugData.agent.map(debugAgentObject) ?? NSNull(),
    "liveState": [
      "handlePhase": handlePhaseLabel(debugData.handleState.phase),
      "latestStatus": debugData.latestStatus ?? NSNull(),
      "error": debugData.errorMessage ?? NSNull(),
      "messageCount": debugData.messageCount,
      "eventCount": debugData.eventCount,
      "canSend": debugData.canSend,
      "canCancel": debugData.canCancel,
      "usage": debugData.usage.map(debugUsageObject) ?? NSNull(),
    ],
    "messages": debugData.handleState.messages.map(debugMessageObject),
  ]
}

private func debugAgentObject(_ agent: BridgeAgentRecord) -> [String: Any] {
  [
    "id": agent.id,
    "workspace_id": agent.workspaceID,
    "provider": agent.provider,
    "provider_id": agent.providerID ?? NSNull(),
    "title": agent.title,
    "status": agent.status,
    "last_message_at": agent.lastMessageAt ?? NSNull(),
    "created_at": agent.createdAt,
    "updated_at": agent.updatedAt,
  ]
}

private func debugUsageObject(_ usage: AgentStatusBarUsage) -> [String: Any] {
  [
    "inputTokens": usage.inputTokens,
    "outputTokens": usage.outputTokens,
    "cacheReadTokens": usage.cacheReadTokens,
    "costUsd": usage.costUSD,
  ]
}

private func debugMessageObject(_ message: BridgeAgentMessage) -> [String: Any] {
  [
    "id": message.id,
    "agent_id": message.agentID,
    "role": message.role,
    "text": message.text,
    "turn_id": message.turnID ?? NSNull(),
    "created_at": message.createdAt,
    "parts": message.parts.map(debugMessagePartObject),
  ]
}

private func debugMessagePartObject(_ part: BridgeAgentMessagePart) -> [String: Any] {
  [
    "id": part.id,
    "message_id": part.messageID,
    "agent_id": part.agentID,
    "part_index": part.partIndex,
    "part_type": part.partType,
    "text": part.text ?? NSNull(),
    "data": decodedDebugPartData(part.data),
    "created_at": part.createdAt,
  ]
}

private func decodedDebugPartData(_ data: String?) -> Any {
  guard let data, !data.isEmpty else {
    return NSNull()
  }

  guard let jsonData = data.data(using: .utf8),
        let object = try? JSONSerialization.jsonObject(with: jsonData)
  else {
    return data
  }

  return object
}

private func formatAgentTokenCount(_ tokens: Int) -> String {
  if tokens >= 1_000_000 {
    return String(format: "%.1fM", Double(tokens) / 1_000_000)
  }

  if tokens >= 1_000 {
    return String(format: "%.0fk", Double(tokens) / 1_000)
  }

  return "\(tokens)"
}

private func formatAgentCost(_ usd: Double) -> String {
  if usd >= 0.01 {
    return String(format: "%.2f", usd)
  }

  return String(format: "%.3f", usd)
}
