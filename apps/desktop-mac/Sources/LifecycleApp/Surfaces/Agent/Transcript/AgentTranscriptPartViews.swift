import AppKit
import SwiftUI

typealias AgentApprovalResolver = (String, BridgeAgentApprovalDecision) async -> Void

struct AgentTranscriptSegmentView: View {
  let message: AgentRenderableMessage
  let segment: AgentRenderableSegment
  let isStreaming: Bool
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  var body: some View {
    switch segment {
    case let .toolGroup(group):
      AgentToolGroupView(
        group: group,
        isStreaming: isStreaming,
        resolvingApprovalIDs: resolvingApprovalIDs,
        onResolveApproval: onResolveApproval
      )
    case let .contentGroup(group):
      AgentContentGroupView(
        group: group,
        style: message.style,
        isStreaming: isStreaming,
        resolvingApprovalIDs: resolvingApprovalIDs,
        onResolveApproval: onResolveApproval
      )
    }
  }
}

private struct AgentContentGroupView: View {
  @Environment(\.appTheme) private var theme

  let group: AgentRenderableContentGroup
  let style: AgentRenderableMessageStyle
  let isStreaming: Bool
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  private var showsBullet: Bool {
    style == .assistant && !group.compact && !group.isThinkingOnly
  }

  var body: some View {
    if showsBullet {
      HStack(alignment: .top, spacing: 8) {
        Text("•")
          .font(.system(size: 18, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.6))
          .padding(.top, -1)

        content
      }
    } else {
      content
    }
  }

