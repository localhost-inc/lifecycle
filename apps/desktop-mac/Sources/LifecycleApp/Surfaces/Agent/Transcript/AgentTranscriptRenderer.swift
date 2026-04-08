import Foundation

enum AgentRenderableMessageRole: Equatable {
  case assistant
  case user
  case passive(String)

  init(rawValue: String) {
    switch rawValue.lowercased() {
    case "assistant":
      self = .assistant
    case "user":
      self = .user
    default:
      self = .passive(rawValue)
    }
  }

  var label: String {
    switch self {
    case .assistant:
      "ASSISTANT"
    case .user:
      "USER"
    case let .passive(value):
      value.uppercased()
    }
  }
}

enum AgentRenderableMessageStyle: Equatable {
  case assistant
  case user
  case passive
}

struct AgentRenderableMessage: Identifiable, Equatable {
  let id: String
  let role: AgentRenderableMessageRole
  let style: AgentRenderableMessageStyle
  let timestampText: String
  let segments: [AgentRenderableSegment]
  let isToolOnly: Bool
}

enum AgentRenderableSegment: Identifiable, Equatable {
  case toolGroup(AgentRenderableToolGroup)
  case contentGroup(AgentRenderableContentGroup)

  var id: String {
    switch self {
    case let .toolGroup(group):
      group.id
    case let .contentGroup(group):
      group.id
    }
  }
}

struct AgentRenderableToolGroup: Identifiable, Equatable {
  let id: String
  let summary: String?
  let parts: [AgentRenderablePart]

  var isCollapsible: Bool {
    parts.count > 1 && summary != nil
  }
}

struct AgentRenderableContentGroup: Identifiable, Equatable {
  let id: String
  let parts: [AgentRenderablePart]
  let compact: Bool

  var isThinkingOnly: Bool {
    parts.allSatisfy(\.isThinking)
  }
}

struct AgentRenderableTextPart: Equatable {
  let id: String
  let text: String
}

struct AgentRenderableLabeledTextPart: Equatable {
  let id: String
  let title: String
  let text: String
}

struct AgentRenderableToolCallPart: Equatable {
  let id: String
  let toolCallID: String?
  let toolName: String
  let status: String?
  let inputText: String?
  let outputText: String?
  let errorText: String?
}

struct AgentRenderableToolResultPart: Equatable {
  let id: String
  let toolCallID: String?
  let outputText: String?
  let errorText: String?
}

struct AgentRenderableApprovalPart: Equatable {
  let id: String
  let approvalID: String
  let decision: String?
  let kind: String?
  let message: String?
  let status: String?
}

struct AgentRenderableImagePart: Equatable {
  let id: String
  let mediaType: String
  let base64Data: String
}

enum AgentRenderablePart: Identifiable, Equatable {
  case text(AgentRenderableTextPart)
  case thinking(AgentRenderableLabeledTextPart)
  case status(AgentRenderableLabeledTextPart)
  case toolCall(AgentRenderableToolCallPart)
  case toolResult(AgentRenderableToolResultPart)
  case approval(AgentRenderableApprovalPart)
  case attachment(AgentRenderableLabeledTextPart)
  case artifact(AgentRenderableLabeledTextPart)
  case image(AgentRenderableImagePart)
  case unknown(AgentRenderableLabeledTextPart)

  var id: String {
    switch self {
    case let .text(part):
      part.id
    case let .thinking(part):
      part.id
    case let .status(part):
      part.id
    case let .toolCall(part):
      part.id
    case let .toolResult(part):
      part.id
    case let .approval(part):
      part.id
    case let .attachment(part):
      part.id
    case let .artifact(part):
      part.id
    case let .image(part):
      part.id
    case let .unknown(part):
      part.id
    }
  }

  var isThinking: Bool {
    if case .thinking = self {
      return true
    }
    return false
  }

  var isToolLike: Bool {
    switch self {
    case .toolCall, .toolResult:
      true
    default:
      false
    }
  }

