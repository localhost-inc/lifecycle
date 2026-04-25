import Foundation
import AppKit
import LifecyclePresentation

enum WorkspaceStatusBarLayoutMode: Equatable {
  case tiled
  case spatial
}

func workspaceShellIdentityLabel(
  hostKind: String,
  localUserName: String,
  localHostName: String
) -> String {
  if hostKind == "local" {
    let shortHost = localHostName.split(separator: ".").first.map(String.init) ?? localHostName
    return "\(localUserName)@\(shortHost)"
  }

  return "\(hostKind) shell"
}

func workspaceStatusBarLayoutMode(for layout: CanvasLayout) -> WorkspaceStatusBarLayoutMode {
  switch layout {
  case .tiled:
    return .tiled
  case .spatial:
    return .spatial
  }
}

@MainActor
func zoomActiveWorkspaceWindow() {
  (NSApp.keyWindow ?? NSApp.mainWindow)?.zoom(nil)
}
