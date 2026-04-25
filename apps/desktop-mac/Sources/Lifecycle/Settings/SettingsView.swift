import SwiftUI

enum SettingsViewSection: String, CaseIterable, Identifiable {
  case appearance = "Appearance"
  case terminal = "Terminal"
  case connection = "Connection"
  case developer = "Developer"

  var id: String { rawValue }

  var systemImage: String {
    switch self {
    case .appearance:
      "paintpalette"
    case .terminal:
      "terminal"
    case .connection:
      "bolt.horizontal.circle"
    case .developer:
      "wrench.and.screwdriver"
    }
  }
}

func visibleSettingsSections(isDeveloperMode: Bool) -> [SettingsViewSection] {
  var sections: [SettingsViewSection] = [.appearance, .terminal, .connection]
  if isDeveloperMode {
    sections.append(.developer)
  }
  return sections
}

private let settingsBuiltInTerminalProfileIDs = ["shell", "claude", "codex", "opencode"]

private enum SettingsLayout {
  static let contentMaxWidth: CGFloat = 720
  static let cardHorizontalPadding: CGFloat = 28
  static let cardVerticalPadding: CGFloat = 28
  static let sectionSpacing: CGFloat = 32
  static let subsectionSpacing: CGFloat = 18
  static let rowHorizontalPadding: CGFloat = 18
  static let rowVerticalPadding: CGFloat = 12
  static let stackedRowVerticalPadding: CGFloat = 10
  static let groupCornerRadius: CGFloat = 12
}

