import LifecyclePresentation
import SwiftUI

let stackExtensionMinimumTableWidth: CGFloat = 400

func stackExtensionUsesCompactLayout(availableWidth: CGFloat) -> Bool {
  availableWidth < stackExtensionMinimumTableWidth
}

func stackExtensionServiceNodes(from summary: BridgeWorkspaceStackSummary?) -> [BridgeStackNode] {
  summary?.nodes.filter { $0.kind == "service" } ?? []
}

func stackExtensionTaskNodes(from summary: BridgeWorkspaceStackSummary?) -> [BridgeStackNode] {
  summary?.nodes.filter { $0.kind == "task" } ?? []
}

func stackExtensionSummarySubtitle(summary: BridgeWorkspaceStackSummary?) -> String {
  guard let summary else {
    return "Loading stack summary from the bridge..."
  }

  switch summary.state {
  case "missing":
    return "No stack configured for this workspace."
  case "invalid":
    return "Invalid lifecycle.json stack."
  default:
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
}

struct StackExtensionView: View {
  @Environment(\.appTheme) private var theme

  let context: WorkspaceExtensionContext
  @State private var isServicesExpanded = true
  @State private var isTasksExpanded = false

  var body: some View {
    GeometryReader { geometry in
      let usesCompactLayout = stackExtensionUsesCompactLayout(availableWidth: geometry.size.width)
      let serviceNodes = stackExtensionServiceNodes(from: context.stackSummary)
      let taskNodes = stackExtensionTaskNodes(from: context.stackSummary)

      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          summaryHeader

          if context.stackSummary?.state == "invalid", let summary = context.stackSummary, !summary.errors.isEmpty {
            errorList(summary.errors)
          }

          if !serviceNodes.isEmpty {
            accordionSection(
              title: "Services",
              count: serviceNodes.count,
              isExpanded: $isServicesExpanded
            ) {
              if usesCompactLayout {
                compactNodeList(serviceNodes)
              } else {
                serviceTable(serviceNodes)
              }
            }
          }

          if !taskNodes.isEmpty {
            accordionSection(
              title: "Tasks",
              count: taskNodes.count,
              isExpanded: $isTasksExpanded
            ) {
              if usesCompactLayout {
                compactNodeList(taskNodes)
              } else {
                taskTable(taskNodes)
              }
            }
          }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .topLeading)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .scrollIndicators(.automatic)
    }
  }

  @ViewBuilder
  private var summaryHeader: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Text("STACK")
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.75))

        Spacer(minLength: 0)

        LCBadge(
          label: (context.stackSummary?.state ?? "loading").uppercased(),
          color: stateColor(context.stackSummary?.state ?? "loading")
        )
      }

      Text(stackExtensionSummarySubtitle(summary: context.stackSummary))
        .font(.system(size: 12, weight: .medium))
        .foregroundStyle(context.stackSummary?.state == "invalid" ? theme.errorColor : theme.primaryTextColor)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func accordionSection<Content: View>(
    title: String,
    count: Int,
    isExpanded: Binding<Bool>,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Button {
        withAnimation(.spring(response: 0.26, dampingFraction: 0.86)) {
          isExpanded.wrappedValue.toggle()
        }
      } label: {
        HStack(spacing: 10) {
          Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(theme.mutedColor.opacity(0.82))
            .rotationEffect(.degrees(isExpanded.wrappedValue ? 90 : 0))

          Text(title.uppercased())
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.78))

          Spacer(minLength: 0)

          Text("\(count)")
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.72))
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .lcPointerCursor()

      if isExpanded.wrappedValue {
        content()
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func errorList(_ errors: [String]) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(errors, id: \.self) { error in
        Text(error)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.errorColor)
          .textSelection(.enabled)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func serviceTable(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        tableHeader("Name", width: 116)
        tableHeader("State", width: 88)
        tableHeader("Details", width: nil)
      }
      .padding(.vertical, 8)

      ForEach(nodes) { node in
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .top, spacing: 12) {
            Text(node.name)
              .font(.system(size: 12, weight: .semibold, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor)
              .frame(width: 116, alignment: .leading)

            statusBadge(for: node)
              .frame(width: 88, alignment: .leading)

            nodeDetails(node)
          }

          if !node.dependsOn.isEmpty {
            Text("depends_on: \(node.dependsOn.joined(separator: ", "))")
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.mutedColor.opacity(0.8))
              .padding(.leading, 128)
          }
        }
        .padding(.vertical, 10)

        if nodes.last?.id != node.id {
          Divider()
            .overlay(theme.borderColor.opacity(0.35))
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func taskTable(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        tableHeader("Name", width: 116)
        tableHeader("Trigger", width: 88)
        tableHeader("Details", width: nil)
      }
      .padding(.vertical, 8)

      ForEach(nodes) { node in
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .top, spacing: 12) {
            Text(node.name)
              .font(.system(size: 12, weight: .semibold, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor)
              .frame(width: 116, alignment: .leading)

            statusBadge(for: node)
              .frame(width: 88, alignment: .leading)

            nodeDetails(node)
          }

          if !node.dependsOn.isEmpty {
            Text("depends_on: \(node.dependsOn.joined(separator: ", "))")
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.mutedColor.opacity(0.8))
              .padding(.leading, 128)
          }
        }
        .padding(.vertical, 10)

        if nodes.last?.id != node.id {
          Divider()
            .overlay(theme.borderColor.opacity(0.35))
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func tableHeader(_ label: String, width: CGFloat?) -> some View {
    Text(label.uppercased())
      .font(.system(size: 10, weight: .bold, design: .monospaced))
      .foregroundStyle(theme.mutedColor.opacity(0.7))
      .frame(width: width, alignment: .leading)
  }

  @ViewBuilder
  private func compactNodeList(_ nodes: [BridgeStackNode]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(nodes) { node in
        VStack(alignment: .leading, spacing: 8) {
          HStack(alignment: .top, spacing: 8) {
            Text(node.name)
              .font(.system(size: 12, weight: .semibold, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor)

            Spacer(minLength: 0)

            statusBadge(for: node)
          }

          compactNodeDetails(node)

          if !node.dependsOn.isEmpty {
            Text("depends_on: \(node.dependsOn.joined(separator: ", "))")
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.mutedColor.opacity(0.8))
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)

        if nodes.last?.id != node.id {
          Divider()
            .overlay(theme.borderColor.opacity(0.35))
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func statusBadge(for node: BridgeStackNode) -> some View {
    if node.kind == "service" {
      LCBadge(
        label: node.status ?? "stopped",
        color: stateColor(node.status ?? "stopped")
      )
    } else if let runOn = node.runOn {
      LCBadge(label: runOn, color: theme.warningColor, variant: .outline)
    } else {
      Text("manual")
        .font(.system(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
    }
  }

  @ViewBuilder
  private func nodeDetails(_ node: BridgeStackNode) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      if node.kind == "service" {
        HStack(spacing: 8) {
          if let runtime = node.runtime {
            Text(runtime)
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor.opacity(0.85))
          }

          if let assignedPort = node.assignedPort {
            Text(":\(assignedPort)")
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.successColor)
          }
        }

        if let previewURL = node.previewURL {
          Text(previewURL)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.8))
            .textSelection(.enabled)
            .lineLimit(1)
        } else if let statusReason = node.statusReason {
          Text(statusReason)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.errorColor)
        }
      } else {
        if let command = node.command {
          Text(command)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.primaryTextColor.opacity(0.8))
            .textSelection(.enabled)
            .lineLimit(2)
        }

        Text("write_files: \(node.writeFilesCount ?? 0)")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.8))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func compactNodeDetails(_ node: BridgeStackNode) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      if node.kind == "service" {
        HStack(spacing: 8) {
          if let runtime = node.runtime {
            Text(runtime)
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor.opacity(0.85))
          }

          if let assignedPort = node.assignedPort {
            Text(":\(assignedPort)")
              .font(.system(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.successColor)
          }
        }

        if let previewURL = node.previewURL {
          Text(previewURL)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.8))
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
        } else if let statusReason = node.statusReason {
          Text(statusReason)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.errorColor)
            .fixedSize(horizontal: false, vertical: true)
        }
      } else {
        if let runOn = node.runOn {
          Text("run_on: \(runOn)")
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.warningColor)
        }

        if let command = node.command {
          Text(command)
            .font(.system(size: 10, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.primaryTextColor.opacity(0.8))
            .textSelection(.enabled)
            .fixedSize(horizontal: false, vertical: true)
        }

        Text("write_files: \(node.writeFilesCount ?? 0)")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.8))
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func stateColor(_ state: String) -> Color {
    switch state {
    case "ready":
      theme.successColor
    case "starting", "loading":
      theme.accentColor
    case "invalid", "failed":
      theme.errorColor
    case "missing":
      theme.warningColor
    default:
      theme.mutedColor
    }
  }
}
