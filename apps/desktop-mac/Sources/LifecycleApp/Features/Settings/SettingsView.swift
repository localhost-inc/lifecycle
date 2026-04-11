import SwiftUI

private enum SettingsViewSection: String, CaseIterable, Identifiable {
  case appearance = "Appearance"
  case terminal = "Terminal"
  case connection = "Connection"

  var id: String { rawValue }
}

private let settingsBuiltInTerminalProfileIDs = ["shell", "claude", "codex"]

struct SettingsView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.dismiss) private var dismiss
  @ObservedObject var model: AppModel
  @ObservedObject var settingsStore: AppSettingsStore

  @Namespace private var sectionIndicator
  @State private var activeSection: SettingsViewSection = .appearance
  @State private var activeTerminalProfileID = "shell"
  @State private var commandProgramDraft = ""
  @State private var persistenceExecutablePathDraft = ""
  @State private var claudeModelDraft = ""
  @State private var codexModelDraft = ""
  @State private var codexConfigProfileDraft = ""

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
        .lcPointerCursor()

        Spacer()
      }
      .padding(.leading, 20)
      .padding(.top, 52)

      ScrollViewReader { proxy in
        VStack(alignment: .leading, spacing: 0) {
          // Header
          VStack(alignment: .leading, spacing: 4) {
            Text("Settings")
              .font(.system(size: 22, weight: .semibold))
              .foregroundStyle(theme.primaryTextColor)

            Text("Manage appearance, terminal, and connection preferences.")
              .font(.system(size: 13))
              .foregroundStyle(theme.mutedColor)
          }
          .frame(maxWidth: 760, alignment: .leading)
          .padding(.top, 24)
          .padding(.bottom, 20)

          HStack(alignment: .top, spacing: 28) {
            SettingsSectionRail(
              activeSection: activeSection,
              namespace: sectionIndicator
            ) { section in
              withAnimation(.easeInOut(duration: 0.25)) {
                activeSection = section
              }
              withAnimation(.easeInOut(duration: 0.2)) {
                proxy.scrollTo(section.id, anchor: .top)
              }
            }
            .frame(width: 156)
            .padding(.top, 8)

            LCScrollSpy(
              activeSelection: $activeSection,
              sections: SettingsViewSection.allCases
            ) { scrollSpySpace in
              VStack(alignment: .leading, spacing: 0) {
                trackedSectionHeader(.appearance, in: scrollSpySpace)

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
                  .lcPointerCursor()
                }

                if let errorMessage = settingsStore.errorMessage {
                  Text(errorMessage)
                    .font(.system(size: 11))
                    .foregroundStyle(theme.errorColor)
                    .padding(.top, 8)
                }

                trackedSectionHeader(.terminal, in: scrollSpySpace)
                  .padding(.top, 32)

                terminalRuntimeSection

                trackedSectionHeader(.connection, in: scrollSpySpace)
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

                Color.clear
                  .frame(height: 1)
                  .lcScrollSpyContentBottom(in: scrollSpySpace)
              }
              .frame(maxWidth: 560, alignment: .leading)
              .padding(.top, 8)
              .padding(.bottom, 60)
            }
          }
          .frame(maxWidth: 760, alignment: .leading)
        }
        .frame(maxWidth: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .background(theme.shellBackground)
    .onAppear {
      syncDrafts()
      syncActiveTerminalProfileSelection()
    }
    .onChange(of: settingsStore.settings) { _ in
      syncDrafts()
      syncActiveTerminalProfileSelection()
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

  private var defaultTerminalProfileBinding: Binding<String> {
    Binding(
      get: { settingsStore.settings.terminal.defaultProfile },
      set: { settingsStore.setTerminalDefaultProfile($0) }
    )
  }

  private var claudePermissionModeBinding: Binding<AppClaudePermissionMode?> {
    Binding(
      get: { claudeProfileSettings.permissionMode },
      set: { settingsStore.setClaudeTerminalPermissionMode($0) }
    )
  }

  private var claudeEffortBinding: Binding<AppClaudeEffort?> {
    Binding(
      get: { claudeProfileSettings.effort },
      set: { settingsStore.setClaudeTerminalEffort($0) }
    )
  }

  private var codexApprovalPolicyBinding: Binding<AppCodexApprovalPolicy?> {
    Binding(
      get: { codexProfileSettings.approvalPolicy },
      set: { settingsStore.setCodexTerminalApprovalPolicy($0) }
    )
  }

  private var codexSandboxModeBinding: Binding<AppCodexSandboxMode?> {
    Binding(
      get: { codexProfileSettings.sandboxMode },
      set: { settingsStore.setCodexTerminalSandboxMode($0) }
    )
  }

  private var codexReasoningEffortBinding: Binding<AppCodexReasoningEffort?> {
    Binding(
      get: { codexProfileSettings.reasoningEffort },
      set: { settingsStore.setCodexTerminalReasoningEffort($0) }
    )
  }

  private var codexWebSearchBinding: Binding<AppCodexWebSearchMode?> {
    Binding(
      get: { codexProfileSettings.webSearch },
      set: { settingsStore.setCodexTerminalWebSearch($0) }
    )
  }

  private var terminalRuntimeSection: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsSubsectionHeader(title: "Runtime")

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
        .lcPointerCursor()
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
        .lcPointerCursor()
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

      SettingsSubsectionHeader(title: "Profiles")
        .padding(.top, 18)

      VStack(alignment: .leading, spacing: 12) {
        Text("Profiles control what a new terminal launches. Select one below to configure it.")
          .font(.system(size: 12))
          .foregroundStyle(theme.mutedColor)
          .fixedSize(horizontal: false, vertical: true)

        SettingsRowView(
          label: "Default Profile",
          description: "Used when opening a new terminal."
        ) {
          Picker("", selection: defaultTerminalProfileBinding) {
            ForEach(orderedTerminalProfileOptions) { profile in
              Text(profile.displayLabel).tag(profile.id)
            }
          }
          .pickerStyle(.menu)
          .tint(theme.primaryTextColor)
          .frame(width: 180)
          .lcPointerCursor()
        }

        if let activeTerminalProfile {
          VStack(alignment: .leading, spacing: 0) {
            terminalProfileTabs

            terminalProfileContent(for: activeTerminalProfile)
          }
        }
      }
      .padding(.vertical, 10)
    }
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

  private var orderedTerminalProfileOptions: [AppTerminalProfile] {
    orderedTerminalProfiles(settingsStore.settings.terminal.profiles)
  }

  private var activeTerminalProfile: AppTerminalProfile? {
    settingsStore.settings.terminal.profiles[activeTerminalProfileID] ?? orderedTerminalProfileOptions.first
  }

  private var claudeProfileSettings: AppClaudeTerminalProfileSettings {
    settingsStore.settings.terminal.profiles["claude"]?.claudeSettings ?? AppClaudeTerminalProfileSettings()
  }

  private var codexProfileSettings: AppCodexTerminalProfileSettings {
    settingsStore.settings.terminal.profiles["codex"]?.codexSettings ?? AppCodexTerminalProfileSettings()
  }

  private var terminalProfileTabs: some View {
    HStack(spacing: 2) {
      ForEach(orderedTerminalProfileOptions) { profile in
        Button {
          withAnimation(.easeInOut(duration: 0.18)) {
            activeTerminalProfileID = profile.id
          }
        } label: {
          Text(profile.displayLabel)
            .font(.system(size: 12, weight: activeTerminalProfileID == profile.id ? .semibold : .regular))
            .foregroundStyle(activeTerminalProfileID == profile.id ? theme.primaryTextColor : theme.mutedColor)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
              RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(activeTerminalProfileID == profile.id ? theme.surfaceRaised : Color.clear)
            )
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
      }
    }
    .padding(3)
    .background(
      RoundedRectangle(cornerRadius: 9, style: .continuous)
        .fill(theme.surfaceBackground)
    )
    .overlay(
      RoundedRectangle(cornerRadius: 9, style: .continuous)
        .stroke(theme.borderColor.opacity(0.5), lineWidth: 1)
    )
  }

  private func terminalProfileSubtitle(for profile: AppTerminalProfile) -> String {
    switch profile.launcher {
    case .shell:
      return "Plain shell"
    case .claude:
      return "Claude Code"
    case .codex:
      return "OpenAI Codex"
    case .command:
      return "Custom command"
    }
  }

  @MainActor @ViewBuilder
  private func terminalProfileContent(for profile: AppTerminalProfile) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(terminalProfileDetailDescription(for: profile))
        .font(.system(size: 12))
        .foregroundStyle(theme.mutedColor)
        .padding(.top, 10)
        .padding(.bottom, 4)

      switch profile.launcher {
      case .shell:
        shellTerminalProfileContent
      case .claude:
        claudeTerminalProfileContent
      case .codex:
        codexTerminalProfileContent
      case .command:
        commandTerminalProfileContent(for: profile)
      }
    }
  }

  private var shellTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsRowView(
        label: "Program",
        description: "Inherited from the Runtime command setting above.",
        stacked: true
      ) {
        SettingsReadOnlyValue(
          text: settingsStore.settings.terminal.command.program ?? resolvedLoginShell,
          monospaced: true
        )
      }

      SettingsRowView(
        label: "Persistence",
        description: "Inherited from the Runtime persistence settings above.",
        stacked: true
      ) {
        SettingsReadOnlyValue(
          text: "\(settingsStore.settings.terminal.persistence.backend.label) · \(settingsStore.settings.terminal.persistence.mode.label)"
        )
      }
    }
  }

  private var claudeTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsRowView(
        label: "Model",
        description: "Override the default model. Leave empty for the CLI default.",
        stacked: true
      ) {
        SettingsOptionalTextFieldControl(
          text: $claudeModelDraft,
          placeholder: "Use CLI default",
          applyLabel: "Apply",
          isModified: normalizedDraft(claudeModelDraft) != claudeProfileSettings.model,
          canReset: claudeProfileSettings.model != nil,
          apply: applyClaudeModel,
          reset: resetClaudeModel
        )
      }

      SettingsRowView(
        label: "Permission Mode",
        description: "Controls what Claude can do without asking first.",
        stacked: true
      ) {
        Picker("", selection: claudePermissionModeBinding) {
          Text("CLI Default").tag(Optional<AppClaudePermissionMode>.none)
          ForEach(AppClaudePermissionMode.allCases) { mode in
            Text(mode.label).tag(Optional(mode))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }

      SettingsRowView(
        label: "Effort",
        description: "How much compute Claude uses per response.",
        stacked: true
      ) {
        Picker("", selection: claudeEffortBinding) {
          Text("CLI Default").tag(Optional<AppClaudeEffort>.none)
          ForEach(AppClaudeEffort.allCases) { effort in
            Text(effort.label).tag(Optional(effort))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }
    }
  }

  private var codexTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsRowView(
        label: "Model",
        description: "Override the default model. Leave empty for the CLI default.",
        stacked: true
      ) {
        SettingsOptionalTextFieldControl(
          text: $codexModelDraft,
          placeholder: "Use CLI default",
          applyLabel: "Apply",
          isModified: normalizedDraft(codexModelDraft) != codexProfileSettings.model,
          canReset: codexProfileSettings.model != nil,
          apply: applyCodexModel,
          reset: resetCodexModel
        )
      }

      SettingsRowView(
        label: "Config Profile",
        description: "Named configuration profile to load on launch.",
        stacked: true
      ) {
        SettingsOptionalTextFieldControl(
          text: $codexConfigProfileDraft,
          placeholder: "Use CLI default",
          applyLabel: "Apply",
          isModified: normalizedDraft(codexConfigProfileDraft) != codexProfileSettings.configProfile,
          canReset: codexProfileSettings.configProfile != nil,
          apply: applyCodexConfigProfile,
          reset: resetCodexConfigProfile
        )
      }

      SettingsRowView(
        label: "Approval Policy",
        description: "Controls what Codex can do without asking first.",
        stacked: true
      ) {
        Picker("", selection: codexApprovalPolicyBinding) {
          Text("CLI Default").tag(Optional<AppCodexApprovalPolicy>.none)
          ForEach(AppCodexApprovalPolicy.allCases) { policy in
            Text(policy.label).tag(Optional(policy))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }

      SettingsRowView(
        label: "Sandbox",
        description: "Isolation level for code execution.",
        stacked: true
      ) {
        Picker("", selection: codexSandboxModeBinding) {
          Text("CLI Default").tag(Optional<AppCodexSandboxMode>.none)
          ForEach(AppCodexSandboxMode.allCases) { mode in
            Text(mode.label).tag(Optional(mode))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }

      SettingsRowView(
        label: "Reasoning",
        description: "How much reasoning Codex uses per response.",
        stacked: true
      ) {
        Picker("", selection: codexReasoningEffortBinding) {
          Text("CLI Default").tag(Optional<AppCodexReasoningEffort>.none)
          ForEach(AppCodexReasoningEffort.allCases) { effort in
            Text(effort.label).tag(Optional(effort))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }

      SettingsRowView(
        label: "Web Search",
        description: "Whether Codex can search the web.",
        stacked: true
      ) {
        Picker("", selection: codexWebSearchBinding) {
          Text("CLI Default").tag(Optional<AppCodexWebSearchMode>.none)
          ForEach(AppCodexWebSearchMode.allCases) { mode in
            Text(mode.label).tag(Optional(mode))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .frame(width: 180)
        .lcPointerCursor()
      }
    }
  }

  @MainActor @ViewBuilder
  private func commandTerminalProfileContent(for profile: AppTerminalProfile) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsRowView(
        label: "Program",
        description: "The executable this profile launches.",
        stacked: true
      ) {
        SettingsReadOnlyValue(
          text: profile.command?.program ?? "No command configured",
          monospaced: true
        )
      }

      SettingsRowView(
        label: "Arguments",
        description: "Passed to the program on launch.",
        stacked: true
      ) {
        SettingsReadOnlyValue(
          text: profile.command?.args.joined(separator: " ") ?? "No arguments",
          monospaced: true
        )
      }

      SettingsRowView(
        label: "Environment",
        description: "Extra variables set before launch.",
        stacked: true
      ) {
        SettingsReadOnlyValue(
          text: commandProfileEnvironmentSummary(profile.command?.env ?? [:]),
          monospaced: true
        )
      }

      Text("Custom command profiles already launch correctly from settings. Inline editing for arbitrary command profiles is not wired into the app yet.")
        .font(.system(size: 11))
        .foregroundStyle(theme.mutedColor)
        .padding(.top, 10)
    }
  }

  private func terminalProfileDetailDescription(for profile: AppTerminalProfile) -> String {
    switch profile.launcher {
    case .shell:
      return "Opens your default shell with the runtime settings above."
    case .claude:
      return "Opens Claude Code with the settings below."
    case .codex:
      return "Opens Codex with the settings below."
    case .command:
      return "Runs a custom command defined in your settings file."
    }
  }

  private func syncDrafts() {
    commandProgramDraft = settingsStore.settings.terminal.command.program ?? ""
    persistenceExecutablePathDraft = settingsStore.settings.terminal.persistence.executablePath ?? ""
    claudeModelDraft = claudeProfileSettings.model ?? ""
    codexModelDraft = codexProfileSettings.model ?? ""
    codexConfigProfileDraft = codexProfileSettings.configProfile ?? ""
  }

  private func syncActiveTerminalProfileSelection() {
    activeTerminalProfileID = resolvedTerminalProfileSelection(
      currentProfileID: activeTerminalProfileID,
      defaultProfileID: settingsStore.settings.terminal.defaultProfile,
      profiles: orderedTerminalProfileOptions
    )
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

  private func applyClaudeModel() {
    settingsStore.setClaudeTerminalModel(normalizedDraft(claudeModelDraft))
  }

  private func resetClaudeModel() {
    claudeModelDraft = ""
    settingsStore.setClaudeTerminalModel(nil)
  }

  private func applyCodexModel() {
    settingsStore.setCodexTerminalModel(normalizedDraft(codexModelDraft))
  }

  private func resetCodexModel() {
    codexModelDraft = ""
    settingsStore.setCodexTerminalModel(nil)
  }

  private func applyCodexConfigProfile() {
    settingsStore.setCodexTerminalConfigProfile(normalizedDraft(codexConfigProfileDraft))
  }

  private func resetCodexConfigProfile() {
    codexConfigProfileDraft = ""
    settingsStore.setCodexTerminalConfigProfile(nil)
  }

  private func normalizedDraft(_ value: String) -> String? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
  }

  @MainActor @ViewBuilder
  private func trackedSectionHeader(
    _ section: SettingsViewSection,
    in scrollSpySpace: Namespace.ID
  ) -> some View {
    SettingsSectionHeader(title: section.rawValue)
      .id(section.id)
      .lcScrollSpyTarget(section, in: scrollSpySpace)
  }
}

func orderedTerminalProfiles(_ profiles: [String: AppTerminalProfile]) -> [AppTerminalProfile] {
  profiles.values.sorted { lhs, rhs in
    let lhsBuiltInIndex = settingsBuiltInTerminalProfileIDs.firstIndex(of: lhs.id)
    let rhsBuiltInIndex = settingsBuiltInTerminalProfileIDs.firstIndex(of: rhs.id)

    switch (lhsBuiltInIndex, rhsBuiltInIndex) {
    case let (.some(lhsIndex), .some(rhsIndex)) where lhsIndex != rhsIndex:
      return lhsIndex < rhsIndex
    case (.some, nil):
      return true
    case (nil, .some):
      return false
    default:
      let labelComparison = lhs.displayLabel.localizedCaseInsensitiveCompare(rhs.displayLabel)
      if labelComparison != .orderedSame {
        return labelComparison == .orderedAscending
      }
      return lhs.id < rhs.id
    }
  }
}

func resolvedTerminalProfileSelection(
  currentProfileID: String,
  defaultProfileID: String,
  profiles: [AppTerminalProfile]
) -> String {
  let availableIDs = Set(profiles.map(\.id))
  if availableIDs.contains(currentProfileID) {
    return currentProfileID
  }
  if availableIDs.contains(defaultProfileID) {
    return defaultProfileID
  }
  return profiles.first?.id ?? "shell"
}

func commandProfileEnvironmentSummary(_ environment: [String: String]) -> String {
  guard !environment.isEmpty else {
    return "No overrides"
  }

  return environment.keys.sorted().map { key in
    let value = environment[key] ?? ""
    return "\(key)=\(value)"
  }.joined(separator: "\n")
}

// MARK: - Section Header

private struct SettingsSectionRail: View {
  @Environment(\.appTheme) private var theme

  let activeSection: SettingsViewSection
  let namespace: Namespace.ID
  let action: (SettingsViewSection) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("SECTIONS")
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .tracking(1)
        .foregroundStyle(theme.mutedColor)
        .padding(.bottom, 4)

      ForEach(SettingsViewSection.allCases) { section in
        SettingsRailButton(
          title: section.rawValue,
          subtitle: nil,
          badgeText: nil,
          isActive: activeSection == section,
          namespace: namespace
        ) {
          action(section)
        }
      }
    }
  }
}

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

private struct SettingsSubsectionHeader: View {
  @Environment(\.appTheme) private var theme
  let title: String

  var body: some View {
    Text(title.uppercased())
      .font(.system(size: 10, weight: .semibold, design: .monospaced))
      .tracking(1)
      .foregroundStyle(theme.mutedColor)
      .padding(.bottom, 6)
  }
}

private struct SettingsRailButton: View {
  @Environment(\.appTheme) private var theme

  let title: String
  let subtitle: String?
  let badgeText: String?
  let isActive: Bool
  let namespace: Namespace.ID
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(alignment: .top, spacing: 10) {
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.system(size: 13, weight: isActive ? .semibold : .medium))
            .foregroundStyle(isActive ? theme.primaryTextColor : theme.mutedColor)

          if let subtitle {
            Text(subtitle)
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(isActive ? theme.mutedColor : theme.mutedColor.opacity(0.84))
          }
        }

        Spacer(minLength: 8)

        if let badgeText {
          SettingsInfoBadge(text: badgeText)
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        if isActive {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(theme.surfaceRaised)
            .matchedGeometryEffect(id: "settings-rail-selection", in: namespace)
        }
      }
      .overlay {
        RoundedRectangle(cornerRadius: 10, style: .continuous)
          .stroke(isActive ? theme.borderColor : Color.clear)
      }
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
  }
}

// MARK: - Settings Row

private struct SettingsRowView<Control: View>: View {
  @Environment(\.appTheme) private var theme
  let label: String
  let description: String
  var stacked: Bool = false
  @ViewBuilder let control: () -> Control

  var body: some View {
    HStack(alignment: .center, spacing: 16) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.system(size: stacked ? 13 : 14, weight: .medium))
          .foregroundStyle(theme.primaryTextColor)

        Text(description)
          .font(.system(size: stacked ? 11 : 12))
          .foregroundStyle(theme.mutedColor)
          .fixedSize(horizontal: false, vertical: true)
      }
      .frame(maxWidth: .infinity, alignment: .leading)

      control()
        .fixedSize()
    }
    .padding(.vertical, stacked ? 8 : 10)
  }
}

private struct SettingsInfoBadge: View {
  @Environment(\.appTheme) private var theme
  let text: String

  var body: some View {
    Text(text)
      .font(.system(size: 10, weight: .semibold, design: .monospaced))
      .foregroundStyle(theme.mutedColor)
      .padding(.horizontal, 8)
      .padding(.vertical, 4)
      .background(
        Capsule(style: .continuous)
          .fill(theme.mutedColor.opacity(0.12))
      )
  }
}

private struct SettingsReadOnlyValue: View {
  @Environment(\.appTheme) private var theme
  let text: String
  var monospaced: Bool = false

  var body: some View {
    Text(text)
      .font(.system(size: 11, weight: .medium, design: monospaced ? .monospaced : .default))
      .foregroundStyle(theme.primaryTextColor)
      .multilineTextAlignment(.trailing)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(theme.surfaceRaised)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .stroke(theme.borderColor, lineWidth: 1)
      )
      .frame(maxWidth: 240, alignment: .trailing)
      .fixedSize(horizontal: false, vertical: true)
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