  private var content: some View {
    VStack(alignment: .leading, spacing: group.compact ? 4 : 8) {
      ForEach(Array(group.parts.enumerated()), id: \.element.id) { index, part in
        AgentTranscriptPartView(
          part: part,
          isStreaming: isStreaming && index == group.parts.count - 1,
          resolvingApprovalIDs: resolvingApprovalIDs,
          onResolveApproval: onResolveApproval
        )
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct AgentToolGroupView: View {
  @Environment(\.appTheme) private var theme
  @State private var isExpanded = false

  let group: AgentRenderableToolGroup
  let isStreaming: Bool
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  var body: some View {
    if group.isCollapsible, let summary = group.summary {
      VStack(alignment: .leading, spacing: 4) {
        Button {
          isExpanded.toggle()
        } label: {
          HStack(spacing: 6) {
            Image(systemName: "chevron.right")
              .font(.system(size: 10, weight: .semibold))
              .rotationEffect(.degrees(isExpanded ? 90 : 0))
            Text(verbatim: summaryText(summary))
              .font(.system(size: 12, weight: .medium, design: .monospaced))
          }
          .foregroundStyle(theme.mutedColor)
        }
        .buttonStyle(.plain)

        if isExpanded {
          VStack(alignment: .leading, spacing: 4) {
            ForEach(group.parts) { part in
              AgentTranscriptPartView(
                part: part,
                isStreaming: isStreaming,
                resolvingApprovalIDs: resolvingApprovalIDs,
                onResolveApproval: onResolveApproval
              )
            }
          }
          .padding(.leading, 18)
        }
      }
    } else {
      VStack(alignment: .leading, spacing: 4) {
        ForEach(group.parts) { part in
          AgentTranscriptPartView(
            part: part,
            isStreaming: isStreaming,
            resolvingApprovalIDs: resolvingApprovalIDs,
            onResolveApproval: onResolveApproval
          )
        }
      }
    }
  }

  private func summaryText(_ summary: String) -> String {
    guard isStreaming else {
      return summary
    }

    return summary
      .replacingOccurrences(of: "Searched", with: "Searching")
      .replacingOccurrences(of: "Read", with: "Reading")
      .replacingOccurrences(of: "Edited", with: "Editing")
      .replacingOccurrences(of: "Wrote", with: "Writing")
      .replacingOccurrences(of: "Deleted", with: "Deleting")
      .replacingOccurrences(of: "Ran", with: "Running")
      .replacingOccurrences(of: "Delegated", with: "Delegating")
  }
}

private struct AgentTranscriptPartView: View {
  let part: AgentRenderablePart
  let isStreaming: Bool
  let resolvingApprovalIDs: Set<String>
  let onResolveApproval: AgentApprovalResolver

  var body: some View {
    switch part {
    case let .text(model):
      AgentTextPartView(text: model.text)
    case let .thinking(model):
      AgentThinkingPartView(text: model.text, isStreaming: isStreaming)
    case let .status(model):
      AgentStatusPartView(text: model.text)
    case let .toolCall(model):
      AgentToolCallPartView(part: model)
    case .toolResult:
      EmptyView()
    case let .approval(model):
      AgentApprovalPartView(
        part: model,
        isResolving: resolvingApprovalIDs.contains(model.approvalID),
        onResolveApproval: onResolveApproval
      )
    case let .attachment(model):
      AgentInlineMetaPartView(title: model.title, text: model.text)
    case let .artifact(model):
      AgentInlineMetaPartView(title: model.title, text: model.text)
    case let .image(model):
      AgentImagePartView(part: model)
    case let .unknown(model):
      AgentInlineMetaPartView(title: model.title, text: model.text)
    }
  }
}

private struct AgentTextPartView: View {
  @Environment(\.appTheme) private var theme

  let text: String

  var body: some View {
    if !text.isEmpty {
      Text(verbatim: text)
        .font(.system(size: 13, weight: .medium, design: .monospaced))
        .lineSpacing(5)
        .foregroundStyle(theme.primaryTextColor)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct AgentThinkingPartView: View {
  @Environment(\.appTheme) private var theme
  @State private var isExpanded = false
  @State private var startDate = Date()

  let text: String
  let isStreaming: Bool

  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      VStack(alignment: .leading, spacing: 4) {
        Button {
          isExpanded.toggle()
        } label: {
          HStack(spacing: 6) {
            Image(systemName: "chevron.right")
              .font(.system(size: 10, weight: .semibold))
              .rotationEffect(.degrees(isExpanded ? 90 : 0))
            Text(verbatim: label(for: context.date))
              .font(.system(size: 12, weight: .medium, design: .monospaced))
          }
          .foregroundStyle(theme.mutedColor)
        }
        .buttonStyle(.plain)

        if isExpanded {
          Text(verbatim: text)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.leading, 14)
            .overlay(alignment: .leading) {
              Rectangle()
                .fill(theme.borderColor)
                .frame(width: 2)
            }
        }
      }
      .onAppear {
        if isStreaming {
          startDate = context.date
        }
      }
    }
  }

  private func label(for currentDate: Date) -> String {
    let elapsed = max(1, Int(currentDate.timeIntervalSince(startDate)))
    if isStreaming {
      return elapsed > 0 ? "Thinking \(elapsed)s" : "Thinking"
    }
    return "Thought for \(elapsed)s"
  }
}

private struct AgentStatusPartView: View {
  @Environment(\.appTheme) private var theme

  let text: String

  var body: some View {
    Text(verbatim: text)
      .font(.system(size: 11, weight: .medium, design: .monospaced))
      .foregroundStyle(theme.mutedColor)
      .textSelection(.enabled)
  }
}

private struct AgentToolCallPartView: View {
  @Environment(\.appTheme) private var theme
  @State private var isExpanded: Bool

  let part: AgentRenderableToolCallPart

  init(part: AgentRenderableToolCallPart) {
    self.part = part
    let expansion = AgentToolCallDisplayModel(toolName: part.toolName, inputJSON: part.inputText, outputJSON: part.outputText)
    _isExpanded = State(initialValue: expansion.hasToolDiff || expansion.commandOutput != nil)
  }

  var body: some View {
    let display = AgentToolCallDisplayModel(
      toolName: part.toolName,
      inputJSON: part.inputText,
      outputJSON: part.outputText
    )
    let canExpand = display.isExpandable
    let isCompleted = part.status == "completed" || part.status == "failed" || part.status == "cancelled"

    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        if hasFailed {
          Circle()
            .fill(theme.errorColor)
            .frame(width: 6, height: 6)
        } else if canExpand {
          Button {
            isExpanded.toggle()
          } label: {
            Image(systemName: "chevron.right")
              .font(.system(size: 10, weight: .semibold))
              .rotationEffect(.degrees(isExpanded ? 90 : 0))
              .foregroundStyle(theme.mutedColor)
          }
          .buttonStyle(.plain)
        } else {
          Color.clear
            .frame(width: 10, height: 10)
        }

        HStack(spacing: 0) {
          if canExpand {
            Button {
              isExpanded.toggle()
            } label: {
              toolLabel(display: display)
            }
            .buttonStyle(.plain)
          } else {
            toolLabel(display: display)
          }
        }
      }

      if isExpanded, display.hasToolDiff, let summary = display.diffSummary {
        HStack(spacing: 4) {
          Text("└")
          Text(verbatim: summary)
        }
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor.opacity(0.65))
        .padding(.leading, 18)
      }

      if isExpanded, let diff = display.toolDiff {
        AgentOutputBlock(text: diff)
      }

      if isExpanded, let prompt = display.agentPrompt, !prompt.isEmpty {
        Text(verbatim: prompt)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
          .padding(.leading, 18)
          .overlay(alignment: .leading) {
            Rectangle()
              .fill(theme.borderColor)
              .frame(width: 2)
          }
      }

      if isExpanded, let commandOutput = display.commandOutput, !commandOutput.isEmpty {
        VStack(alignment: .leading, spacing: 0) {
          HStack {
            Text("Output")
            Spacer(minLength: 0)
            if let exitCode = display.commandExitCode {
              Text("exit \(exitCode)")
            }
          }
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor)
          .padding(.horizontal, 12)
          .padding(.vertical, 6)

          AgentOutputBlock(text: commandOutput, addTopBorder: true)
        }
        .background(theme.surfaceRaised.opacity(0.35))
        .overlay {
          RoundedRectangle(cornerRadius: 0, style: .continuous)
            .strokeBorder(theme.borderColor.opacity(0.7))
        }
        .padding(.leading, 18)
      }
    }
    .opacity(isCompleted ? 0.5 : 1)
  }

