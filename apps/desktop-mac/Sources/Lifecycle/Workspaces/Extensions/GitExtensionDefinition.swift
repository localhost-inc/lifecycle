import SwiftUI

struct GitExtensionDefinition: WorkspaceExtensionDefinition {
  let kind = WorkspaceExtensionKind.git

  func resolve(context: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension? {
    ResolvedWorkspaceExtension(
      kind: kind,
      tab: WorkspaceExtensionTabPresentation(
        icon: "arrow.triangle.branch",
        title: "Git",
        subtitle: gitExtensionSubtitle(snapshot: context.gitSnapshot, isLoading: context.isGitLoading)
      ),
      content: AnyWorkspaceExtensionContent {
        GitExtensionView(context: context)
      }
    )
  }
}

func gitExtensionSubtitle(
  snapshot: BridgeWorkspaceGitResponse?,
  isLoading: Bool
) -> String {
  guard let snapshot else {
    return isLoading ? "loading" : "not loaded"
  }

  let changeCount = snapshot.status.files.count
  if changeCount > 0 {
    return "\(changeCount) changed"
  }

  if snapshot.status.ahead > 0 || snapshot.status.behind > 0 {
    return gitExtensionSyncLabel(
      ahead: snapshot.status.ahead,
      behind: snapshot.status.behind
    )
  }

  return snapshot.status.branch ?? "detached"
}

func gitExtensionSyncLabel(ahead: Int, behind: Int) -> String {
  switch (ahead, behind) {
  case (0, 0):
    return "up to date"
  case (let ahead, 0):
    return "\(ahead) ahead"
  case (0, let behind):
    return "\(behind) behind"
  case (let ahead, let behind):
    return "\(ahead) ahead, \(behind) behind"
  }
}
