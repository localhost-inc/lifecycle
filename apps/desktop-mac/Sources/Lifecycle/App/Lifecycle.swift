import SwiftUI

final class LifecycleDelegate: NSObject, NSApplicationDelegate {
  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    _ = sender

    if !flag {
      DispatchQueue.main.async {
        if let window = NSApp.windows.first {
          window.makeKeyAndOrderFront(nil)
          window.orderFrontRegardless()
        }
        NSApp.activate(ignoringOtherApps: true)
      }
    }

    return true
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    _ = notification
    _ = AppResources.registerBundledFonts()
    AppLog.notice(.app, "Lifecycle finished launching")
    NSApp.setActivationPolicy(.regular)
    NSApp.activate(ignoringOtherApps: true)

    DispatchQueue.main.async {
      guard let window = NSApp.windows.first else {
        return
      }

      window.styleMask.insert(.fullSizeContentView)
      window.titleVisibility = .hidden
      window.titlebarAppearsTransparent = true
      window.isMovableByWindowBackground = false
      window.makeKeyAndOrderFront(nil)
      window.orderFrontRegardless()
      NSApp.activate(ignoringOtherApps: true)
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    _ = sender
    AppLog.notice(.app, "Lifecycle terminating after last window closed")
    return true
  }
}

@main
struct Lifecycle: App {
  @NSApplicationDelegateAdaptor(LifecycleDelegate.self)
  private var appDelegate

  var body: some Scene {
    WindowGroup("Lifecycle") {
      ContentView()
    }
    .windowStyle(.hiddenTitleBar)
    .defaultSize(width: 1440, height: 900)
    .commands {
      AppCommands()
    }
  }
}