struct SettingsView: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.dismiss) private var dismiss
  @ObservedObject var model: AppModel
  @ObservedObject var settingsStore: AppSettingsStore

  @Namespace private var sectionIndicator
  @State private var activeSection: SettingsViewSection = .appearance
  @State private var activeTerminalProfileID = "shell"
  @State private var uiFontDraft = AppTypography.defaultUIFontName
  @State private var codeFontDraft = AppTypography.defaultCodeFontName
  @State private var commandProgramDraft = ""
  @State private var persistenceExecutablePathDraft = ""
  @State private var claudeModelDraft = ""
  @State private var codexModelDraft = ""
  @State private var codexConfigProfileDraft = ""

  var body: some View {
    let sections = visibleSettingsSections(isDeveloperMode: settingsStore.isDeveloperMode)

    ScrollViewReader { proxy in
      HStack(spacing: 0) {
        SettingsSidebar(
          sections: sections,
          activeSection: activeSection,
          namespace: sectionIndicator,
          dismiss: dismiss
        ) { section in
          withAnimation(.easeInOut(duration: 0.25)) {
            activeSection = section
          }
          withAnimation(.easeInOut(duration: 0.2)) {
            proxy.scrollTo(section.id, anchor: .top)
          }
        }
        .frame(width: 228)

        VStack(spacing: 0) {
          SettingsContentCard {
            LCScrollSpy(
              activeSelection: $activeSection,
              sections: sections,
              activationOffset: 120,
              showsIndicators: true
            ) { scrollSpySpace in
              VStack(alignment: .leading, spacing: SettingsLayout.sectionSpacing) {
                if let errorMessage = settingsStore.errorMessage {
                  SettingsStatusBanner(
                    message: errorMessage,
                    tint: theme.errorColor,
                    systemImage: "exclamationmark.circle.fill"
                  )
                }

                SettingsFormSection(
                  title: "Appearance",
                  description: "Choose the theme used for the app chrome and terminal surfaces."
                ) {
                  SettingsFormGroup {
                    SettingsFormRow(
                      label: "Theme",
                      description: themeDescription,
                      showsDivider: true
                    ) {
                      Picker("", selection: themeBinding) {
                        ForEach(AppThemePreference.allCases) { option in
                          Text(option.label).tag(option)
                        }
                      }
                      .pickerStyle(.menu)
                      .tint(theme.primaryTextColor)
                      .lcPointerCursor()
                    }

                    SettingsFormRow(
                      label: "UI Font",
                      description: "Font family used for app chrome and interface text.",
                      stacked: true,
                      showsDivider: true
                    ) {
                      SettingsOptionalTextFieldControl(
                        text: $uiFontDraft,
                        placeholder: AppTypography.defaultUIFontName,
                        applyLabel: "Apply",
                        isModified: normalizedFontDraft(
                          uiFontDraft,
                          fallback: AppTypography.defaultUIFontName
                        ) != settingsStore.settings.appearance.fonts.ui,
                        canReset: settingsStore.settings.appearance.fonts.ui != AppTypography.defaultUIFontName,
                        apply: applyUIFont,
                        reset: resetUIFont
                      )
                    }

                    SettingsFormRow(
                      label: "Code Font",
                      description: "Font family used for terminal, logs, transcripts, and code-like text.",
                      stacked: true,
                      showsDivider: true
                    ) {
                      SettingsOptionalTextFieldControl(
                        text: $codeFontDraft,
                        placeholder: AppTypography.defaultCodeFontName,
                        applyLabel: "Apply",
                        isModified: normalizedFontDraft(
                          codeFontDraft,
                          fallback: AppTypography.defaultCodeFontName
                        ) != settingsStore.settings.appearance.fonts.code,
                        canReset: settingsStore.settings.appearance.fonts.code != AppTypography.defaultCodeFontName,
                        apply: applyCodeFont,
                        reset: resetCodeFont
                      )
                    }

                    SettingsFormRow(
                      label: "Dim inactive panes",
                      description: "Reduce inactive workspace pane opacity until the pane is focused or hovered.",
                      showsDivider: false
                    ) {
                      Toggle("", isOn: dimInactivePanesBinding)
                        .labelsHidden()
                        .toggleStyle(.switch)
                        .tint(theme.accentColor)
                    }

                    if settingsStore.settings.appearance.dimInactivePanes {
                      SettingsNestedFormRow(
                        label: "Dim opacity",
                        description: "Opacity used for inactive panes."
                      ) {
                        SettingsOpacitySlider(
                          value: inactivePaneOpacityBinding,
                          range: 0.2...1
                        )
                      }
                    }
                  }
                }
                .id(SettingsViewSection.appearance.id)
                .lcScrollSpyTarget(SettingsViewSection.appearance, in: scrollSpySpace)

                SettingsFormSection(
                  title: "Terminal",
                  description: "Set launch defaults for new terminals and tune per-profile overrides."
                ) {
                  VStack(alignment: .leading, spacing: SettingsLayout.subsectionSpacing) {
                    SettingsFormSubsectionHeader(
                      title: "Runtime",
                      description: "Defaults shared by direct shell sessions and persistent terminals."
                    )
                    SettingsFormGroup {
                      terminalRuntimeCardContent
                    }

                    SettingsFormSubsectionHeader(
                      title: "Profiles",
                      description: "Choose the default launcher and adjust built-in profile behavior."
                    )
                    SettingsFormGroup {
                      terminalProfilesCardContent
                    }
                  }
                }
                .id(SettingsViewSection.terminal.id)
                .lcScrollSpyTarget(SettingsViewSection.terminal, in: scrollSpySpace)

                SettingsFormSection(
                  title: "Connection",
                  description: "Check the local bridge that powers workspace state, shell attach, and terminal lifecycle."
                ) {
                  SettingsFormGroup {
                    SettingsFormRow(
                      label: "Local Bridge",
                      description: "Required for workspace state, shell attach, and terminal orchestration."
                    ) {
                      HStack(spacing: 6) {
                        Circle()
                          .fill(model.bridgeClient != nil ? theme.successColor : theme.errorColor)
                          .frame(width: 7, height: 7)
                        Text(model.bridgeClient != nil ? "Connected" : "Disconnected")
                          .font(.lc(size: 12, weight: .medium))
                          .foregroundStyle(theme.primaryTextColor)
                      }
                    }
                  }
                }
                .id(SettingsViewSection.connection.id)
                .lcScrollSpyTarget(SettingsViewSection.connection, in: scrollSpySpace)

                if settingsStore.isDeveloperMode {
                  SettingsFormSection(
                    title: "Developer",
                    description: "Desktop-only switches for testing flows without mutating your local repositories."
                  ) {
                    SettingsFormGroup {
                      SettingsFormRow(
                        label: "Show onboarding",
                        description: "Force the welcome flow even when repositories already exist, so you can exercise onboarding from a live dev build."
                      ) {
                        Toggle("", isOn: developerShowsOnboardingBinding)
                          .labelsHidden()
                          .toggleStyle(.switch)
                          .tint(theme.accentColor)
                      }
                    }
                  }
                  .id(SettingsViewSection.developer.id)
                  .lcScrollSpyTarget(SettingsViewSection.developer, in: scrollSpySpace)
                }

                Color.clear
                  .frame(height: 1)
                  .lcScrollSpyContentBottom(in: scrollSpySpace)
              }
              .frame(maxWidth: SettingsLayout.contentMaxWidth, alignment: .leading)
              .padding(.horizontal, SettingsLayout.cardHorizontalPadding)
              .padding(.vertical, SettingsLayout.cardVerticalPadding)
              .frame(maxWidth: .infinity, alignment: .center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
          }
          .padding(.horizontal, 10)
          .padding(.top, 10)
          .padding(.bottom, 10)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.shellBackground)
      }
    }
    .background(theme.shellBackground)
    .navigationBarBackButtonHidden()
    .ignoresSafeArea(.container, edges: .top)
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

  private var dimInactivePanesBinding: Binding<Bool> {
    Binding(
      get: { settingsStore.settings.appearance.dimInactivePanes },
      set: { settingsStore.setDimInactivePanes($0) }
    )
  }

  private var inactivePaneOpacityBinding: Binding<Double> {
    Binding(
      get: { settingsStore.settings.appearance.inactivePaneOpacity },
      set: { settingsStore.setInactivePaneOpacity($0) }
    )
  }

  private var resolvedLoginShell: String {
    ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
  }

  private var themeDescription: String {
    if settingsStore.preference == .system {
      return "Follows your current macOS appearance (\(settingsStore.resolvedTheme.appearance.rawValue.capitalized))."
    }
    return "Applied to the app chrome and terminal surfaces."
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

  private var developerShowsOnboardingBinding: Binding<Bool> {
    Binding(
      get: { settingsStore.settings.developer.showsOnboarding },
      set: { settingsStore.setDeveloperShowsOnboarding($0) }
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

  private var codexYoloModeBinding: Binding<Bool> {
    Binding(
      get: {
        codexProfileSettings.approvalPolicy == .never
          && codexProfileSettings.sandboxMode == .dangerFullAccess
      },
      set: { settingsStore.setCodexTerminalYoloMode($0) }
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

  private var terminalRuntimeCardContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Command",
        description: "Program used for direct shell sessions. Leave empty to use your login shell.",
        showsDivider: true
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

      SettingsFormRow(
        label: "Persistence Backend",
        description: persistenceBackendDescription,
        showsDivider: true
      ) {
        Picker("", selection: persistenceBackendBinding) {
          ForEach(persistenceBackendOptions, id: \.self) { backend in
            Text(backend.label).tag(backend)
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
        label: "Persistence Mode",
        description: persistenceModeDescription,
        showsDivider: true
      ) {
        Picker("", selection: persistenceModeBinding) {
          ForEach(AppTerminalPersistenceMode.allCases) { mode in
            Text(mode.label).tag(mode)
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
        label: "Executable Path",
        description: "Absolute path to the persistence binary. Leave empty to resolve it from PATH."
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
        SettingsFormContentBlock {
          SettingsInlineNote(
            message: "zellij can be selected here, but persistent terminals still launch through tmux today.",
            tone: .warning
          )
        }
      }
    }
  }

  private var terminalProfilesCardContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Default Profile",
        description: "Used when you open a new terminal from the app.",
        showsDivider: true
      ) {
        Picker("", selection: defaultTerminalProfileBinding) {
          ForEach(orderedTerminalProfileOptions) { profile in
            Text(profile.displayLabel).tag(profile.id)
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      if let activeTerminalProfile {
        SettingsFormContentBlock(spacing: 14) {
          terminalProfileTabs
          terminalProfileContent(for: activeTerminalProfile)
        }
      }
    }
  }

  private var persistenceBackendDescription: String {
    switch settingsStore.settings.terminal.persistence.backend {
    case .tmux:
      return "Keeps interactive terminals restorable across app launches. tmux is the only backend wired into the runtime today."
    case .zellij:
      return "zellij appears in settings, but the workspace runtime still launches persistent terminals through tmux."
    }
  }

  private var persistenceModeDescription: String {
    switch settingsStore.settings.terminal.persistence.mode {
    case .managed:
      return "Lifecycle keeps tmux isolated so your personal sessions and config stay untouched."
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
          HStack(spacing: 7) {
            AppIconView(
              name: AppIconName.profileIconName(for: profile.launcher.rawValue),
              size: 13,
              color: activeTerminalProfileID == profile.id ? theme.primaryTextColor : theme.mutedColor
            )

            Text(profile.displayLabel)
              .font(.lc(size: 12, weight: activeTerminalProfileID == profile.id ? .semibold : .regular))
              .foregroundStyle(activeTerminalProfileID == profile.id ? theme.primaryTextColor : theme.mutedColor)
          }
          .padding(.horizontal, 14)
          .padding(.vertical, 6)
          .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
              .fill(activeTerminalProfileID == profile.id ? theme.surfaceRaised : Color.clear)
          )
          .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
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

  @MainActor @ViewBuilder
  private func terminalProfileContent(for profile: AppTerminalProfile) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(terminalProfileDetailDescription(for: profile))
        .font(.lc(size: 12))
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
      case .opencode:
        opencodeTerminalProfileContent
      case .command:
        commandTerminalProfileContent(for: profile)
      }
    }
  }

  private var shellTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Program",
        description: "Inherited from the Runtime command setting above.",
        stacked: true,
        showsDivider: true
      ) {
        SettingsReadOnlyValue(
          text: settingsStore.settings.terminal.command.program ?? resolvedLoginShell,
          monospaced: true
        )
      }

      SettingsFormRow(
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

  private var opencodeTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Program",
        description: "Launches the OpenCode CLI in the selected workspace.",
        stacked: true
      ) {
        SettingsReadOnlyValue(text: "opencode", monospaced: true)
      }
    }
  }

  private var claudeTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Model",
        description: "Override the default model. Leave empty for the CLI default.",
        stacked: true,
        showsDivider: true
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

      SettingsFormRow(
        label: "Permission Mode",
        description: "Controls what Claude can do without asking first.",
        stacked: true,
        showsDivider: true
      ) {
        Picker("", selection: claudePermissionModeBinding) {
          Text("CLI Default").tag(Optional<AppClaudePermissionMode>.none)
          ForEach(AppClaudePermissionMode.allCases) { mode in
            Text(mode.label).tag(Optional(mode))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
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
        .lcPointerCursor()
      }
    }
  }

  private var codexTerminalProfileContent: some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Model",
        description: "Override the default model. Leave empty for the CLI default.",
        stacked: true,
        showsDivider: true
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

      SettingsFormRow(
        label: "Config Profile",
        description: "Named configuration profile to load on launch.",
        stacked: true,
        showsDivider: true
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

      SettingsFormRow(
        label: "Approval Policy",
        description: "Controls what Codex can do without asking first.",
        stacked: true,
        showsDivider: true
      ) {
        Picker("", selection: codexApprovalPolicyBinding) {
          Text("CLI Default").tag(Optional<AppCodexApprovalPolicy>.none)
          ForEach(AppCodexApprovalPolicy.allCases) { policy in
            Text(policy.label).tag(Optional(policy))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
        label: "YOLO Mode",
        description: "Launches Codex with approval prompts and sandboxing bypassed.",
        showsDivider: true
      ) {
        Toggle("", isOn: codexYoloModeBinding)
          .toggleStyle(.switch)
          .labelsHidden()
          .tint(theme.primaryTextColor)
      }

      SettingsFormRow(
        label: "Sandbox",
        description: "Isolation level for code execution.",
        stacked: true,
        showsDivider: true
      ) {
        Picker("", selection: codexSandboxModeBinding) {
          Text("CLI Default").tag(Optional<AppCodexSandboxMode>.none)
          ForEach(AppCodexSandboxMode.allCases) { mode in
            Text(mode.label).tag(Optional(mode))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
        label: "Reasoning",
        description: "How much reasoning Codex uses per response.",
        stacked: true,
        showsDivider: true
      ) {
        Picker("", selection: codexReasoningEffortBinding) {
          Text("CLI Default").tag(Optional<AppCodexReasoningEffort>.none)
          ForEach(AppCodexReasoningEffort.allCases) { effort in
            Text(effort.label).tag(Optional(effort))
          }
        }
        .pickerStyle(.menu)
        .tint(theme.primaryTextColor)
        .lcPointerCursor()
      }

      SettingsFormRow(
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
        .lcPointerCursor()
      }
    }
  }

  @MainActor @ViewBuilder
  private func commandTerminalProfileContent(for profile: AppTerminalProfile) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      SettingsFormRow(
        label: "Program",
        description: "The executable this profile launches.",
        stacked: true,
        showsDivider: true
      ) {
        SettingsReadOnlyValue(
          text: profile.command?.program ?? "No command configured",
          monospaced: true
        )
      }

      SettingsFormRow(
        label: "Arguments",
        description: "Passed to the program on launch.",
        stacked: true,
        showsDivider: true
      ) {
        SettingsReadOnlyValue(
          text: profile.command?.args.joined(separator: " ") ?? "No arguments",
          monospaced: true
        )
      }

      SettingsFormRow(
        label: "Environment",
        description: "Extra variables set before launch.",
        stacked: true,
        showsDivider: true
      ) {
        SettingsReadOnlyValue(
          text: commandProfileEnvironmentSummary(profile.command?.env ?? [:]),
          monospaced: true
        )
      }

      SettingsFormContentBlock {
        SettingsInlineNote(
          message: "Custom command profiles can launch, but editing arbitrary command profiles still lives in the settings file.",
          tone: .info
        )
      }
    }
  }

  private func terminalProfileDetailDescription(for profile: AppTerminalProfile) -> String {
    switch profile.launcher {
    case .shell:
      return "Launches your shell using the runtime defaults above."
    case .claude:
      return "Starts Claude Code with the overrides below."
    case .codex:
      return "Starts Codex with the overrides below."
    case .opencode:
      return "Starts OpenCode in the selected workspace."
    case .command:
      return "Launches the custom command defined in your settings file."
    }
  }

  private func syncDrafts() {
    uiFontDraft = settingsStore.settings.appearance.fonts.ui
    codeFontDraft = settingsStore.settings.appearance.fonts.code
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

  private func applyUIFont() {
    settingsStore.setUIFont(
      normalizedFontDraft(uiFontDraft, fallback: AppTypography.defaultUIFontName)
    )
  }

  private func resetUIFont() {
    uiFontDraft = AppTypography.defaultUIFontName
    settingsStore.setUIFont(AppTypography.defaultUIFontName)
  }

  private func applyCodeFont() {
    settingsStore.setCodeFont(
      normalizedFontDraft(codeFontDraft, fallback: AppTypography.defaultCodeFontName)
    )
  }

  private func resetCodeFont() {
    codeFontDraft = AppTypography.defaultCodeFontName
    settingsStore.setCodeFont(AppTypography.defaultCodeFontName)
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

  private func normalizedFontDraft(_ value: String, fallback: String) -> String {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? fallback : trimmed
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

// MARK: - Sidebar

private struct SettingsSidebar: View {
  @Environment(\.appTheme) private var theme

  let sections: [SettingsViewSection]
  let activeSection: SettingsViewSection
  let namespace: Namespace.ID
  let dismiss: DismissAction
  let action: (SettingsViewSection) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Color.clear.frame(height: 40)

      VStack(alignment: .leading, spacing: 16) {
        Button {
          dismiss()
        } label: {
          HStack(spacing: 6) {
            Image(systemName: "chevron.left")
              .font(.lc(size: 10, weight: .semibold))
            Text("Back to app")
              .font(.lc(size: 12, weight: .medium))
          }
          .foregroundStyle(theme.sidebarMutedForegroundColor)
          .padding(.horizontal, 8)
          .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .lcPointerCursor()

        VStack(alignment: .leading, spacing: 4) {
          ForEach(sections) { section in
            SettingsSidebarButton(
              section: section,
              isActive: activeSection == section,
              namespace: namespace
            ) {
              action(section)
            }
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.top, 16)

      Spacer()
    }
  }
}

private struct SettingsSidebarButton: View {
  @Environment(\.appTheme) private var theme

  let section: SettingsViewSection
  let isActive: Bool
  let namespace: Namespace.ID
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 10) {
        Image(systemName: section.systemImage)
          .font(.lc(size: 12, weight: .medium))
          .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
          .frame(width: 14)

        Text(section.rawValue)
          .font(.lc(size: 13, weight: isActive ? .semibold : .medium))
          .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)

        Spacer(minLength: 0)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 9)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background {
        if isActive {
          RoundedRectangle(cornerRadius: 10, style: .continuous)
            .fill(theme.sidebarSelectedColor)
            .matchedGeometryEffect(id: "settings-sidebar-selection", in: namespace)
        }
      }
      .contentShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
  }
}

// MARK: - Content Chrome

private struct SettingsContentCard<Content: View>: View {
  @Environment(\.appTheme) private var theme

  @ViewBuilder let content: () -> Content

  var body: some View {
    content()
      .background(theme.surfaceBackground)
      .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 12, style: .continuous)
          .strokeBorder(theme.borderColor)
      )
      .shadow(color: theme.cardShadowColor, radius: 24, x: 0, y: 10)
  }
}

private struct SettingsFormSection<Content: View>: View {
  @Environment(\.appTheme) private var theme

  let title: String
  let description: String?
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 5) {
        Text(title)
          .font(.lc(size: 18, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        if let description {
          Text(description)
            .font(.lc(size: 12))
            .foregroundStyle(theme.mutedColor)
            .lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      content()
    }
  }
}

private struct SettingsFormSubsectionHeader: View {
  @Environment(\.appTheme) private var theme
  let title: String
  let description: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.lc(size: 13, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)

      if let description {
        Text(description)
          .font(.lc(size: 11))
          .foregroundStyle(theme.mutedColor)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
  }
}

private struct SettingsFormGroup<Content: View>: View {
  @Environment(\.appTheme) private var theme

  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      content()
    }
    .overlay(
      RoundedRectangle(cornerRadius: SettingsLayout.groupCornerRadius, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.75))
    )
  }
}

private struct SettingsFormContentBlock<Content: View>: View {
  let spacing: CGFloat
  @ViewBuilder let content: () -> Content

  init(spacing: CGFloat = 0, @ViewBuilder content: @escaping () -> Content) {
    self.spacing = spacing
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: spacing) {
      content()
    }
    .padding(.horizontal, SettingsLayout.rowHorizontalPadding)
    .padding(.vertical, 12)
  }
}

private struct SettingsFormDivider: View {
  @Environment(\.appTheme) private var theme

  var body: some View {
    Rectangle()
      .fill(theme.borderColor.opacity(0.75))
      .frame(height: 1)
  }
}

private struct SettingsStatusBanner: View {
  let message: String
  let tint: Color
  let systemImage: String

  var body: some View {
    HStack(alignment: .center, spacing: 10) {
      Image(systemName: systemImage)
        .font(.lc(size: 12, weight: .semibold))
        .foregroundStyle(tint)

      Text(message)
        .font(.lc(size: 12, weight: .medium))
        .foregroundStyle(tint)
        .fixedSize(horizontal: false, vertical: true)

      Spacer(minLength: 0)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 12)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(tint.opacity(0.08))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(tint.opacity(0.22), lineWidth: 1)
    )
  }
}

private enum SettingsInlineNoteTone {
  case info
  case warning
}

private struct SettingsInlineNote: View {
  @Environment(\.appTheme) private var theme

  let message: String
  let tone: SettingsInlineNoteTone

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Image(systemName: icon)
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(color)

      Text(message)
        .font(.lc(size: 11))
        .foregroundStyle(color)
        .fixedSize(horizontal: false, vertical: true)
    }
  }

  private var icon: String {
    switch tone {
    case .info:
      "info.circle"
    case .warning:
      "exclamationmark.triangle"
    }
  }

  private var color: Color {
    switch tone {
    case .info:
      theme.mutedColor
    case .warning:
      theme.warningColor
    }
  }
}

