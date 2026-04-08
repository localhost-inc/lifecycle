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
  let openSettings: () -> Void
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
        actions?.openSettings()
      }
      .keyboardShortcut(",", modifiers: .command)
    }

    // Tab commands under File menu
    CommandGroup(after: .newItem) {
      Button("New Tab") {
        model?.createTerminalTab()
      }
      .keyboardShortcut("t", modifiers: .command)
      .disabled(model?.selectedWorkspaceID == nil)

      Button("Close Tab") {
        closeActiveTab()
      }
      .keyboardShortcut("w", modifiers: .command)
      .disabled(!canCloseTab)

      Divider()
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

  private var canCloseTab: Bool {
    guard let model, let canvasState = model.canvasState() else {
      return false
    }

    let activeGroupID = canvasState.activeGroupID
    let group = activeGroupID.flatMap { canvasState.groupsByID[$0] }
    let activeSurfaceID = group?.activeSurfaceID ?? group?.surfaceOrder.first
    guard let activeSurfaceID, let surface = canvasState.surfacesByID[activeSurfaceID] else {
      return false
    }

    return surface.isClosable
  }

  private func closeActiveTab() {
    guard let model, let canvasState = model.canvasState() else {
      return
    }

    let activeGroupID = canvasState.activeGroupID
    let group = activeGroupID.flatMap { canvasState.groupsByID[$0] }
    let activeSurfaceID = group?.activeSurfaceID ?? group?.surfaceOrder.first

    if let activeSurfaceID {
      model.closeSurface(activeSurfaceID)
    }
  }
}