  var toolName: String? {
    switch self {
    case let .toolCall(part):
      part.toolName
    case .toolResult:
      "Tool Result"
    default:
      nil
    }
  }
}

private struct AgentTranscriptSourceMessage: Equatable {
  let id: String
  let role: AgentRenderableMessageRole
  let turnID: String?
  let parts: [AgentRenderablePart]
  let createdAt: String
}

func buildAgentTranscriptMessages(from messages: [BridgeAgentMessage]) -> [AgentRenderableMessage] {
  mergeAssistantMessages(normalizeAgentMessages(messages)).map(buildRenderableMessage)
}

func agentRelativeTimestamp(_ isoString: String) -> String {
  let formatter = ISO8601DateFormatter()
  formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  let fallback = ISO8601DateFormatter()

  guard let date = formatter.date(from: isoString) ?? fallback.date(from: isoString) else {
    return isoString
  }

  let elapsed = Date().timeIntervalSince(date)
  if elapsed < 60 {
    return "just now"
  }
  if elapsed < 3_600 {
    return "\(Int(elapsed / 60))m ago"
  }
  if elapsed < 86_400 {
    return "\(Int(elapsed / 3_600))h ago"
  }
  return "\(Int(elapsed / 86_400))d ago"
}

private func normalizeAgentMessages(_ messages: [BridgeAgentMessage]) -> [AgentTranscriptSourceMessage] {
  messages.map { message in
    let role = AgentRenderableMessageRole(rawValue: message.role)
    let sortedParts = message.parts.sorted { $0.partIndex < $1.partIndex }
    let parts: [AgentRenderablePart]

    if sortedParts.isEmpty, !message.text.isEmpty {
      parts = [
        .text(
          AgentRenderableTextPart(
            id: "\(message.id):text",
            text: message.text
          )
        ),
      ]
    } else {
      parts = sortedParts.compactMap(buildRenderablePart)
    }

    return AgentTranscriptSourceMessage(
      id: message.id,
      role: role,
      turnID: message.turnID,
      parts: parts,
      createdAt: message.createdAt
    )
  }
}

private func mergeAssistantMessages(
  _ messages: [AgentTranscriptSourceMessage]
) -> [AgentTranscriptSourceMessage] {
  var merged: [AgentTranscriptSourceMessage] = []

  for message in messages {
    guard case .assistant = message.role,
          let turnID = message.turnID,
          let previous = merged.last,
          case .assistant = previous.role,
          previous.turnID == turnID
    else {
      merged.append(message)
      continue
    }

    merged[merged.count - 1] = AgentTranscriptSourceMessage(
      id: previous.id,
      role: previous.role,
      turnID: previous.turnID,
      parts: previous.parts + message.parts,
      createdAt: message.createdAt
    )
  }

  return merged
}

private func buildRenderableMessage(_ source: AgentTranscriptSourceMessage) -> AgentRenderableMessage {
  let style: AgentRenderableMessageStyle
  switch source.role {
  case .assistant:
    style = .assistant
  case .user:
    style = .user
  case .passive:
    style = .passive
  }

  let isToolOnly = assistantMessageIsToolOnly(source.parts)
  let segments =
    switch source.role {
    case .assistant:
      buildAssistantSegments(parts: source.parts, isToolOnly: isToolOnly)
    case .user, .passive:
      buildFlatContentSegments(parts: source.parts)
    }

  return AgentRenderableMessage(
    id: source.id,
    role: source.role,
    style: style,
    timestampText: agentRelativeTimestamp(source.createdAt),
    segments: segments,
    isToolOnly: isToolOnly
  )
}

private func buildFlatContentSegments(parts: [AgentRenderablePart]) -> [AgentRenderableSegment] {
  guard !parts.isEmpty else {
    return []
  }

  return [
    .contentGroup(
      AgentRenderableContentGroup(
        id: segmentID(prefix: "content", parts: parts),
        parts: parts,
        compact: false
      )
    ),
  ]
}

