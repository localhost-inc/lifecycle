import SwiftUI

// MARK: - Focused Values

struct FocusedAppModelKey: FocusedValueKey {
  typealias Value = AppModel
}

struct FocusedAppActionsKey: FocusedValueKey {
  typealias Value = AppActions
}

extension FocusedValues {
  var appModel: AppModel? {
    get { self[FocusedAppModelKey.self] }
    set { self[FocusedAppModelKey.self] = newValue }
  }

  var appActions: AppActions? {
    get { self[FocusedAppActionsKey.self] }
    set { self[FocusedAppActionsKey.self] = newValue }
  }
}

/// Actions that the command system can trigger on the active scene.
@MainActor
struct AppActions {
  let navigateBack: () -> Void
  let navigateForward: () -> Void
  let canNavigateBack: Bool
  let canNavigateForward: Bool
}

// MARK: - Commands

struct AppCommands: Commands {
  @FocusedValue(\.appModel) private var model
  @FocusedValue(\.appActions) private var actions

  var body: some Commands {
    // Replace the default "Settings" menu item (Cmd+,)
    CommandGroup(replacing: .appSettings) {
      Button("Settings…") {
        AppCommandRequest.openSettings.post()
      }
      .keyboardShortcut(",", modifiers: .command)
    }

    // Tab commands under File menu
    CommandGroup(after: .newItem) {
      Button("Command Palette…") {
        AppCommandRequest.toggleCommandPalette.post()
      }
      .keyboardShortcut("k", modifiers: .command)

      Divider()

      Button("New Tab") {
        model?.createTerminalTab()
      }
      .keyboardShortcut("t", modifiers: .command)
      .disabled(model?.selectedWorkspaceID == nil)

      Button("Reopen Closed Tab") {
        model?.reopenClosedSurface()
      }
      .keyboardShortcut("t", modifiers: [.command, .shift])
      .disabled(model?.canReopenClosedSurface() != true)

      Divider()
    }

    // Replace the default Close Window item so Cmd+W closes the active workspace tab.
    CommandGroup(replacing: .saveItem) {
      Button("Close Tab") {
        model?.closeActiveSurface()
      }
      .keyboardShortcut("w", modifiers: .command)
      .disabled(model?.canCloseActiveSurface() != true)
    }

    // Navigation commands
    CommandGroup(after: .toolbar) {
      Button("Back") {
        actions?.navigateBack()
      }
      .keyboardShortcut("[", modifiers: .command)
      .disabled(actions?.canNavigateBack != true)

      Button("Forward") {
        actions?.navigateForward()
      }
      .keyboardShortcut("]", modifiers: .command)
      .disabled(actions?.canNavigateForward != true)
    }

    CommandGroup(after: .help) {
      Button("Export Feedback Bundle…") {
        model?.exportFeedbackBundle()
      }
      .keyboardShortcut("e", modifiers: [.command, .shift])
      .disabled(model == nil)
    }
  }
}
