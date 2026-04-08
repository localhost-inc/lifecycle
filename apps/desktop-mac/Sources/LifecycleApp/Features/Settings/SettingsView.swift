import SwiftUI

struct SettingsView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.dismiss) private var dismiss
  @ObservedObject var model: AppModel
  @ObservedObject var settingsStore: AppSettingsStore

  private enum Section: String, CaseIterable, Identifiable {
    case appearance = "Appearance"
    case terminal = "Terminal"
    case providers = "Providers"
    case connection = "Connection"

    var id: String { rawValue }
  }

  @Namespace private var tabIndicator
  @State private var activeSection: Section = .appearance
  @State private var commandProgramDraft = ""
  @State private var persistenceExecutablePathDraft = ""

  var body: some View {
    VStack(spacing: 0) {
      // Back button
      HStack {
        Button {
          dismiss()
        } label: {
          HStack(spacing: 4) {
            Image(systemName: "chevron.left")
              .font(.system(size: 11, weight: .semibold))
            Text("Back")
              .font(.system(size: 13, weight: .medium))
          }
          .foregroundStyle(theme.mutedColor)
        }
        .buttonStyle(.plain)

        Spacer()
      }
      .padding(.leading, 20)
      .padding(.top, 52)

      ScrollViewReader { proxy in
        VStack(spacing: 0) {
          // Header
          VStack(alignment: .leading, spacing: 4) {
            Text("Settings")
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(theme.primaryTextColor)

            Text("Manage appearance, terminal, provider, and connection preferences.")
              .font(.system(size: 13))
              .foregroundStyle(theme.mutedColor)
          }
          .frame(maxWidth: 480, alignment: .leading)
          .padding(.top, 24)
          .padding(.bottom, 20)

          // Tab bar
          LCTabBar {
            ForEach(Section.allCases) { section in
              LCTabItem(
                label: section.rawValue,
                isActive: activeSection == section,
                namespace: tabIndicator
              ) {
                withAnimation(.easeInOut(duration: 0.25)) {
                  activeSection = section
                }
                withAnimation {
                  proxy.scrollTo(section.id, anchor: .top)
                }
              }
            }
          }
          .frame(maxWidth: 480, alignment: .leading)
          .padding(.bottom, 12)

          // Sections
          ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 0) {
              SettingsSectionHeader(title: "Appearance")
                .id(Section.appearance.id)

              SettingsRowView(
                label: "Theme",
                description: themeDescription
              ) {
                Picker("", selection: themeBinding) {
                  ForEach(AppThemePreference.allCases) { option in
                    Text(option.label).tag(option)
                  }
                }
                .pickerStyle(.menu)
                .tint(theme.primaryTextColor)
                .frame(width: 160)
              }

              if let errorMessage = settingsStore.errorMessage {
                Text(errorMessage)
                  .font(.system(size: 11))
                  .foregroundStyle(theme.errorColor)
                  .padding(.top, 8)
              }

              SettingsSectionHeader(title: "Terminal")
                .id(Section.terminal.id)
                .padding(.top, 32)

              SettingsRowView(
                label: "Command",
                description: "Program launched inside direct terminal sessions. Leave empty to use your login shell."
              ) {
                SettingsOptionalTextFieldControl(
                  text: $commandProgramDraft,
                  placeholder: resolvedLoginShell,
                  applyLabel: "Apply",
                  isModified: normalizedDraft(commandProgramDraft) != settingsStore.settings.terminal.command.program,
                  canReset: settingsStore.settings.terminal.command.program != nil,
                  apply: applyCommandProgram,
                  reset: resetCommandProgram
                )
              }

              SettingsRowView(
                label: "Persistence Backend",
                description: persistenceBackendDescription
              ) {
                Picker("", selection: persistenceBackendBinding) {
                  ForEach(persistenceBackendOptions, id: \.self) { backend in
                    Text(backend.label).tag(backend)
                  }
                }
                .pickerStyle(.menu)
                .tint(theme.primaryTextColor)
                .frame(width: 160)
              }

              SettingsRowView(
                label: "Persistence Mode",
                description: persistenceModeDescription
              ) {
                Picker("", selection: persistenceModeBinding) {
                  ForEach(AppTerminalPersistenceMode.allCases) { mode in
                    Text(mode.label).tag(mode)
                  }
                }
                .pickerStyle(.menu)
                .tint(theme.primaryTextColor)
                .frame(width: 160)
              }

              SettingsRowView(
                label: "Executable Path",
                description: "Optional absolute path override for the persistence backend binary. Leave empty to use PATH."
              ) {
                SettingsOptionalTextFieldControl(
                  text: $persistenceExecutablePathDraft,
                  placeholder: "Use PATH lookup",
                  applyLabel: "Apply",
                  isModified: normalizedDraft(persistenceExecutablePathDraft) != settingsStore.settings.terminal.persistence.executablePath,
                  canReset: settingsStore.settings.terminal.persistence.executablePath != nil,
                  apply: applyPersistenceExecutablePath,
                  reset: resetPersistenceExecutablePath
                )
              }

              if settingsStore.settings.terminal.persistence.backend == .zellij {
                Text("zellij is represented in settings, but the workspace runtime still only supports tmux. Persistent shells will fail until zellij runtime support lands.")
                  .font(.system(size: 11))
                  .foregroundStyle(theme.warningColor)
                  .padding(.top, 8)
              }

              SettingsSectionHeader(title: "Providers")
                .id(Section.providers.id)
                .padding(.top, 32)

              VStack(alignment: .leading, spacing: 10) {
                Text("Connect local provider accounts through the bridge so agent surfaces can launch and resume without falling back to direct app-side auth.")
                  .font(.system(size: 12))
                  .foregroundStyle(theme.mutedColor)
                  .fixedSize(horizontal: false, vertical: true)

                ProviderAccountsSection(model: model)
              }
              .padding(.vertical, 10)

              SettingsSectionHeader(title: "Connection")
                .id(Section.connection.id)
                .padding(.top, 32)

              SettingsRowView(
                label: "Bridge",
                description: "Local process that connects the app to your workspaces."
              ) {
                HStack(spacing: 6) {
                  Circle()
                    .fill(model.bridgeClient != nil ? theme.successColor : theme.errorColor)
                    .frame(width: 7, height: 7)
                  Text(model.bridgeClient != nil ? "Connected" : "Disconnected")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(theme.primaryTextColor)
                }
              }
            }
            .frame(maxWidth: 480, alignment: .leading)
            .padding(.top, 8)
            .padding(.bottom, 60)
          }
        }
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(theme.shellBackground)
    .onAppear {
      syncDrafts()
      refreshProviderAuthStatusesIfNeeded()
    }
    .onChange(of: settingsStore.settings) { _ in
      syncDrafts()
    }
  }

  private var themeBinding: Binding<AppThemePreference> {
    Binding(
      get: { settingsStore.preference },
      set: { settingsStore.setThemePreference($0) }
    )
  }

  private var resolvedLoginShell: String {
    ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
  }

  private var themeDescription: String {
    if settingsStore.preference == .system {
      return "Following system appearance (\(settingsStore.resolvedTheme.appearance.rawValue))."
    }
    return "Color theme for the app shell and terminal surfaces."
  }

  private var persistenceBackendOptions: [AppTerminalPersistenceBackend] {
    var options: [AppTerminalPersistenceBackend] = [.tmux]
    if settingsStore.settings.terminal.persistence.backend == .zellij {
      options.append(.zellij)
    }
    return options
  }

  private var persistenceBackendBinding: Binding<AppTerminalPersistenceBackend> {
    Binding(
      get: { settingsStore.settings.terminal.persistence.backend },
      set: { settingsStore.setTerminalPersistenceBackend($0) }
    )
  }

  private var persistenceModeBinding: Binding<AppTerminalPersistenceMode> {
    Binding(
      get: { settingsStore.settings.terminal.persistence.mode },
      set: { settingsStore.setTerminalPersistenceMode($0) }
    )
  }

  private var persistenceBackendDescription: String {
    switch settingsStore.settings.terminal.persistence.backend {
    case .tmux:
      return "Persistence substrate for interactive terminal sessions. tmux is the only runtime currently supported."
    case .zellij:
      return "Selected in settings, but not wired through the workspace runtime yet."
    }
  }

  private var persistenceModeDescription: String {
    switch settingsStore.settings.terminal.persistence.mode {
    case .managed:
      return "Lifecycle uses its own isolated persistence profile instead of inheriting your tmux config."
    case .inherit:
      return "Lifecycle uses your existing tmux environment and config."
    }
  }

  private func syncDrafts() {
    commandProgramDraft = settingsStore.settings.terminal.command.program ?? ""
    persistenceExecutablePathDraft = settingsStore.settings.terminal.persistence.executablePath ?? ""
  }

  private func applyCommandProgram() {
    settingsStore.setTerminalCommandProgram(normalizedDraft(commandProgramDraft))
  }

  private func resetCommandProgram() {
    commandProgramDraft = ""
    settingsStore.setTerminalCommandProgram(nil)
  }

  private func applyPersistenceExecutablePath() {
    settingsStore.setTerminalPersistenceExecutablePath(normalizedDraft(persistenceExecutablePathDraft))
  }

  private func resetPersistenceExecutablePath() {
    persistenceExecutablePathDraft = ""
    settingsStore.setTerminalPersistenceExecutablePath(nil)
  }

  private func normalizedDraft(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  private func refreshProviderAuthStatusesIfNeeded() {
    for provider in BridgeAgentProvider.allCases {
      model.refreshProviderAuthStatus(for: provider, force: false)
    }
  }
}

