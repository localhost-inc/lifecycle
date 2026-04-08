import LifecyclePresentation
import SwiftUI

let stackExtensionMinimumTableWidth: CGFloat = 400

func stackExtensionUsesCompactLayout(availableWidth: CGFloat) -> Bool {
  availableWidth < stackExtensionMinimumTableWidth
}

struct StackExtensionView: View {
  @Environment(\.appTheme) private var theme

  let context: WorkspaceExtensionContext

  var body: some View {
    GeometryReader { geometry in
      let usesCompactLayout = stackExtensionUsesCompactLayout(availableWidth: geometry.size.width)

      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          summaryCard

          if usesCompactLayout {
            compactNodeList
          } else {
            nodeTable
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
  private var summaryCard: some View {
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

      if let summary = context.stackSummary {
        Text("\(summary.nodes.count) declared stack nodes in lifecycle.json")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(theme.primaryTextColor)

        if !summary.errors.isEmpty {
          VStack(alignment: .leading, spacing: 6) {
            ForEach(summary.errors, id: \.self) { error in
              Text(error)
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.errorColor)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
        }
      } else {
        Text("Loading stack summary from the bridge...")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(theme.mutedColor)
      }
    }
    .padding(12)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(theme.surfaceRaised.opacity(0.55))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.5))
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private var nodeTable: some View {
    let nodes = context.stackSummary?.nodes ?? []

    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 12) {
        tableHeader("Name", width: 110)
        tableHeader("Kind", width: 70)
        tableHeader("State", width: 88)
        tableHeader("Details", width: nil)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)

      if nodes.isEmpty {
        Text(emptyStateLabel)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(theme.mutedColor)
          .padding(.horizontal, 12)
          .padding(.vertical, 12)
      } else {
        ForEach(nodes) { node in
          VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 12) {
              Text(node.name)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(theme.primaryTextColor)
                .frame(width: 110, alignment: .leading)

              LCBadge(
                label: node.kind,
                color: node.kind == "service" ? theme.accentColor : theme.warningColor,
                variant: .outline
              )
              .frame(width: 70, alignment: .leading)

              statusBadge(for: node)
                .frame(width: 88, alignment: .leading)

              nodeDetails(node)
            }

            if !node.dependsOn.isEmpty {
              Text("depends_on: \(node.dependsOn.joined(separator: ", "))")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.mutedColor.opacity(0.8))
                .padding(.leading, 192)
            }
          }
          .padding(.horizontal, 12)
          .padding(.vertical, 10)

          if nodes.last?.id != node.id {
            Divider()
              .overlay(theme.borderColor.opacity(0.35))
          }
        }
      }
    }
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(theme.surfaceRaised.opacity(0.4))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.45))
    )
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private var emptyStateLabel: String {
    switch context.stackSummary?.state {
    case "missing":
      "No lifecycle.json stack is configured for this workspace."
    case "invalid":
      "The stack manifest is invalid."
    default:
      "No stack nodes declared."
    }
  }

  private func tableHeader(_ label: String, width: CGFloat?) -> some View {
    Text(label.uppercased())
      .font(.system(size: 10, weight: .bold, design: .monospaced))
      .foregroundStyle(theme.mutedColor.opacity(0.7))
      .frame(width: width, alignment: .leading)
  }

  @ViewBuilder
  private var compactNodeList: some View {
    let nodes = context.stackSummary?.nodes ?? []

    VStack(alignment: .leading, spacing: 10) {
      if nodes.isEmpty {
        Text(emptyStateLabel)
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(theme.mutedColor)
          .padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .fill(theme.surfaceRaised.opacity(0.4))
          )
          .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .strokeBorder(theme.borderColor.opacity(0.45))
          )
      } else {
        ForEach(nodes) { node in
          VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
              VStack(alignment: .leading, spacing: 6) {
                Text(node.name)
                  .font(.system(size: 12, weight: .semibold, design: .monospaced))
                  .foregroundStyle(theme.primaryTextColor)

                HStack(spacing: 8) {
                  kindBadge(for: node)
                  statusBadge(for: node)
                }
              }

              Spacer(minLength: 0)
            }

            compactNodeDetails(node)

            if !node.dependsOn.isEmpty {
              Text("depends_on: \(node.dependsOn.joined(separator: ", "))")
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundStyle(theme.mutedColor.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          .padding(12)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .fill(theme.surfaceRaised.opacity(0.4))
          )
          .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
              .strokeBorder(theme.borderColor.opacity(0.45))
          )
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

  private func kindBadge(for node: BridgeStackNode) -> some View {
    LCBadge(
      label: node.kind,
      color: node.kind == "service" ? theme.accentColor : theme.warningColor,
      variant: .outline
    )
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
