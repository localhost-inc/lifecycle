import Foundation

public struct TerminalSurfaceBinding: Hashable {
  public let workspaceID: String
  public let terminalID: String

  public init(workspaceID: String, terminalID: String) {
    self.workspaceID = workspaceID
    self.terminalID = canonicalTmuxTerminalID(terminalID)
  }

  public init?(binding: SurfaceBinding) {
    guard let workspaceID = binding.string(for: "workspaceID"),
          let terminalID = binding.string(for: "terminalID")
    else {
      return nil
    }

    self.workspaceID = workspaceID
    self.terminalID = canonicalTmuxTerminalID(terminalID)
  }

  public var surfaceBinding: SurfaceBinding {
    SurfaceBinding(params: [
      "workspaceID": workspaceID,
      "terminalID": terminalID,
    ])
  }
}
