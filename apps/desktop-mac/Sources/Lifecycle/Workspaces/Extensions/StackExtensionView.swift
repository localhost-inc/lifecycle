import AppKit
import LifecyclePresentation
import SwiftUI

private let stackExtensionANSIControlSequencePattern = try! NSRegularExpression(
  pattern: "\u{001B}\\[[0-?]*[ -/]*[@-~]"
)
private let stackExtensionANSIOperatingSystemCommandPattern = try! NSRegularExpression(
  pattern: "\u{001B}\\].*?(?:\u{0007}|\u{001B}\\\\)",
  options: [.dotMatchesLineSeparators]
)
private let stackExtensionPanelHorizontalPadding: CGFloat = 8

func stackExtensionServiceNodes(from summary: BridgeWorkspaceStackSummary?) -> [BridgeStackNode] {
  summary?.nodes.filter(\.isManagedNode) ?? []
}

func stackExtensionTaskNodes(from summary: BridgeWorkspaceStackSummary?) -> [BridgeStackNode] {
  summary?.nodes.filter { $0.kind == "task" } ?? []
}

struct StackExtensionEmptyStateContent: Equatable {
  let symbolName: String
  let title: String
  let description: String
  let tone: WorkspaceExtensionEmptyStateTone
  let details: [String]
}

func stackExtensionEmptyStateContent(
  summary: BridgeWorkspaceStackSummary?
) -> StackExtensionEmptyStateContent? {
  guard let summary else {
    return nil
  }

  switch summary.state {
  case "missing":
    return StackExtensionEmptyStateContent(
      symbolName: "shippingbox.circle.fill",
      title: "No lifecycle.json",
      description: "No lifecycle.json found for this workspace.",
      tone: .warning,
      details: []
    )
  case "unconfigured":
    return StackExtensionEmptyStateContent(
      symbolName: "shippingbox.circle",
      title: "No stack configured",
      description: "No stack configured for this workspace.",
      tone: .neutral,
      details: []
    )
  case "invalid":
    return StackExtensionEmptyStateContent(
      symbolName: "exclamationmark.triangle.fill",
      title: "Stack config is invalid",
      description: "Lifecycle couldn't parse this workspace's stack configuration. Fix lifecycle.json and reload the workspace.",
      tone: .error,
      details: summary.errors
    )
  default:
    return nil
  }
}

func stackExtensionSummarySubtitle(summary: BridgeWorkspaceStackSummary?) -> String {
  if let emptyState = stackExtensionEmptyStateContent(summary: summary) {
    return emptyState.description
  }

  guard let summary else {
    return "Loading stack summary from the bridge..."
  }

  let serviceCount = stackExtensionServiceNodes(from: summary).count
  let taskCount = stackExtensionTaskNodes(from: summary).count
  var parts: [String] = []

  if serviceCount > 0 {
    parts.append("\(serviceCount) service\(serviceCount == 1 ? "" : "s")")
  }

  if taskCount > 0 {
    parts.append("\(taskCount) task\(taskCount == 1 ? "" : "s")")
  }

  return parts.isEmpty ? "No services or tasks declared." : parts.joined(separator: ", ")
}

func stackExtensionServiceMetadata(_ node: BridgeStackNode) -> String? {
  var parts: [String] = []

  if let assignedPort = node.assignedPort {
    parts.append(":\(assignedPort)")
  }

  if !node.dependsOn.isEmpty {
    parts.append("depends on \(node.dependsOn.joined(separator: ", "))")
  }

  return parts.isEmpty ? nil : parts.joined(separator: "  ")
}

func stackExtensionTaskMetadata(_ node: BridgeStackNode) -> String {
  var parts: [String] = []

  if let runOn = node.runOn {
    parts.append("run_on \(runOn)")
  }

  if !node.dependsOn.isEmpty {
    parts.append("depends on \(node.dependsOn.joined(separator: ", "))")
  }

  parts.append("write_files \(node.writeFilesCount ?? 0)")
  return parts.joined(separator: "  ")
}

func stackExtensionServiceStatusLabel(
  _ node: BridgeStackNode,
  phase: StackServicePhase?
) -> String {
  switch phase {
  case .stopping:
    return "stopping"
  case nil:
    return (node.status ?? "stopped").lowercased()
  }
}

