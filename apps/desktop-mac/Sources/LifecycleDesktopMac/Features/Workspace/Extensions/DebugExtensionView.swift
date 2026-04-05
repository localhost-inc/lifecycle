import SwiftUI

struct DebugExtensionView: View {
  @Environment(\.appTheme) private var theme
  let context: WorkspaceExtensionContext

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        extensionSection(title: "Workspace") {
          extensionRow(label: "ID", value: context.workspace.id)
          extensionRow(label: "Name", value: context.workspace.name)
          extensionRow(label: "Host", value: context.workspace.host)
          extensionRow(label: "Status", value: context.workspace.status)
          extensionRow(label: "Ref", value: context.workspace.ref ?? "n/a")
          extensionRow(label: "Path", value: context.workspace.path ?? "n/a")
        }

        if let repository = context.repository {
          extensionSection(title: "Repository") {
            extensionRow(label: "Name", value: repository.name)
            extensionRow(label: "Source", value: repository.source)
            extensionRow(label: "Path", value: repository.path)
          }
        }

        if let scope = context.scope {
          extensionSection(title: "Scope") {
            extensionRow(label: "Binding", value: scope.binding)
            extensionRow(label: "Repo", value: scope.repoName ?? "n/a")
            extensionRow(label: "CWD", value: scope.cwd ?? "n/a")
            extensionRow(
              label: "Resolution",
              value: scope.resolutionNote ?? scope.resolutionError ?? "n/a"
            )
          }
        }

        if let runtime = context.runtime {
          extensionSection(title: "Terminal Runtime") {
            extensionRow(label: "Backend", value: runtime.backendLabel)
            extensionRow(label: "Persistent", value: runtime.persistent ? "yes" : "no")
            extensionRow(label: "Runtime ID", value: runtime.runtimeID ?? "n/a")
            extensionRow(label: "Launch Error", value: runtime.launchError ?? "none")
          }
        }

        if let activity = context.activity {
          extensionSection(title: "Activity") {
            extensionRow(label: "Busy", value: activity.busy ? "yes" : "no")
            extensionRow(
              label: "Last Active",
              value: activity.activityAt.map { "\($0)" } ?? "n/a"
            )
          }
        }

        if !context.terminals.isEmpty {
          extensionSection(title: "Terminals") {
            extensionRow(label: "Count", value: "\(context.terminals.count)")

            ForEach(context.terminals) { terminal in
              extensionRow(
                label: terminal.id,
                value: "\(terminal.title) • \(terminal.kind)\(terminal.busy ? " • busy" : "")"
              )
            }
          }
        }

        extensionSection(title: "Architecture") {
          extensionRow(label: "Sidebar", value: "repos + workspaces")
          extensionRow(label: "Route", value: "center canvas + extension sidebar")
          extensionRow(label: "Canvas", value: "canvas > group > surface")
          extensionRow(label: "Layout", value: "tiled split groups")
          extensionRow(label: "Extensions", value: "registry > tab rail > single active extension")
          extensionRow(label: "Terminal", value: "native Ghostty NSView")
        }
      }
      .padding(20)
    }
    .scrollIndicators(.automatic)
  }

  private func extensionSection<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)
      content()
    }
    .padding(16)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(theme.surfaceRaised)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .strokeBorder(theme.borderColor)
    )
  }

  private func extensionRow(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
      Text(value)
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
