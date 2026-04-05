import SwiftUI

struct ContentView: View {
  @Environment(\.colorScheme) private var colorScheme
  @StateObject private var model = AppModel()
  @StateObject private var settingsStore = AppSettingsStore()
  @State private var navigationPath: [AppTopLevelDestination] = []

  var body: some View {
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
    }
    .preferredColorScheme(settingsStore.preferredColorScheme)
    .environment(\.appTheme, settingsStore.theme)
    .focusedSceneValue(\.appModel, model)
    .focusedSceneValue(\.appActions, AppActions(
      openSettings: { navigate(to: .settings) },
      navigateBack: { if !navigationPath.isEmpty { navigationPath.removeLast() } },
      navigateForward: { navigate(to: .settings) },
      canNavigateBack: !navigationPath.isEmpty,
      canNavigateForward: navigationPath.isEmpty
    ))
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
}