func stackExtensionSanitizedLogText(_ text: String) -> String {
  let withoutOperatingSystemCommands =
    stackExtensionANSIOperatingSystemCommandPattern.stringByReplacingMatches(
      in: text,
      range: NSRange(text.startIndex..., in: text),
      withTemplate: ""
    )

  let withoutControlSequences =
    stackExtensionANSIControlSequencePattern.stringByReplacingMatches(
      in: withoutOperatingSystemCommands,
      range: NSRange(withoutOperatingSystemCommands.startIndex..., in: withoutOperatingSystemCommands),
      withTemplate: ""
    )

  return withoutControlSequences.replacingOccurrences(of: "\r", with: "")
}

func stackExtensionLogPlainText(_ lines: [BridgeWorkspaceLogLine]) -> String {
  lines
    .map { stackExtensionSanitizedLogText($0.text) }
    .joined(separator: "\n")
}

private func stackExtensionLogAttributedString(
  _ lines: [BridgeWorkspaceLogLine],
  theme: AppTheme
) -> NSAttributedString {
  let result = NSMutableAttributedString()
  let paragraphStyle = NSMutableParagraphStyle()
  paragraphStyle.lineBreakMode = .byClipping
  paragraphStyle.lineHeightMultiple = 1.08
  let font = AppTypography.nsFont(size: 11, weight: .medium, role: .mono)

  for (index, line) in lines.enumerated() {
    let sanitizedText = stackExtensionSanitizedLogText(line.text)
    let color =
      line.stream == "stderr"
        ? NSColor(themeHex: theme.statusDanger, alpha: 0.92)
        : NSColor(themeHex: theme.foreground.primaryHex, alpha: 0.88)

    result.append(
      NSAttributedString(
        string: sanitizedText,
        attributes: [
          .font: font,
          .foregroundColor: color,
          .paragraphStyle: paragraphStyle,
        ]
      )
    )

    if index < lines.count - 1 {
      result.append(
        NSAttributedString(
          string: "\n",
          attributes: [
            .font: font,
            .foregroundColor: NSColor(themeHex: theme.foreground.primaryHex, alpha: 0.88),
            .paragraphStyle: paragraphStyle,
          ]
        )
      )
    }
  }

  return result
}

private enum StackServiceLogState {
  case idle
  case loading
  case loaded([BridgeWorkspaceLogLine])
  case failed(String)
}

private enum StackExtensionMode: CaseIterable, Hashable {
  case logs
  case nodes

  var label: String {
    switch self {
    case .logs:
      return "Logs"
    case .nodes:
      return "Nodes"
    }
  }
}

private struct StackExtensionModeSegmentedControl: View {
  @Environment(\.appTheme) private var theme
  @Namespace private var selectedSegmentNamespace

  let selection: StackExtensionMode
  let onSelect: (StackExtensionMode) -> Void

  private var railBackground: Color {
    theme.background.chrome
  }

  private var selectedPillBackground: Color {
    theme.background.surface
  }

  var body: some View {
    HStack(spacing: 2) {
      ForEach(StackExtensionMode.allCases, id: \.self) { mode in
        segment(mode)
      }
    }
    .padding(3)
    .frame(maxWidth: .infinity)
    .background(
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .fill(railBackground)
    )
    .overlay {
      RoundedRectangle(cornerRadius: 12, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.6), lineWidth: 1)
    }
  }

  private func segment(_ mode: StackExtensionMode) -> some View {
    let isSelected = selection == mode

    return Button {
      if !isSelected {
        onSelect(mode)
      }
    } label: {
      Text(mode.label)
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(isSelected ? theme.foreground.primary : theme.foreground.muted)
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: 28)
        .background {
          if isSelected {
            RoundedRectangle(cornerRadius: 9, style: .continuous)
              .fill(selectedPillBackground)
              .matchedGeometryEffect(id: "stack-extension-mode-segment", in: selectedSegmentNamespace)
          }
        }
        .contentShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity)
    .lcPointerCursor()
  }
}

struct StackExtensionView: View {
  @Environment(\.appTheme) private var theme

  let context: WorkspaceExtensionContext

  @State private var expandedServiceID: String?
  @State private var isTasksExpanded = false
  @State private var selectedMode: StackExtensionMode = .logs
  @State private var selectedLogServiceName: String?
  @State private var logState: StackServiceLogState = .idle
  @State private var serviceLogStates: [String: StackServiceLogState] = [:]

