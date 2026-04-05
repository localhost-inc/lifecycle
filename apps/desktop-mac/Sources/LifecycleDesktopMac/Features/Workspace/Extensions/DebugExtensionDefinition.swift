import SwiftUI

struct DebugExtensionDefinition: WorkspaceExtensionDefinition {
  let kind = WorkspaceExtensionKind.debug

  func resolve(context: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        title: "Debug",
        subtitle: context.runtime?.backendLabel ?? context.workspace.host
      ),
      content: AnyWorkspaceExtensionContent {
        DebugExtensionView(context: context)
      }
    )
  }
}
