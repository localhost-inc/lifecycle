import SwiftUI

struct SessionsExtensionDefinition: WorkspaceExtensionDefinition {
  let kind = WorkspaceExtensionKind.sessions

  func resolve(context: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        icon: "rectangle.stack",
        title: "Sessions",
        subtitle: sessionsExtensionSubtitle(terminals: context.terminals)
      ),
      content: AnyWorkspaceExtensionContent {
        SessionsExtensionView(context: context)
      }
    )
  }
}

func sessionsExtensionSubtitle(terminals: [BridgeTerminalRecord]) -> String {
  guard !terminals.isEmpty else {
    return "no sessions"
  }

  let activeCount = terminals.filter(\.busy).count
  if activeCount == 0 {
    return "\(terminals.count) idle"
  }

  return "\(activeCount) active, \(terminals.count) total"
}
