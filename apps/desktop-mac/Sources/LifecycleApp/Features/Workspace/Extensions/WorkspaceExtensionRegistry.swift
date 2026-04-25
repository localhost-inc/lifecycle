import SwiftUI

struct WorkspaceExtensionKind: RawRepresentable, Hashable, Sendable {
  let rawValue: String

  init(rawValue: String) {
    self.rawValue = rawValue
  }

  static let debug = WorkspaceExtensionKind(rawValue: "debug")
  static let stack = WorkspaceExtensionKind(rawValue: "stack")
}

struct WorkspaceExtensionContext {
  let model: AppModel
  let repository: BridgeRepository?
  let workspace: BridgeWorkspaceSummary
  let terminalEnvelope: BridgeWorkspaceTerminalsEnvelope?
  let stackSummary: BridgeWorkspaceStackSummary?

  var scope: BridgeWorkspaceScope? {
    terminalEnvelope?.workspace
  }

  var runtime: BridgeTerminalRuntime? {
    terminalEnvelope?.runtime
  }

  var terminals: [BridgeTerminalRecord] {
    terminalEnvelope?.terminals ?? []
  }
}

struct WorkspaceExtensionTabPresentation {
  let icon: String
  let title: String
  let subtitle: String?
}

struct AnyWorkspaceExtensionContent {
  private let _body: () -> AnyView

  init<V: View>(@ViewBuilder body: @escaping () -> V) {
    _body = { AnyView(body()) }
  }

  func body() -> AnyView {
    _body()
  }
}

struct ResolvedWorkspaceExtension: Identifiable {
  let kind: WorkspaceExtensionKind
  let tab: WorkspaceExtensionTabPresentation
  let content: AnyWorkspaceExtensionContent

  var id: String {
    kind.rawValue
  }
}

func normalizedWorkspaceExtensionKind(
  requested: WorkspaceExtensionKind?,
  available extensions: [ResolvedWorkspaceExtension]
) -> WorkspaceExtensionKind? {
  guard let first = extensions.first else {
    return nil
  }

  guard let requested,
        extensions.contains(where: { $0.kind == requested })
  else {
    return first.kind
  }

  return requested
}

struct WorkspaceExtensionSidebarState {
  let workspaceID: String
  let extensions: [ResolvedWorkspaceExtension]
  let activeKind: WorkspaceExtensionKind

  init?(
    workspaceID: String,
    extensions: [ResolvedWorkspaceExtension],
    activeKind: WorkspaceExtensionKind?
  ) {
    guard let normalizedKind = normalizedWorkspaceExtensionKind(
      requested: activeKind,
      available: extensions
    ) else {
      return nil
    }

    self.workspaceID = workspaceID
    self.extensions = extensions
    self.activeKind = normalizedKind
  }

  var activeExtension: ResolvedWorkspaceExtension {
    extensions.first(where: { $0.kind == activeKind }) ?? extensions[0]
  }

  var visibleExtensions: [ResolvedWorkspaceExtension] {
    extensions
  }
}

@MainActor
protocol WorkspaceExtensionDefinition {
  var kind: WorkspaceExtensionKind { get }

  func resolve(context: WorkspaceExtensionContext) -> ResolvedWorkspaceExtension?
}

@MainActor
final class WorkspaceExtensionRegistry {
  static let shared = WorkspaceExtensionRegistry()

  private var orderedKinds: [WorkspaceExtensionKind] = []
  private var definitionsByKind: [WorkspaceExtensionKind: any WorkspaceExtensionDefinition] = [:]

  func register(_ definition: some WorkspaceExtensionDefinition) {
    if definitionsByKind[definition.kind] == nil {
      orderedKinds.append(definition.kind)
    }

    definitionsByKind[definition.kind] = definition
  }

  func resolveExtensions(context: WorkspaceExtensionContext) -> [ResolvedWorkspaceExtension] {
    orderedKinds.compactMap { kind in
      definitionsByKind[kind]?.resolve(context: context)
    }
  }

  subscript(kind: WorkspaceExtensionKind) -> (any WorkspaceExtensionDefinition)? {
    definitionsByKind[kind]
  }
}
