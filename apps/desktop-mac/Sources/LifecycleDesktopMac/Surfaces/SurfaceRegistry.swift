import SwiftUI

// MARK: - Surface Kind

struct SurfaceKind: RawRepresentable, Hashable, Sendable {
  let rawValue: String
  init(rawValue: String) { self.rawValue = rawValue }

  static let terminal = SurfaceKind(rawValue: "terminal")
}

// MARK: - Surface Binding

struct SurfaceBinding: Hashable {
  let params: [String: String]

  func string(for key: String) -> String? {
    params[key]
  }
}

// MARK: - Surface Resolution Context

struct SurfaceResolutionContext {
  let workspaceID: String
  let workingDirectory: String
  let themeConfigPath: String
  let backendLabel: String
  let persistent: Bool
  let terminalsByID: [String: BridgeTerminalRecord]
  let connectionBySurfaceID: [String: BridgeTerminalConnection]
}

// MARK: - Surface Tab Presentation

struct SurfaceTabPresentation {
  let title: String
  let subtitle: String?
  let icon: String
}

// MARK: - Resolved Surface

struct ResolvedSurface {
  let content: AnySurfaceContent
  let tab: SurfaceTabPresentation
  let isClosable: Bool
}

// MARK: - AnySurfaceContent

struct AnySurfaceContent {
  let id: String
  private let _body: (_ isFocused: Bool) -> AnyView

  init<V: View>(id: String, @ViewBuilder body: @escaping (_ isFocused: Bool) -> V) {
    self.id = id
    self._body = { isFocused in AnyView(body(isFocused)) }
  }

  func body(isFocused: Bool) -> AnyView {
    _body(isFocused)
  }
}

// MARK: - Surface Definition Protocol

protocol SurfaceDefinition {
  var kind: SurfaceKind { get }

  func resolve(
    record: CanvasSurfaceRecord,
    context: SurfaceResolutionContext
  ) -> ResolvedSurface?
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