// MARK: - Section Header

private struct SettingsSectionHeader: View {
  @Environment(\.appTheme) private var theme
  let title: String

  var body: some View {
    Text(title.uppercased())
      .font(.system(size: 11, weight: .semibold, design: .monospaced))
      .tracking(1)
      .foregroundStyle(theme.mutedColor)
      .padding(.top, 20)
      .padding(.bottom, 8)
  }
}

// MARK: - Settings Row

private struct SettingsRowView<Control: View>: View {
  @Environment(\.appTheme) private var theme
  let label: String
  let description: String
  @ViewBuilder let control: () -> Control

  var body: some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(theme.primaryTextColor)

        Text(description)
          .font(.system(size: 12))
          .foregroundStyle(theme.mutedColor)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      control()
        .fixedSize()
    }
    .padding(.vertical, 10)
  }
}

private struct SettingsOptionalTextFieldControl: View {
  @Binding var text: String
  let placeholder: String
  let applyLabel: String
  let isModified: Bool
  let canReset: Bool
  let apply: () -> Void
  let reset: () -> Void

  var body: some View {
    HStack(spacing: 8) {
      LCTextInput(text: $text, placeholder: placeholder, width: 220, onSubmit: apply)

      LCButton(label: applyLabel, variant: .ghost, size: .small, action: apply)
        .disabled(!isModified)

      if canReset {
        LCButton(label: "Reset", variant: .ghost, size: .small, action: reset)
      }
    }
  }
}

