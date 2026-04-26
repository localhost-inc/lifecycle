import Foundation

enum AppCommandRequest {
  case openSettings
  case toggleCommandPalette

  var notificationName: Notification.Name {
    switch self {
    case .openSettings:
      Notification.Name("LifecycleOpenSettingsRequested")
    case .toggleCommandPalette:
      Notification.Name("LifecycleToggleCommandPaletteRequested")
    }
  }

  func post() {
    NotificationCenter.default.post(name: notificationName, object: nil)
  }
}

enum TerminalWorkspaceShortcut: Int, Sendable {
  case previousTab = 1
  case nextTab = 2
  case closeActiveTab = 3
  case newTab = 5
  case goBack = 6
  case goForward = 7
  case reopenClosedTab = 8
  case toggleZoom = 9

  static let notificationName = Notification.Name("LifecycleTerminalWorkspaceShortcutRequested")
  static let terminalIDUserInfoKey = "terminalID"
  static let kindUserInfoKey = "shortcutKind"
}