  private var hasFailed: Bool {
    (part.status?.lowercased() == "failed") || !(part.errorText ?? "").isEmpty
  }

  @ViewBuilder
  private func toolLabel(display: AgentToolCallDisplayModel) -> some View {
    HStack(spacing: 0) {
      Text(verbatim: display.verb)
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)

      if let subject = display.subject, !subject.isEmpty {
        Text(verbatim: "(")
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.6))
        Text(verbatim: subject)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor)
        Text(verbatim: ")")
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.6))
      }
    }
  }
}

private struct AgentApprovalPartView: View {
  @Environment(\.appTheme) private var theme

  let part: AgentRenderableApprovalPart
  let isResolving: Bool
  let onResolveApproval: AgentApprovalResolver

  private var isPending: Bool {
    let status = part.status?.lowercased() ?? "pending"
    return status == "pending" || status == "requested" || status == "waiting"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let message = part.message, !message.isEmpty {
        Text(verbatim: message)
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.primaryTextColor)
          .fixedSize(horizontal: false, vertical: true)
      }

      HStack(spacing: 8) {
        Text(verbatim: part.status ?? "pending")
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(isPending ? theme.warningColor : theme.successColor)

        if let decision = part.decision, !decision.isEmpty {
          Text(verbatim: "decision: \(decision)")
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
        }
      }

      if isPending {
        HStack(spacing: 8) {
          ForEach(BridgeAgentApprovalDecision.allCases) { decision in
            Button {
              Task {
                await onResolveApproval(part.approvalID, decision)
              }
            } label: {
              Text(shortApprovalLabel(decision))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(decision == .reject ? theme.errorColor : theme.primaryTextColor)
            }
            .buttonStyle(.plain)
            .disabled(isResolving)
          }
        }
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(theme.surfaceRaised.opacity(0.4))
    .overlay {
      RoundedRectangle(cornerRadius: 0, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.7))
    }
  }

  private func shortApprovalLabel(_ decision: BridgeAgentApprovalDecision) -> String {
    switch decision {
    case .approveOnce:
      "Continue"
    case .approveSession:
      "Session"
    case .reject:
      "Reject"
    }
  }
}

private struct AgentInlineMetaPartView: View {
  @Environment(\.appTheme) private var theme

  let title: String
  let text: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: title.uppercased())
        .font(.system(size: 10, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor.opacity(0.78))
      Text(verbatim: text)
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}

private struct AgentImagePartView: View {
  @Environment(\.appTheme) private var theme

  let part: AgentRenderableImagePart

  var body: some View {
    if let image = decodedImage {
      Image(nsImage: image)
        .resizable()
        .aspectRatio(contentMode: .fit)
        .frame(maxWidth: 320, maxHeight: 220, alignment: .leading)
        .overlay {
          RoundedRectangle(cornerRadius: 0, style: .continuous)
            .strokeBorder(theme.borderColor.opacity(0.7))
        }
    }
  }

