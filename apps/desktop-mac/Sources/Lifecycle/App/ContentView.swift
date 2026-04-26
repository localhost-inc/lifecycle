import SwiftUI

struct ContentView: View {
  @Environment(\.colorScheme) private var colorScheme
  @StateObject private var model = AppModel()
  @StateObject private var commandPalette = CommandPaletteController()
  @StateObject private var settingsStore = AppSettingsStore()
  @State private var navigationPath: [AppTopLevelDestination] = []

  var body: some View {
    ZStack(alignment: .top) {
      NavigationStack(path: $navigationPath) {
        WorkspaceShellView(model: model, settingsStore: settingsStore) {
          navigate(to: .settings)
        }
        .frame(minWidth: 1280, minHeight: 820)
        .background(settingsStore.theme.shellBackground)
        .navigationDestination(for: AppTopLevelDestination.self) { destination in
          switch destination {
          case .settings:
            SettingsView(model: model, settingsStore: settingsStore)
          }
        }
        .task {
          settingsStore.updateSystemAppearance(colorScheme)
          model.setTerminalThemeContext(settingsStore.terminalThemeContext)
          model.start()
        }
        .onChange(of: colorScheme) { nextColorScheme in
          settingsStore.updateSystemAppearance(nextColorScheme)
        }
        .onChange(of: settingsStore.terminalThemeContext) { nextContext in
          model.setTerminalThemeContext(nextContext)
        }
        .onReceive(model.$bridgeClient) { nextClient in
          settingsStore.setBridgeClient(nextClient)
        }
        .onOpenURL { url in
          guard let route = AppRoute(url: url) else {
            return
          }

          navigate(to: route)
        }
        .onReceive(
          NotificationCenter.default.publisher(for: AppCommandRequest.openSettings.notificationName)
        ) { _ in
          handleAppCommandRequest(.openSettings)
        }
        .onReceive(
          NotificationCenter.default.publisher(for: AppCommandRequest.toggleCommandPalette.notificationName)
        ) { _ in
          handleAppCommandRequest(.toggleCommandPalette)
        }
        .onReceive(
          NotificationCenter.default.publisher(for: TerminalWorkspaceShortcut.notificationName)
        ) { notification in
          handleTerminalWorkspaceShortcut(notification)
        }
      }

      CommandPaletteView(
        controller: commandPalette,
        commands: commandPaletteCommands
      )
    }
    .preferredColorScheme(settingsStore.preferredColorScheme)
    .environment(\.appTheme, settingsStore.theme)
    .focusedSceneValue(\.appModel, model)
    .focusedSceneValue(\.appActions, appActions)
  }

  private func navigate(to route: AppRoute) {
    switch route {
    case let .workspace(id):
      navigationPath.removeAll()
      model.selectWorkspace(id: id)
    case .settings:
      navigationPath = [.settings]
    }
  }

  private func handleAppCommandRequest(_ request: AppCommandRequest) {
    switch request {
    case .openSettings:
      navigate(to: .settings)
    case .toggleCommandPalette:
      commandPalette.toggle()
    }
  }

  private func handleTerminalWorkspaceShortcut(_ notification: Notification) {
    guard
      let terminalHostID = notification.userInfo?[TerminalWorkspaceShortcut.terminalIDUserInfoKey] as? String,
      let rawShortcut = terminalWorkspaceShortcutKind(from: notification),
      let shortcut = TerminalWorkspaceShortcut(rawValue: rawShortcut)
    else {
      return
    }

    switch shortcut {
    case .goBack:
      navigateBack()
    case .goForward:
      navigateForward()
    case .toggleZoom:
      zoomActiveWorkspaceWindow()
    case .previousTab, .nextTab, .closeActiveTab, .newTab, .reopenClosedTab:
      model.performTerminalWorkspaceShortcut(shortcut, terminalHostID: terminalHostID)
    }
  }

  private func terminalWorkspaceShortcutKind(from notification: Notification) -> Int? {
    let value = notification.userInfo?[TerminalWorkspaceShortcut.kindUserInfoKey]
    if let rawValue = value as? Int {
      return rawValue
    }
    return (value as? NSNumber)?.intValue
  }

  private var appActions: AppActions {
    AppActions(
      navigateBack: { navigateBack() },
      navigateForward: { navigateForward() },
      canNavigateBack: !navigationPath.isEmpty,
      canNavigateForward: navigationPath.isEmpty
    )
  }

  private func navigateBack() {
    if !navigationPath.isEmpty {
      navigationPath.removeLast()
    }
  }

  private func navigateForward() {
    navigate(to: .settings)
  }

  private var commandPaletteCommands: [CommandPaletteCommand] {
    buildCommandPaletteCommands(
      context: CommandPaletteBuildContext(
        repositories: model.repositories,
        selectedWorkspaceID: model.selectedWorkspaceID,
        canNavigateBack: !navigationPath.isEmpty,
        canCloseActiveTab: model.canCloseActiveSurface(),
        activeGroupID: model.activeCanvasGroupID(),
        availableExtensionKinds: Set(
          model.extensionSidebarState()?.extensions.map(\.kind) ?? []
        )
      ),
      handlers: commandPaletteHandlers
    )
  }

  private var commandPaletteHandlers: CommandPaletteHandlers {
    CommandPaletteHandlers(
      openSettings: { navigate(to: .settings) },
      navigateBack: { navigateBack() },
      refresh: { model.refresh() },
      exportFeedbackBundle: { model.exportFeedbackBundle() },
      openWorkspace: { workspaceID in navigate(to: .workspace(id: workspaceID)) },
      createTerminalTab: { model.createTerminalTab() },
      closeActiveTab: { model.closeActiveSurface() },
      splitActiveGroup: { direction in model.splitActiveGroup(direction) },
      selectExtension: { kind in model.selectExtension(kind) }
    )
  }
}
