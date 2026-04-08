import SwiftUI

struct StackExtensionDefinition: WorkspaceExtensionDefinition {
  let kind = WorkspaceExtensionKind.stack

  func resolve(context: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    let subtitle: String
    if let summary = context.stackSummary {
      switch summary.state {
      case "ready":
        subtitle = "\(summary.nodes.count) nodes"
      case "missing":
        subtitle = "unconfigured"
      case "invalid":
        subtitle = "invalid"
      default:
        subtitle = "loading"
      }
    } else {
      subtitle = "loading"
    }

    return ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        title: "Stack",
        subtitle: subtitle
      ),
      content: AnyWorkspaceExtensionContent {
        StackExtensionView(context: context)
      }
    )
  }
}