  var body: some View {
    let serviceNodes = stackExtensionServiceNodes(from: context.stackSummary)
    let taskNodes = stackExtensionTaskNodes(from: context.stackSummary)
    let emptyState = stackExtensionEmptyStateContent(summary: context.stackSummary)

    Group {
      if let emptyState {
        WorkspaceExtensionEmptyStateView(
          symbolName: emptyState.symbolName,
          title: emptyState.title,
          description: emptyState.description,
          tone: emptyState.tone,
          details: emptyState.details
        )
      } else {
        VStack(alignment: .leading, spacing: 0) {
          modeBar
            .padding(.horizontal, stackExtensionPanelHorizontalPadding)
            .padding(.top, 12)
            .padding(.bottom, selectedMode == .logs ? 8 : 10)

          if selectedMode == .logs {
            logsPanel(serviceNodes: serviceNodes)
          } else {
            nodesPanel(serviceNodes: serviceNodes, taskNodes: taskNodes)
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .onChange(of: context.workspace.id) { _ in
      resetExpandedState()
    }
    .onChange(of: stackExtensionServiceNodes(from: context.stackSummary).map(\.id)) { serviceIDs in
      guard let expandedServiceID, !serviceIDs.contains(expandedServiceID) else {
        return
      }
      self.expandedServiceID = nil
    }
    .onChange(of: context.stackSummary?.nodes.map(\.id) ?? []) { _ in
      reconcileSelectedLogService(serviceNodes)
      loadSelectedLogs()
    }
    .onChange(of: selectedLogServiceName) { _ in
      loadSelectedLogs()
    }
    .onAppear {
      reconcileSelectedLogService(serviceNodes)
      loadSelectedLogs()
    }
  }

  @ViewBuilder
  private var modeBar: some View {
    HStack(spacing: 0) {
      StackExtensionModeSegmentedControl(selection: selectedMode) { mode in
        selectedMode = mode
        if mode == .logs {
          loadSelectedLogs()
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func logFilterPill(_ title: String, serviceName: String?) -> some View {
    Button {
      selectedLogServiceName = serviceName
    } label: {
      Text(title)
        .font(.lc(size: 10, weight: .medium, design: .monospaced))
        .foregroundStyle(
          selectedLogServiceName == serviceName ? theme.primaryTextColor : theme.mutedColor
        )
        .padding(.horizontal, 8)
        .frame(height: 22)
        .background(
          Capsule()
            .fill(selectedLogServiceName == serviceName ? theme.surfaceRaised : Color.clear)
        )
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
  }

  @ViewBuilder
  private func logsPanel(serviceNodes: [BridgeStackNode]) -> some View {
    ZStack(alignment: .bottomTrailing) {
      if serviceNodes.isEmpty {
        logPlaceholder("No services configured.", color: theme.mutedColor)
      } else {
        switch logState {
        case .idle, .loading:
          logPlaceholder("Loading logs…", color: theme.mutedColor)
        case let .failed(message):
          logPlaceholder(message, color: theme.errorColor)
        case let .loaded(lines):
          if lines.isEmpty {
            logPlaceholder("No log lines yet.", color: theme.mutedColor)
          } else {
            StackExtensionLogTextView(lines: lines, theme: theme)
              .frame(maxWidth: .infinity, maxHeight: .infinity)
          }
        }
      }

      if !serviceNodes.isEmpty {
        logFilterGlass(serviceNodes: serviceNodes)
          .padding(8)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func logFilterGlass(serviceNodes: [BridgeStackNode]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 4) {
        logFilterPill("All", serviceName: nil)
        ForEach(serviceNodes) { node in
          logFilterPill(node.name, serviceName: node.name)
        }
      }
    }
    .padding(4)
    .fixedSize(horizontal: true, vertical: false)
    .background(.ultraThinMaterial, in: Capsule())
    .overlay {
      Capsule()
        .strokeBorder(theme.borderColor.opacity(0.42), lineWidth: 1)
    }
    .shadow(color: .black.opacity(0.22), radius: 12, x: 0, y: 6)
  }

  private func nodesPanel(
    serviceNodes: [BridgeStackNode],
    taskNodes: [BridgeStackNode]
  ) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if !serviceNodes.isEmpty {
          nodeServiceList(serviceNodes)
        }

        if !taskNodes.isEmpty {
          if !serviceNodes.isEmpty {
            divider
              .padding(.top, 10)
          }

          taskSection(taskNodes)
            .padding(.top, serviceNodes.isEmpty ? 0 : 10)
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .scrollIndicators(.automatic)
  }

  @ViewBuilder
  private func taskSection(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Button {
        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
          isTasksExpanded.toggle()
        }
      } label: {
        HStack(spacing: 8) {
          Image(systemName: "chevron.right")
            .font(.lc(size: 10, weight: .semibold))
            .foregroundStyle(theme.mutedColor.opacity(0.8))
            .rotationEffect(.degrees(isTasksExpanded ? 90 : 0))

          Text("TASKS")
            .font(.lc(size: 10, weight: .bold, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.76))

          Spacer(minLength: 0)

          Text("\(nodes.count)")
            .font(.lc(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.72))
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()

      if isTasksExpanded {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
            taskRow(node)

            if index < nodes.count - 1 {
              divider
            }
          }
        }
        .padding(.top, 4)
      }
    }
  }

  private func serviceList(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
        VStack(alignment: .leading, spacing: 0) {
          Button {
            toggleService(node)
          } label: {
            serviceRow(node, isExpanded: expandedServiceID == node.id)
          }
          .buttonStyle(.plain)
          .lcPointerCursor()
          .help(serviceHelpText(for: node))

          if expandedServiceID == node.id {
            serviceLogPanel(for: node)
          }

          if index < nodes.count - 1 {
            divider
          }
        }
      }
    }
  }

  private func nodeServiceList(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(Array(nodes.enumerated()), id: \.element.id) { index, node in
        serviceNodeRow(node)

        if index < nodes.count - 1 {
          divider
        }
      }
    }
  }

  private func serviceNodeRow(_ node: BridgeStackNode) -> some View {
    let phase = context.model.stackServicePhase(for: context.workspace.id, serviceName: node.name)
    let statusLabel = stackExtensionServiceStatusLabel(node, phase: phase)

    return HStack(spacing: 10) {
      Circle()
        .fill(stateColor(statusLabel))
        .frame(width: 6, height: 6)

      Text(node.name)
        .font(.lc(size: 12, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)

      if let metadata = stackExtensionServiceMetadata(node) {
        Text(metadata)
          .font(.lc(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.82))
          .lineLimit(1)
          .truncationMode(.tail)
      }

      Spacer(minLength: 12)

      Text(statusLabel)
        .font(.lc(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(stateColor(statusLabel))
        .lineLimit(1)
    }
    .padding(.horizontal, stackExtensionPanelHorizontalPadding)
    .padding(.vertical, 11)
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
    .help(serviceHelpText(for: node))
  }

  private func serviceRow(_ node: BridgeStackNode, isExpanded: Bool) -> some View {
    let phase = context.model.stackServicePhase(for: context.workspace.id, serviceName: node.name)
    let statusLabel = stackExtensionServiceStatusLabel(node, phase: phase)

    return HStack(spacing: 10) {
      Image(systemName: "chevron.right")
        .font(.lc(size: 10, weight: .semibold))
        .foregroundStyle(theme.mutedColor.opacity(0.8))
        .rotationEffect(.degrees(isExpanded ? 90 : 0))

      Circle()
        .fill(stateColor(statusLabel))
        .frame(width: 6, height: 6)

      Text(node.name)
        .font(.lc(size: 12, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)

      if let metadata = stackExtensionServiceMetadata(node) {
        Text(metadata)
          .font(.lc(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.82))
          .lineLimit(1)
          .truncationMode(.tail)
      }

      Spacer(minLength: 12)

      Text(statusLabel)
        .font(.lc(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(stateColor(statusLabel))
        .lineLimit(1)
    }
    .padding(.horizontal, stackExtensionPanelHorizontalPadding)
    .padding(.vertical, 11)
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
  }

  @ViewBuilder
  private func serviceLogPanel(for node: BridgeStackNode) -> some View {
    switch serviceLogStates[node.id] ?? .idle {
    case .idle, .loading:
      logPlaceholder("Loading logs…", color: theme.mutedColor)
    case let .failed(message):
      logPlaceholder(message, color: theme.errorColor)
    case let .loaded(lines):
      if lines.isEmpty {
        logPlaceholder("No log lines yet.", color: theme.mutedColor)
      } else {
        StackExtensionLogTextView(lines: lines, theme: theme)
        .frame(minHeight: 110, idealHeight: 160, maxHeight: 220)
        .overlay(alignment: .top) {
          Rectangle()
            .fill(theme.borderColor.opacity(0.2))
            .frame(height: 1)
        }
      }
    }
  }

  private func logPlaceholder(_ text: String, color: Color) -> some View {
    Text(text)
      .font(.lc(size: 11, weight: .medium, design: .monospaced))
      .foregroundStyle(color)
      .padding(.horizontal, stackExtensionPanelHorizontalPadding)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity, minHeight: 96, alignment: .topLeading)
      .background(theme.shellBackground)
      .overlay(alignment: .top) {
        Rectangle()
          .fill(theme.borderColor.opacity(0.2))
          .frame(height: 1)
      }
  }

  private func taskRow(_ node: BridgeStackNode) -> some View {
    HStack(spacing: 10) {
      Image(systemName: "bolt.horizontal")
        .font(.lc(size: 10, weight: .semibold))
        .foregroundStyle(theme.warningColor.opacity(0.9))

      Text(node.name)
        .font(.lc(size: 12, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .lineLimit(1)

      Text(stackExtensionTaskMetadata(node))
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor.opacity(0.82))
        .lineLimit(1)
        .truncationMode(.tail)

      Spacer(minLength: 0)
    }
    .padding(.horizontal, stackExtensionPanelHorizontalPadding)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
    .help(node.command ?? "")
  }

  private var divider: some View {
    Rectangle()
      .fill(theme.borderColor.opacity(0.35))
      .frame(height: 1)
  }

  private func toggleService(_ node: BridgeStackNode) {
    let nextExpandedID = expandedServiceID == node.id ? nil : node.id

    withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
      expandedServiceID = nextExpandedID
    }

    guard nextExpandedID == node.id else {
      return
    }

    Task { @MainActor in
      serviceLogStates[node.id] = .loading

      do {
        let lines = try await context.model.stackLogs(
          for: context.workspace.id,
          serviceName: node.name
        )
        serviceLogStates[node.id] = .loaded(lines)
      } catch {
        serviceLogStates[node.id] = .failed(error.localizedDescription)
      }
    }
  }

  private func resetExpandedState() {
    expandedServiceID = nil
    isTasksExpanded = false
    selectedLogServiceName = nil
    logState = .idle
    serviceLogStates = [:]
  }

  private func reconcileSelectedLogService(_ serviceNodes: [BridgeStackNode]) {
    guard let selectedLogServiceName else {
      return
    }

    if !serviceNodes.contains(where: { $0.name == selectedLogServiceName }) {
      self.selectedLogServiceName = nil
    }
  }

  private func loadSelectedLogs() {
    guard selectedMode == .logs else {
      return
    }

    Task { @MainActor in
      logState = .loading

      do {
        let lines = try await context.model.stackLogs(
          for: context.workspace.id,
          serviceName: selectedLogServiceName
        )
        logState = .loaded(lines)
      } catch {
        logState = .failed(error.localizedDescription)
      }
    }
  }

  private func serviceHelpText(for node: BridgeStackNode) -> String {
    var parts: [String] = []

    if let previewURL = node.previewURL {
      parts.append(previewURL)
    }

    if let statusReason = node.statusReason {
      parts.append(statusReason)
    }

    return parts.joined(separator: "\n")
  }

  private func stateColor(_ state: String) -> Color {
    switch state {
    case "ready":
      theme.successColor
    case "starting", "loading":
      theme.accentColor
    case "stopping":
      theme.warningColor
    case "invalid", "failed":
      theme.errorColor
    case "missing", "unconfigured":
      theme.warningColor
    default:
      theme.mutedColor
    }
  }
}

private struct StackExtensionLogTextView: NSViewRepresentable {
  let lines: [BridgeWorkspaceLogLine]
  let theme: AppTheme

  func makeNSView(context: Context) -> NSScrollView {
    let scrollView = NSScrollView()
    scrollView.borderType = .noBorder
    scrollView.autohidesScrollers = true
    scrollView.hasVerticalScroller = true
    scrollView.hasHorizontalScroller = true
    scrollView.drawsBackground = true

    let textView = NSTextView()
    textView.isEditable = false
    textView.isSelectable = true
    textView.isRichText = true
    textView.importsGraphics = false
    textView.allowsUndo = false
    textView.drawsBackground = true
    textView.textContainerInset = NSSize(width: 12, height: 10)
    textView.minSize = .zero
    textView.maxSize = NSSize(
      width: CGFloat.greatestFiniteMagnitude,
      height: CGFloat.greatestFiniteMagnitude
    )
    textView.isVerticallyResizable = true
    textView.isHorizontallyResizable = true

    if let textContainer = textView.textContainer {
      textContainer.widthTracksTextView = false
      textContainer.containerSize = NSSize(
        width: CGFloat.greatestFiniteMagnitude,
        height: CGFloat.greatestFiniteMagnitude
      )
      textContainer.lineBreakMode = .byClipping
      textContainer.lineFragmentPadding = 0
    }

    scrollView.documentView = textView
    return scrollView
  }

  func updateNSView(_ scrollView: NSScrollView, context: Context) {
    guard let textView = scrollView.documentView as? NSTextView else {
      return
    }

    let backgroundColor = NSColor(themeHex: theme.background.chromeHex)
    scrollView.backgroundColor = backgroundColor
    textView.backgroundColor = backgroundColor
    textView.insertionPointColor = NSColor.clear
    textView.textStorage?.setAttributedString(stackExtensionLogAttributedString(lines, theme: theme))
  }
}