// MARK: - Settings Row

private struct SettingsFormRow<Control: View>: View {
  @Environment(\.appTheme) private var theme
  let label: String
  let description: String
  var stacked: Bool = false
  var showsDivider: Bool = false
  @ViewBuilder let control: () -> Control

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top, spacing: 16) {
        VStack(alignment: .leading, spacing: 3) {
          Text(label)
            .font(.lc(size: 13, weight: .medium))
            .foregroundStyle(theme.primaryTextColor)

          Text(description)
            .font(.lc(size: stacked ? 11 : 12))
            .foregroundStyle(theme.mutedColor)
            .lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        control()
          .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .padding(.horizontal, SettingsLayout.rowHorizontalPadding)
      .padding(.vertical, stacked ? SettingsLayout.stackedRowVerticalPadding : SettingsLayout.rowVerticalPadding)

      if showsDivider {
        SettingsFormDivider()
      }
    }
  }
}

private struct SettingsNestedFormRow<Control: View>: View {
  @Environment(\.appTheme) private var theme
  let label: String
  let description: String
  @ViewBuilder let control: () -> Control

  var body: some View {
    HStack(alignment: .top, spacing: 14) {
      RoundedRectangle(cornerRadius: 1, style: .continuous)
        .fill(theme.borderColor.opacity(0.95))
        .frame(width: 2)
        .padding(.vertical, 3)

      HStack(alignment: .center, spacing: 16) {
        VStack(alignment: .leading, spacing: 3) {
          Text(label)
            .font(.lc(size: 12, weight: .medium))
            .foregroundStyle(theme.primaryTextColor)

          Text(description)
            .font(.lc(size: 11))
            .foregroundStyle(theme.mutedColor)
            .lineSpacing(1)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)

        control()
          .frame(maxWidth: .infinity, alignment: .trailing)
      }
    }
    .padding(.leading, SettingsLayout.rowHorizontalPadding)
    .padding(.trailing, SettingsLayout.rowHorizontalPadding)
    .padding(.top, 2)
    .padding(.bottom, SettingsLayout.stackedRowVerticalPadding)
  }
}

