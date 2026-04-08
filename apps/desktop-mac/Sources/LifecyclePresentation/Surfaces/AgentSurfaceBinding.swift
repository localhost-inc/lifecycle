import Foundation

public struct AgentSurfaceBinding: Hashable {
  public let workspaceID: String
  public let agentID: String

  public init(workspaceID: String, agentID: String) {
    self.workspaceID = workspaceID
    self.agentID = agentID
  }

  public init?(binding: SurfaceBinding) {
    guard let workspaceID = binding.string(for: "workspaceID"),
          let agentID = binding.string(for: "agentID")
    else {
      return nil
    }

    self.workspaceID = workspaceID
    self.agentID = agentID
  }

  public var surfaceBinding: SurfaceBinding {
    SurfaceBinding(params: [
      "workspaceID": workspaceID,
      "agentID": agentID,
    ])
  }
}
