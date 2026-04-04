import SwiftUI

final class LifecycleDesktopMacAppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    _ = notification
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)

    DispatchQueue.main.async {
      guard let window = NSApp.windows.first else {
        return
      }

      window.makeKeyAndOrderFront(nil)
      window.orderFrontRegardless()
      NSApp.activate(ignoringOtherApps: true)
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    _ = sender
    return true
  }
}

@main
struct LifecycleDesktopMacApp: App {
  @NSApplicationDelegateAdaptor(LifecycleDesktopMacAppDelegate.self)
  private var appDelegate

  var body: some Scene {
    WindowGroup("Lifecycle") {
      ContentView()
        .preferredColorScheme(.dark)
    }
    .windowStyle(.hiddenTitleBar)
    .defaultSize(width: 1440, height: 900)
  }
}