private struct SettingsReadOnlyValue: View {
  @Environment(\.appTheme) private var theme
  let text: String
  var monospaced: Bool = false

  var body: some View {
    Text(text)
      .font(.lc(size: 11, weight: .medium, design: monospaced ? .monospaced : .default))
      .foregroundStyle(theme.primaryTextColor)
      .multilineTextAlignment(.trailing)
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(Color.clear)
      )
      .overlay(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .stroke(theme.borderColor, lineWidth: 1)
      )
      .fixedSize(horizontal: false, vertical: true)
  }
}

private struct SettingsOpacitySlider: View {
  @Environment(\.appTheme) private var theme
  let value: Binding<Double>
  let range: ClosedRange<Double>

  var body: some View {
    HStack(spacing: 10) {
      Slider(value: value, in: range)
        .tint(theme.accentColor)
        .frame(minWidth: 180)

      Text("\(Int((value.wrappedValue * 100).rounded()))%")
        .font(.lc(size: 11, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor)
        .frame(width: 44, alignment: .trailing)
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
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
      if canReset {
        LCButton(label: "Reset", variant: .ghost, size: .small, action: reset)
      }

      LCButton(label: applyLabel, variant: .secondary, size: .small, action: apply)
        .disabled(!isModified)

      LCTextInput(text: $text, placeholder: placeholder, onSubmit: apply)
        .frame(maxWidth: .infinity)
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
  }
}
