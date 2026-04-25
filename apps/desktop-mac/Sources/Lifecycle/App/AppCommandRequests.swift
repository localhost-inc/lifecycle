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
