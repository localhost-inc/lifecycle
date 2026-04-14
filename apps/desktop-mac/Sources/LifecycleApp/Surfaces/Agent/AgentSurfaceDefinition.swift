import SwiftUI
import LifecyclePresentation

struct AgentSurfaceDefinition: SurfaceDefinition {
  let kind = SurfaceKind.agent

  func resolve(
    record: CanvasSurfaceRecord,
    context: SurfaceResolutionContext
  ) -> ResolvedSurface? {
    guard let binding = AgentSurfaceBinding(binding: record.binding)
    else {
      return nil
    }

    let agent = context.agentsByID[binding.agentID]
    let handle = context.model.agentHandle(
      agentID: binding.agentID,
      workspaceID: context.workspaceID
    )

    let content = AnySurfaceContent(id: record.id) { _ in
      AgentSurfaceView(
        model: context.model,
        workspace: context.workspace,
        handle: handle
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    let tab = SurfaceTabPresentation(
      label: agent.map(resolvedAgentTitle) ?? record.title,
      icon: "sparkles"
    )

    return ResolvedSurface(
      content: content,
      tab: tab,
      isClosable: true
    )
  }
}

func resolvedAgentTitle(_ agent: BridgeAgentRecord) -> String {
  let trimmedTitle = agent.title.trimmingCharacters(in: .whitespacesAndNewlines)
  if !trimmedTitle.isEmpty {
    return trimmedTitle
  }

  switch agent.provider.lowercased() {
  case BridgeAgentProvider.claude.rawValue:
    return "Claude"
  case BridgeAgentProvider.codex.rawValue:
    return "Codex"
  default:
    return "Agent"
  }
}
