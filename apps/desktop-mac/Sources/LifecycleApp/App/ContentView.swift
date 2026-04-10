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
        WorkspaceShellView(model: model) {
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
