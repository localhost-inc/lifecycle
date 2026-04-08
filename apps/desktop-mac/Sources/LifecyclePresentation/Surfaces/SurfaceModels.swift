import Foundation

public struct CanvasSurfaceRecord: Identifiable, Hashable, Codable {
  public let id: String
  public let title: String
  public let surfaceKind: SurfaceKind
  public let binding: SurfaceBinding

  public init(id: String, title: String, surfaceKind: SurfaceKind, binding: SurfaceBinding) {
    self.id = id
    self.title = title
    self.surfaceKind = surfaceKind
    self.binding = binding
  }
}

public func terminalSurfaceID(for workspaceID: String, terminalID: String) -> String {
  "surface:\(workspaceID):\(canonicalTmuxTerminalID(terminalID))"
}

public func agentSurfaceID(for workspaceID: String, agentID: String) -> String {
  "surface:\(workspaceID):agent:\(agentID)"
}

public func terminalHostID(for surfaceID: String) -> String {
  "terminal:\(surfaceID)"
}