  private var decodedImage: NSImage? {
    guard let data = Data(base64Encoded: part.base64Data, options: [.ignoreUnknownCharacters]) else {
      return nil
    }

    return NSImage(data: data)
  }
}

private struct AgentOutputBlock: View {
  @Environment(\.appTheme) private var theme

  let text: String
  var addTopBorder = false

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      Text(verbatim: text)
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .textSelection(.enabled)
        .fixedSize()
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
    .background(theme.surfaceRaised.opacity(0.35))
    .overlay(alignment: .top) {
      if addTopBorder {
        Rectangle()
          .fill(theme.borderColor.opacity(0.7))
          .frame(height: 1)
      }
    }
    .overlay {
      RoundedRectangle(cornerRadius: 0, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.7))
    }
    .padding(.leading, 18)
  }
}

private struct AgentToolCallDisplayModel {
  let verb: String
  let subject: String?
  let diffSummary: String?
  let toolDiff: String?
  let agentPrompt: String?
  let commandOutput: String?
  let commandExitCode: Int?

  var hasToolDiff: Bool { toolDiff != nil }
  var isExpandable: Bool { toolDiff != nil || agentPrompt != nil || commandOutput != nil }

  init(toolName: String, inputJSON: String?, outputJSON: String?) {
    let input = AgentToolCallDisplayModel.parseJSONObject(inputJSON)
    let filePath = AgentToolCallDisplayModel.stringValue(["file_path", "filePath"], in: input)
    let shortPath = filePath?.split(separator: "/").last.map(String.init)

    switch toolName {
    case "Edit":
      verb = "Update"
      subject = shortPath
      diffSummary = AgentToolCallDisplayModel.diffSummary(for: inputJSON)
    case "Write":
      verb = "Write"
      subject = shortPath
      diffSummary = nil
    case "Read":
      let offset = AgentToolCallDisplayModel.intValue("offset", in: input) ?? 0
      let limit = AgentToolCallDisplayModel.intValue("limit", in: input)
      let start = max(offset, 1)
      if let shortPath {
        if let limit {
          subject = "\(shortPath):\(start)-\(start + limit - 1)"
        } else {
          subject = shortPath
        }
      } else {
        subject = nil
      }
      verb = "Read"
      diffSummary = nil
    case "Delete", "DeleteFile":
      verb = "Delete"
      subject = shortPath
      diffSummary = nil
    case "Glob", "Grep":
      verb = "Search"
      if let pattern = AgentToolCallDisplayModel.stringValue(["pattern"], in: input) {
        subject = AgentToolCallDisplayModel.cleanSearchPattern(pattern)
      } else {
        subject = nil
      }
      diffSummary = nil
    case "ToolSearch", "WebSearch":
      verb = "Search"
      if let query = AgentToolCallDisplayModel.stringValue(["query"], in: input) {
        subject = query.count > 60 ? "\(query.prefix(57))..." : query
      } else {
        subject = nil
      }
      diffSummary = nil
    case "WebFetch":
      verb = "Fetch"
      if let url = AgentToolCallDisplayModel.stringValue(["url"], in: input) {
        let trimmed = url.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: "")
        subject = trimmed.count > 60 ? "\(trimmed.prefix(57))..." : trimmed
      } else {
        subject = nil
      }
      diffSummary = nil
    case "Bash", "command_execution":
      verb = "Shell"
      if let command = AgentToolCallDisplayModel.stringValue(["command"], in: input) {
        subject = command.count > 60 ? "\(command.prefix(57))..." : command
      } else {
        subject = nil
      }
      diffSummary = nil
    case "Agent":
      verb = "Agent"
      subject = AgentToolCallDisplayModel.stringValue(["description", "subagent_type"], in: input)
      diffSummary = nil
    case "file_change":
      verb = "File change"
      subject = AgentToolCallDisplayModel.fileChangeSummary(from: input)
      diffSummary = nil
    default:
      verb = AgentToolCallDisplayModel.formatToolName(toolName)
      subject = nil
      diffSummary = nil
    }