private func buildAssistantSegments(
  parts: [AgentRenderablePart],
  isToolOnly: Bool
) -> [AgentRenderableSegment] {
  var segments: [AgentRenderableSegment] = []
  var activeToolParts: [AgentRenderablePart] = []
  var activeContentParts: [AgentRenderablePart] = []

  func flushTools() {
    guard !activeToolParts.isEmpty else {
      return
    }

    segments.append(
      .toolGroup(
        AgentRenderableToolGroup(
          id: segmentID(prefix: "tools", parts: activeToolParts),
          summary: activeToolParts.count > 1 ? buildToolSummary(for: activeToolParts) : nil,
          parts: activeToolParts
        )
      )
    )
    activeToolParts.removeAll(keepingCapacity: true)
  }

  func flushContent() {
    guard !activeContentParts.isEmpty else {
      return
    }

    segments.append(
      .contentGroup(
        AgentRenderableContentGroup(
          id: segmentID(prefix: "content", parts: activeContentParts),
          parts: activeContentParts,
          compact: isToolOnly
        )
      )
    )
    activeContentParts.removeAll(keepingCapacity: true)
  }

  for part in parts {
    if part.isToolLike {
      flushContent()
      if shouldSeparateToolPart(part) {
        flushTools()
        segments.append(
          .toolGroup(
            AgentRenderableToolGroup(
              id: segmentID(prefix: "tools", parts: [part]),
              summary: nil,
              parts: [part]
            )
          )
        )
      } else {
        activeToolParts.append(part)
      }
      continue
    }

    if part.isThinking {
      flushTools()
      flushContent()
      segments.append(
        .contentGroup(
          AgentRenderableContentGroup(
            id: segmentID(prefix: "content", parts: [part]),
            parts: [part],
            compact: false
          )
        )
      )
      continue
    }

    flushTools()
    activeContentParts.append(part)
  }

  flushTools()
  flushContent()
  return segments
}

private func assistantMessageIsToolOnly(_ parts: [AgentRenderablePart]) -> Bool {
  !parts.isEmpty && parts.allSatisfy { part in
    switch part {
    case .toolCall, .toolResult, .status, .attachment, .artifact:
      true
    case .text, .thinking, .approval, .image, .unknown:
      false
    }
  }
}

private func shouldSeparateToolPart(_ part: AgentRenderablePart) -> Bool {
  guard let toolName = part.toolName?.lowercased() else {
    return false
  }

  return ["edit", "write", "delete", "deletefile", "file_change", "apply_patch"].contains(toolName)
}

private func segmentID(prefix: String, parts: [AgentRenderablePart]) -> String {
  let first = parts.first?.id ?? "empty"
  let last = parts.last?.id ?? first
  return "\(prefix):\(first):\(last)"
}

private struct AgentToolTally {
  var searched = 0
  var read = 0
  var edited = 0
  var wrote = 0
  var deleted = 0
  var ran = 0
  var delegated = 0
  var other = 0
}

private func buildToolSummary(for parts: [AgentRenderablePart]) -> String {
  var tally = AgentToolTally()

  for part in parts {
    let toolName = part.toolName?.lowercased() ?? ""
    switch toolName {
    case "grep", "glob", "toolsearch", "websearch", "search_query", "image_query", "find":
      tally.searched += 1
    case "read", "webfetch", "open", "click":
      tally.read += 1
    case "edit", "apply_patch":
      tally.edited += 1
    case "write", "create_file":
      tally.wrote += 1
    case "delete", "deletefile":
      tally.deleted += 1
    case "bash", "command_execution", "exec_command":
      tally.ran += 1
    case "agent", "spawn_agent":
      tally.delegated += 1
    default:
      tally.other += 1
    }
  }

  var summaryParts: [String] = []
  if tally.searched > 0 {
    summaryParts.append("searched \(pluralize(tally.searched, singular: "pattern"))")
  }
  if tally.read > 0 {
    summaryParts.append("read \(pluralize(tally.read, singular: "file"))")
  }
  if tally.edited > 0 {
    summaryParts.append("edited \(pluralize(tally.edited, singular: "file"))")
  }
  if tally.wrote > 0 {
    summaryParts.append("wrote \(pluralize(tally.wrote, singular: "file"))")
  }
  if tally.deleted > 0 {
    summaryParts.append("deleted \(pluralize(tally.deleted, singular: "file"))")
  }
  if tally.ran > 0 {
    summaryParts.append("ran \(pluralize(tally.ran, singular: "command"))")
  }
  if tally.delegated > 0 {
    summaryParts.append("delegated \(pluralize(tally.delegated, singular: "agent"))")
  }
  if tally.other > 0 {
    summaryParts.append("ran \(pluralize(tally.other, singular: "tool"))")
  }

  guard let first = summaryParts.first else {
    return "Worked with tools"
  }

  let summary = ([uppercasingFirstCharacter(first)] + summaryParts.dropFirst()).joined(separator: ", ")
  return summary
}

