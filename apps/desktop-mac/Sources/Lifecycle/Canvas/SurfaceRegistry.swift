import SwiftUI
import LifecyclePresentation

// MARK: - Surface Resolution Context

struct SurfaceResolutionContext {
  let model: AppModel
  let workspace: BridgeWorkspaceSummary
  let workspaceID: String
  let workingDirectory: String
  let themeConfigPath: String
  let terminalBackgroundHexColor: String
  let terminalDarkAppearance: Bool
  let backendLabel: String?
  let persistent: Bool?
  let agentsByID: [String: BridgeAgentRecord]
  let terminalsByID: [String: BridgeTerminalRecord]
  let connectionBySurfaceID: [String: BridgeTerminalConnection]
}

// MARK: - Surface Tab Presentation

struct SurfaceTabPresentation {
  let label: String
  let icon: String
  let isBusy: Bool

  init(label: String, icon: String, isBusy: Bool = false) {
    self.label = label
    self.icon = icon
    self.isBusy = isBusy
  }
}

// MARK: - Resolved Surface

struct ResolvedSurface {
  let content: AnySurfaceContent
  let tab: SurfaceTabPresentation
  let isClosable: Bool
}

struct SurfaceRenderState: Equatable {
  let isFocused: Bool
  let isVisible: Bool
  let presentationScale: CGFloat
}

struct SurfaceLifecycleContext {
  let model: AppModel
  let workspaceID: String
}

// MARK: - AnySurfaceContent

struct AnySurfaceContent {
  let id: String
  private let _body: @MainActor (_ renderState: SurfaceRenderState) -> AnyView

  @MainActor
  init<V: View>(id: String, @ViewBuilder body: @escaping @MainActor (_ renderState: SurfaceRenderState) -> V) {
    self.id = id
    self._body = { renderState in AnyView(body(renderState)) }
  }

  @MainActor
  func body(renderState: SurfaceRenderState) -> AnyView {
    _body(renderState)
  }
}

// MARK: - Surface Definition Protocol

protocol SurfaceDefinition {
  var kind: SurfaceKind { get }

  @MainActor
  func resolve(
    record: CanvasSurfaceRecord,
    context: SurfaceResolutionContext
  ) -> ResolvedSurface?

  @MainActor
  func didClose(record: CanvasSurfaceRecord, context: SurfaceLifecycleContext) async

  @MainActor
  func didReopen(record: CanvasSurfaceRecord, context: SurfaceLifecycleContext) async
}

extension SurfaceDefinition {
  @MainActor
  func didClose(record: CanvasSurfaceRecord, context: SurfaceLifecycleContext) async {}

  @MainActor
  func didReopen(record: CanvasSurfaceRecord, context: SurfaceLifecycleContext) async {}
}

// MARK: - Surface Registry

@MainActor
final class SurfaceRegistry {
  static let shared = SurfaceRegistry()
  private var definitions: [SurfaceKind: SurfaceDefinition] = [:]

  func register(_ definition: SurfaceDefinition) {
    definitions[definition.kind] = definition
  }

  subscript(kind: SurfaceKind) -> SurfaceDefinition? {
    definitions[kind]
  }
}