    toolDiff = AgentToolCallDisplayModel.toolDiff(from: inputJSON)
    agentPrompt = toolName == "Agent" ? AgentToolCallDisplayModel.stringValue(["prompt"], in: input) : nil
    let commandExecution = toolName == "command_execution" ? AgentToolCallDisplayModel.parseCommandExecutionOutput(outputJSON) : nil
    commandOutput = commandExecution?.output
    commandExitCode = commandExecution?.exitCode
  }

  private static func parseJSONObject(_ json: String?) -> [String: Any] {
    guard let json,
          let data = json.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      return [:]
    }

    return object
  }

  private static func stringValue(_ keys: [String], in object: [String: Any]) -> String? {
    for key in keys {
      if let value = object[key] as? String, !value.isEmpty {
        return value
      }
    }
    return nil
  }

  private static func intValue(_ key: String, in object: [String: Any]) -> Int? {
    if let value = object[key] as? Int {
      return value
    }
    if let value = object[key] as? Double {
      return Int(value)
    }
    return nil
  }

  private static func formatToolName(_ toolName: String) -> String {
    switch toolName {
    case "command_execution":
      "Shell"
    case "file_change":
      "File change"
    case "web_search":
      "Web search"
    default:
      toolName.contains("_") ? toolName.replacingOccurrences(of: "_", with: " ") : toolName
    }
  }

  private static func cleanSearchPattern(_ pattern: String) -> String {
    let cleaned = pattern
      .replacingOccurrences(of: ".*", with: " ")
      .replacingOccurrences(of: "|", with: " ")
      .replacingOccurrences(
        of: #"[\\\^\$\(\)\[\]\{\}\+\?]"#,
        with: "",
        options: .regularExpression
      )
      .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
      .trimmingCharacters(in: .whitespacesAndNewlines)

    if cleaned.count > 40 {
      return "\(cleaned.prefix(37))..."
    }
    return cleaned.isEmpty ? String(pattern.prefix(40)) : cleaned
  }

  private static func diffSummary(for inputJSON: String?) -> String? {
    let input = parseJSONObject(inputJSON)
    let oldString = (input["old_string"] as? String) ?? ""
    let newString = (input["new_string"] as? String) ?? ""
    if oldString.isEmpty && newString.isEmpty {
      return nil
    }

    let oldLines = oldString.split(separator: "\n", omittingEmptySubsequences: false).count
    let newLines = newString.split(separator: "\n", omittingEmptySubsequences: false).count
    let delta = newLines - oldLines
    if delta > 0 {
      return "Added \(delta) line\(delta == 1 ? "" : "s")"
    }
    if delta < 0 {
      let removed = abs(delta)
      return "Removed \(removed) line\(removed == 1 ? "" : "s")"
    }
    return "Changed \(oldLines) line\(oldLines == 1 ? "" : "s")"
  }

  private static func toolDiff(from inputJSON: String?) -> String? {
    let input = parseJSONObject(inputJSON)
    if let diff = input["diff"] as? String, !diff.isEmpty {
      return diff
    }
    if let unifiedDiff = input["unified_diff"] as? String, !unifiedDiff.isEmpty {
      return unifiedDiff
    }
    if let changes = input["changes"] as? [[String: Any]] {
      let joined = changes.compactMap { $0["diff"] as? String }.joined(separator: "\n")
      if !joined.isEmpty {
        return joined
      }
    }
    return nil
  }

  private static func fileChangeSummary(from input: [String: Any]) -> String? {
    guard let changes = input["changes"] as? [[String: Any]], !changes.isEmpty else {
      return nil
    }

    if changes.count == 1,
       let kind = changes[0]["kind"] as? String,
       let path = changes[0]["path"] as? String
    {
      return "\(kind) \(path.split(separator: "/").last.map(String.init) ?? path)"
    }

    return "\(changes.count) files"
  }

  private static func parseCommandExecutionOutput(_ outputJSON: String?) -> (exitCode: Int?, output: String?)? {
    let object = parseJSONObject(outputJSON)
    if object.isEmpty {
      return nil
    }

    let stdout = (object["stdout"] as? String) ?? ""
    let stderr = (object["stderr"] as? String) ?? ""
    let mergedOutput =
      if let output = object["output"] as? String, !output.isEmpty {
        output
      } else if stdout.isEmpty {
        stderr.isEmpty ? nil : stderr
      } else if stderr.isEmpty {
        stdout
      } else {
        "\(stdout)\n\(stderr)"
      }

    let exitCode = object["exitCode"] as? Int ?? (object["exitCode"] as? Double).map(Int.init)
    return (exitCode: exitCode, output: mergedOutput)
  }
}