private func pluralize(_ count: Int, singular: String, plural: String? = nil) -> String {
  if count == 1 {
    return "\(count) \(singular)"
  }

  return "\(count) \(plural ?? "\(singular)s")"
}

private func uppercasingFirstCharacter(_ text: String) -> String {
  guard let first = text.first else {
    return text
  }

  return String(first).uppercased() + text.dropFirst()
}

private func buildRenderablePart(_ part: BridgeAgentMessagePart) -> AgentRenderablePart? {
  switch part.partType {
  case "text":
    return .text(AgentRenderableTextPart(id: part.id, text: part.text ?? ""))
  case "thinking":
    return .thinking(AgentRenderableLabeledTextPart(id: part.id, title: "Thinking", text: part.text ?? ""))
  case "status":
    return .status(AgentRenderableLabeledTextPart(id: part.id, title: "Status", text: part.text ?? ""))
  case "tool_call":
    if let data = part.decodeData(as: BridgeAgentToolCallPartData.self) {
      return .toolCall(
        AgentRenderableToolCallPart(
          id: part.id,
          toolCallID: data.toolCallID,
          toolName: data.toolName,
          status: data.status,
          inputText: data.inputJSON,
          outputText: data.outputJSON,
          errorText: data.errorText
        )
      )
    }
  case "tool_result":
    if let data = part.decodeData(as: BridgeAgentToolResultPartData.self) {
      return .toolResult(
        AgentRenderableToolResultPart(
          id: part.id,
          toolCallID: data.toolCallID,
          outputText: data.outputJSON,
          errorText: data.errorText
        )
      )
    }
  case "approval_ref":
    if let data = part.decodeData(as: BridgeAgentApprovalPartData.self) {
      return .approval(
        AgentRenderableApprovalPart(
          id: part.id,
          approvalID: data.approvalID,
          decision: data.decision,
          kind: data.kind,
          message: data.message,
          status: data.status
        )
      )
    }
  case "attachment_ref":
    if let data = part.decodeData(as: BridgeAgentAttachmentRefPartData.self) {
      return .attachment(
        AgentRenderableLabeledTextPart(
          id: part.id,
          title: "Attachment",
          text: data.attachmentID
        )
      )
    }
  case "artifact_ref":
    if let data = part.decodeData(as: BridgeAgentArtifactRefPartData.self) {
      return .artifact(
        AgentRenderableLabeledTextPart(
          id: part.id,
          title: data.artifactType ?? "Artifact",
          text: [data.title, data.uri].compactMap { $0 }.joined(separator: "\n")
        )
      )
    }
  case "image":
    if let data = part.decodeData(as: BridgeAgentImagePartData.self) {
      return .image(
        AgentRenderableImagePart(
          id: part.id,
          mediaType: data.mediaType,
          base64Data: data.base64Data
        )
      )
    }
  default:
    break
  }

  if let text = part.text, !text.isEmpty {
    return .unknown(
      AgentRenderableLabeledTextPart(
        id: part.id,
        title: part.partType,
        text: text
      )
    )
  }

  return nil
}