private struct ProviderAccountsSection: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(spacing: 10) {
      ForEach(BridgeAgentProvider.allCases) { provider in
        ProviderAccountCard(
          provider: provider,
          status: model.providerAuthStatus(for: provider),
          action: {
            model.loginProviderAuth(provider)
          }
        )
      }
    }
  }
}

private struct ProviderAccountCard: View {
  @Environment(\.appTheme) private var theme

  let provider: BridgeAgentProvider
  let status: BridgeProviderAuthStatus
  let action: () -> Void

  private var actionLabel: String {
    providerAccountActionLabel(for: status)
  }

  private var shouldShowAction: Bool {
    providerAccountShouldShowAction(for: status)
  }

  private var statusColor: Color {
    switch status.state {
    case .authenticated:
      theme.successColor
    case .error:
      theme.errorColor
    case .notChecked, .checking, .authenticating, .unauthenticated:
      theme.mutedColor
    }
  }

  private var statusText: String {
    providerAccountStatusText(for: status)
  }

  var body: some View {
    HStack(spacing: 12) {
      ZStack {
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(theme.mutedColor.opacity(0.12))

        Image(systemName: provider.iconName)
          .font(.system(size: 14, weight: .medium))
          .foregroundStyle(theme.primaryTextColor)
      }
      .frame(width: 34, height: 34)

      VStack(alignment: .leading, spacing: 3) {
        Text(provider.label)
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        Text(statusText)
          .font(.system(size: 11, weight: .medium))
          .foregroundStyle(statusColor)
          .lineLimit(2)
          .fixedSize(horizontal: false, vertical: true)
      }

      Spacer(minLength: 12)

      if status.state == .checking || status.state == .authenticating {
        ProgressView()
          .controlSize(.small)
      } else if shouldShowAction {
        Button(action: action) {
          Text(actionLabel)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
              RoundedRectangle(cornerRadius: 7, style: .continuous)
                .fill(theme.mutedColor.opacity(0.12))
            )
        }
        .buttonStyle(.plain)
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .background(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .fill(theme.surfaceBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 10, style: .continuous)
        .stroke(theme.borderColor, lineWidth: 1)
    )
  }
}

func providerAccountShouldShowAction(for status: BridgeProviderAuthStatus) -> Bool {
  switch status.state {
  case .unauthenticated, .error:
    return true
  case .notChecked, .checking, .authenticating, .authenticated:
    return false
  }
}

func providerAccountActionLabel(for status: BridgeProviderAuthStatus) -> String {
  status.state == .error ? "Retry" : "Sign In"
}

func providerAccountStatusText(for status: BridgeProviderAuthStatus) -> String {
  switch status.state {
  case .notChecked:
    return "Waiting for status..."
  case .checking:
    return "Checking local account..."
  case .authenticating:
    return status.output?.last ?? "Signing in... check your browser"
  case .authenticated:
    if let email = status.email, !email.isEmpty {
      return "Connected as \(email)"
    }
    if let organization = status.organization, !organization.isEmpty {
      return "Connected to \(organization)"
    }
    return "Connected"
  case .unauthenticated:
    return "Not connected"
  case .error:
    return status.message ?? "Authentication failed."
  }
}
