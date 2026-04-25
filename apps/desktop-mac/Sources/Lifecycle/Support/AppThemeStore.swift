import Combine
import CryptoKit
import Foundation
import SwiftUI

struct AppTerminalThemeContext: Equatable, Sendable {
  let themeConfigPath: String
  let backgroundHexColor: String
  let darkAppearance: Bool

  static let fallback = AppTerminalThemeContext(
    themeConfigPath: AppResources.bundledTerminalThemeConfigPath(),
    backgroundHexColor: AppThemeCatalog.defaultPreset.theme.terminalBackgroundHexColor,
    darkAppearance: AppThemeCatalog.defaultPreset.appearance.isDark
  )
}

struct AppAppearanceSettings: Equatable, Sendable {
  var theme: AppThemePreference = .dark
  var fonts = AppAppearanceFontSettings()
  var dimInactivePanes = true
  var inactivePaneOpacity: Double = 0.52
}

struct AppAppearanceFontSettings: Equatable, Sendable {
  var ui = AppTypography.defaultUIFontName
  var code = AppTypography.defaultCodeFontName
}

struct WorkspacePaneDimmingSettings: Equatable, Sendable {
  var isEnabled = true
  var inactiveOpacity: Double = 0.52

  static let `default` = WorkspacePaneDimmingSettings()
}

func clampedInactivePaneOpacity(_ opacity: Double) -> Double {
  min(max(opacity, 0.2), 1)
}

enum AppClaudeLoginMethod: String, CaseIterable, Equatable, Identifiable, Sendable {
  case claudeai
  case console

  var id: String { rawValue }

  var label: String {
    switch self {
    case .claudeai:
      "Claude"
    case .console:
      "Console"
    }
  }
}

struct AppClaudeProviderSettings: Equatable, Sendable {
  var loginMethod: AppClaudeLoginMethod = .claudeai
}

struct AppProviderSettings: Equatable, Sendable {
  var claude = AppClaudeProviderSettings()
}

struct AppTerminalCommandSettings: Equatable, Sendable {
  var program: String?
}

enum AppTerminalPersistenceBackend: String, CaseIterable, Equatable, Identifiable, Sendable {
  case tmux
  case zellij

  var id: String { rawValue }

  var label: String {
    switch self {
    case .tmux:
      "tmux"
    case .zellij:
      "zellij"
    }
  }
}

enum AppTerminalPersistenceMode: String, CaseIterable, Equatable, Identifiable, Sendable {
  case managed
  case inherit

  var id: String { rawValue }

  var label: String {
    switch self {
    case .managed:
      "Managed"
    case .inherit:
      "Inherit"
    }
  }
}

struct AppTerminalPersistenceSettings: Equatable, Sendable {
  var backend: AppTerminalPersistenceBackend = .tmux
  var mode: AppTerminalPersistenceMode = .managed
  var executablePath: String?
}

enum AppTerminalLauncher: String, Equatable, Sendable {
  case shell
  case command
  case claude
  case codex
  case opencode

  var label: String {
    switch self {
    case .shell:
      "Shell"
    case .command:
      "Command"
    case .claude:
      "Claude"
    case .codex:
      "Codex"
    case .opencode:
      "OpenCode"
    }
  }
}

enum AppClaudePermissionMode: String, CaseIterable, Equatable, Identifiable, Sendable {
  case acceptEdits
  case auto
  case bypassPermissions
  case `default`
  case dontAsk
  case plan

  var id: String { rawValue }

  var label: String {
    switch self {
    case .acceptEdits:
      "Accept Edits"
    case .auto:
      "Auto"
    case .bypassPermissions:
      "Bypass Permissions"
    case .default:
      "CLI Default"
    case .dontAsk:
      "Don't Ask"
    case .plan:
      "Plan"
    }
  }
}

enum AppClaudeEffort: String, CaseIterable, Equatable, Identifiable, Sendable {
  case low
  case medium
  case high
  case max

  var id: String { rawValue }

  var label: String { rawValue.capitalized }
}

enum AppCodexApprovalPolicy: String, CaseIterable, Equatable, Identifiable, Sendable {
  case untrusted
  case onRequest = "on-request"
  case never

  var id: String { rawValue }

  var label: String {
    switch self {
    case .untrusted:
      "Untrusted"
    case .onRequest:
      "On Request"
    case .never:
      "Never"
    }
  }
}

enum AppCodexSandboxMode: String, CaseIterable, Equatable, Identifiable, Sendable {
  case readOnly = "read-only"
  case workspaceWrite = "workspace-write"
  case dangerFullAccess = "danger-full-access"

  var id: String { rawValue }

  var label: String {
    switch self {
    case .readOnly:
      "Read Only"
    case .workspaceWrite:
      "Workspace Write"
    case .dangerFullAccess:
      "Danger Full Access"
    }
  }
}

enum AppCodexReasoningEffort: String, CaseIterable, Equatable, Identifiable, Sendable {
  case minimal
  case low
  case medium
  case high
  case xhigh

  var id: String { rawValue }

  var label: String {
    switch self {
    case .xhigh:
      "Extra High"
    default:
      rawValue.capitalized
    }
  }
}

enum AppCodexWebSearchMode: String, CaseIterable, Equatable, Identifiable, Sendable {
  case disabled
  case cached
  case live

  var id: String { rawValue }

  var label: String { rawValue.capitalized }
}

struct AppClaudeTerminalProfileSettings: Equatable, Sendable {
  var model: String? = nil
  var permissionMode: AppClaudePermissionMode? = nil
  var effort: AppClaudeEffort? = nil
}

struct AppCodexTerminalProfileSettings: Equatable, Sendable {
  var model: String? = nil
  var configProfile: String? = nil
  var approvalPolicy: AppCodexApprovalPolicy? = nil
  var sandboxMode: AppCodexSandboxMode? = nil
  var reasoningEffort: AppCodexReasoningEffort? = nil
  var webSearch: AppCodexWebSearchMode? = nil
}

struct AppTerminalProfileCommand: Equatable, Sendable {
  var program: String
  var args: [String] = []
  var env: [String: String] = [:]
}

struct AppTerminalProfile: Equatable, Sendable, Identifiable {
  let id: String
  var launcher: AppTerminalLauncher
  var label: String?
  var command: AppTerminalProfileCommand?
  var claudeSettings: AppClaudeTerminalProfileSettings?
  var codexSettings: AppCodexTerminalProfileSettings?

  var displayLabel: String {
    if let label, !label.isEmpty {
      return label
    }
    return launcher.label
  }
}

func defaultAppTerminalProfiles() -> [String: AppTerminalProfile] {
  [
    "shell": AppTerminalProfile(
      id: "shell",
      launcher: .shell,
      label: "Shell",
      command: nil,
      claudeSettings: nil,
      codexSettings: nil
    ),
    "claude": AppTerminalProfile(
      id: "claude",
      launcher: .claude,
      label: "Claude",
      command: nil,
      claudeSettings: AppClaudeTerminalProfileSettings(),
      codexSettings: nil
    ),
    "codex": AppTerminalProfile(
      id: "codex",
      launcher: .codex,
      label: "Codex",
      command: nil,
      claudeSettings: nil,
      codexSettings: AppCodexTerminalProfileSettings()
    ),
    "opencode": AppTerminalProfile(
      id: "opencode",
      launcher: .opencode,
      label: "OpenCode",
      command: nil,
      claudeSettings: nil,
      codexSettings: nil
    ),
  ]
}

struct AppTerminalSettings: Equatable, Sendable {
  var command = AppTerminalCommandSettings()
  var persistence = AppTerminalPersistenceSettings()
  var defaultProfile = "shell"
  var profiles = defaultAppTerminalProfiles()
}

struct AppDeveloperSettings: Equatable, Sendable {
  var showsOnboarding = false
}

struct AppSettingsSnapshot: Equatable, Sendable {
  var appearance = AppAppearanceSettings()
  var providers = AppProviderSettings()
  var terminal = AppTerminalSettings()
  var developer = AppDeveloperSettings()

  static let `default` = AppSettingsSnapshot()

  init() {}

  init(
    appearance: AppAppearanceSettings,
    providers: AppProviderSettings,
    terminal: AppTerminalSettings,
    developer: AppDeveloperSettings = AppDeveloperSettings()
  ) {
    self.appearance = appearance
    self.providers = providers
    self.terminal = terminal
    self.developer = developer
  }

  init(
    bridgeSettings: BridgeSettings,
    developer: AppDeveloperSettings = AppDeveloperSettings()
  ) {
    appearance = AppAppearanceSettings(
      theme: AppThemePreference(rawValue: bridgeSettings.appearance.theme) ?? .dark,
      fonts: AppAppearanceFontSettings(
        ui: normalizeFontSettingValue(
          bridgeSettings.appearance.fonts?.ui,
          fallback: AppTypography.defaultUIFontName
        ),
        code: normalizeFontSettingValue(
          bridgeSettings.appearance.fonts?.code,
          fallback: AppTypography.defaultCodeFontName
        )
      ),
      dimInactivePanes: bridgeSettings.appearance.dimInactivePanes ?? true,
      inactivePaneOpacity: clampedInactivePaneOpacity(
        bridgeSettings.appearance.inactivePaneOpacity ?? 0.52
      )
    )
    providers = AppProviderSettings(
      claude: AppClaudeProviderSettings(
        loginMethod: AppClaudeLoginMethod(
          rawValue: bridgeSettings.providers.claude.loginMethod
        ) ?? .claudeai
      )
    )
    terminal = AppTerminalSettings(
      command: AppTerminalCommandSettings(program: bridgeSettings.terminal.command.program),
      persistence: AppTerminalPersistenceSettings(
        backend: AppTerminalPersistenceBackend(
          rawValue: bridgeSettings.terminal.persistence.backend
        ) ?? .tmux,
        mode: AppTerminalPersistenceMode(
          rawValue: bridgeSettings.terminal.persistence.mode
        ) ?? .managed,
        executablePath: bridgeSettings.terminal.persistence.executablePath
      ),
      defaultProfile: bridgeSettings.terminal.defaultProfile,
      profiles: appTerminalProfiles(from: bridgeSettings.terminal.profiles)
    )
    self.developer = developer
  }
}

@MainActor
final class AppSettingsStore: ObservableObject {
  @Published private(set) var settings: AppSettingsSnapshot
  @Published private(set) var preference: AppThemePreference
  @Published private(set) var resolvedTheme: AppThemePreset
  @Published private(set) var terminalThemeContext: AppTerminalThemeContext
  @Published private(set) var settingsPath: String
  @Published private(set) var errorMessage: String?
  let isDeveloperMode: Bool

  private let fileManager: FileManager
  private let environment: [String: String]
  private var persistedObject: [String: Any]
  private var systemAppearance: AppThemeAppearance
  private var bridgeClient: BridgeClient?
  private var settingsWatcher: AnyCancellable?
  private var lastObservedSettingsFingerprint: SettingsFileFingerprint?
  private var settingsPersistTask: Task<Void, Never>?

  init(
    fileManager: FileManager = .default,
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) {
    self.fileManager = fileManager
    self.environment = environment
    self.systemAppearance = .dark
    isDeveloperMode = LifecycleEnvironment(values: environment).string(for: LifecycleEnvironmentKey.dev)
      == "1"

    do {
      let settingsURL = try LifecyclePaths.settingsURL(environment: environment)
      let loaded = try LifecycleSettingsFile.read(from: settingsURL, fileManager: fileManager)
      settingsPath = loaded.path
      persistedObject = loaded.object
      settings = loaded.settings
      preference = loaded.settings.appearance.theme
      resolvedTheme = AppThemeCatalog.resolve(
        preference: loaded.settings.appearance.theme,
        systemAppearance: .dark
      )
    } catch {
      settingsPath = (try? LifecyclePaths.settingsURL(environment: environment).path) ?? ""
      persistedObject = [:]
      settings = .default
      preference = .dark
      resolvedTheme = AppThemeCatalog.defaultPreset
      errorMessage = error.localizedDescription
    }

    terminalThemeContext = AppTerminalThemeContext.fallback
    AppTypography.setFonts(ui: settings.appearance.fonts.ui, code: settings.appearance.fonts.code)
    refreshThemeArtifacts()
    startWatchingSettingsFile()
  }

  var theme: AppTheme { resolvedTheme.theme }

  var workspacePaneDimmingSettings: WorkspacePaneDimmingSettings {
    WorkspacePaneDimmingSettings(
      isEnabled: settings.appearance.dimInactivePanes,
      inactiveOpacity: settings.appearance.inactivePaneOpacity
    )
  }

  var preferredColorScheme: ColorScheme? {
    switch preference {
    case .system:
      nil
    default:
      resolvedTheme.appearance.colorScheme
    }
  }

  func updateSystemAppearance(_ colorScheme: ColorScheme) {
    let nextAppearance: AppThemeAppearance = colorScheme == .dark ? .dark : .light
    guard nextAppearance != systemAppearance else {
      return
    }

    systemAppearance = nextAppearance
    refreshThemeArtifacts()
  }

  func setBridgeClient(_ bridgeClient: BridgeClient?) {
    let currentURL = self.bridgeClient?.baseURL
    let nextURL = bridgeClient?.baseURL
    self.bridgeClient = bridgeClient

    guard currentURL != nextURL else {
      return
    }

    Task {
      await reloadSettings(preferBridge: true)
    }
  }

  func setThemePreference(_ preference: AppThemePreference) {
    guard preference != self.preference else {
      return
    }

    updateSettings(
      bridgePayload: [
        "appearance": [
          "theme": preference.rawValue
        ]
      ]
    ) { nextSettings in
      nextSettings.appearance.theme = preference
    }
  }

  func setDimInactivePanes(_ isEnabled: Bool) {
    guard settings.appearance.dimInactivePanes != isEnabled else {
      return
    }

    updateSettings(
      bridgePayload: [
        "appearance": [
          "dimInactivePanes": isEnabled
        ]
      ]
    ) { nextSettings in
      nextSettings.appearance.dimInactivePanes = isEnabled
    }
  }

  func setUIFont(_ fontName: String) {
    let normalizedFontName = normalizeFontSettingValue(
      fontName,
      fallback: AppTypography.defaultUIFontName
    )
    guard settings.appearance.fonts.ui != normalizedFontName else {
      return
    }

    updateSettings(
      bridgePayload: [
        "appearance": [
          "fonts": [
            "ui": normalizedFontName
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.appearance.fonts.ui = normalizedFontName
    }
  }

  func setCodeFont(_ fontName: String) {
    let normalizedFontName = normalizeFontSettingValue(
      fontName,
      fallback: AppTypography.defaultCodeFontName
    )
    guard settings.appearance.fonts.code != normalizedFontName else {
      return
    }

    updateSettings(
      bridgePayload: [
        "appearance": [
          "fonts": [
            "code": normalizedFontName
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.appearance.fonts.code = normalizedFontName
    }
  }

  func setInactivePaneOpacity(_ opacity: Double) {
    let clampedOpacity = clampedInactivePaneOpacity(opacity)
    guard settings.appearance.inactivePaneOpacity != clampedOpacity else {
      return
    }

    updateSettings(
      bridgePayload: [
        "appearance": [
          "inactivePaneOpacity": clampedOpacity
        ]
      ]
    ) { nextSettings in
      nextSettings.appearance.inactivePaneOpacity = clampedOpacity
    }
  }

  func setTerminalCommandProgram(_ program: String?) {
    let normalizedProgram = normalizeOptionalSettingValue(program)
    guard settings.terminal.command.program != normalizedProgram else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "command": [
            "program": jsonValue(normalizedProgram)
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.command.program = normalizedProgram
    }
  }

  func setClaudeLoginMethod(_ loginMethod: AppClaudeLoginMethod) {
    guard settings.providers.claude.loginMethod != loginMethod else {
      return
    }

    updateSettings(
      bridgePayload: [
        "providers": [
          "claude": [
            "loginMethod": loginMethod.rawValue
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.providers.claude.loginMethod = loginMethod
    }
  }

  func setTerminalPersistenceBackend(_ backend: AppTerminalPersistenceBackend) {
    guard settings.terminal.persistence.backend != backend else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "persistence": [
            "backend": backend.rawValue
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.persistence.backend = backend
    }
  }

  func setTerminalPersistenceMode(_ mode: AppTerminalPersistenceMode) {
    guard settings.terminal.persistence.mode != mode else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "persistence": [
            "mode": mode.rawValue
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.persistence.mode = mode
    }
  }

  func setTerminalPersistenceExecutablePath(_ path: String?) {
    let normalizedPath = normalizeOptionalSettingValue(path)
    guard settings.terminal.persistence.executablePath != normalizedPath else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "persistence": [
            "executablePath": jsonValue(normalizedPath)
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.persistence.executablePath = normalizedPath
    }
  }

  func setTerminalDefaultProfile(_ profileID: String) {
    let normalizedProfileID = profileID.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !normalizedProfileID.isEmpty, settings.terminal.defaultProfile != normalizedProfileID else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "defaultProfile": normalizedProfileID
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.defaultProfile = normalizedProfileID
    }
  }

  func setClaudeTerminalModel(_ model: String?) {
    updateKnownTerminalProfile("claude") { profile in
      var settings = profile.claudeSettings ?? AppClaudeTerminalProfileSettings()
      let normalizedModel = normalizeOptionalSettingValue(model)
      guard settings.model != normalizedModel else {
        return false
      }
      settings.model = normalizedModel
      profile.claudeSettings = settings
      return true
    }
  }

  func setClaudeTerminalPermissionMode(_ permissionMode: AppClaudePermissionMode?) {
    updateKnownTerminalProfile("claude") { profile in
      var settings = profile.claudeSettings ?? AppClaudeTerminalProfileSettings()
      guard settings.permissionMode != permissionMode else {
        return false
      }
      settings.permissionMode = permissionMode
      profile.claudeSettings = settings
      return true
    }
  }

  func setClaudeTerminalEffort(_ effort: AppClaudeEffort?) {
    updateKnownTerminalProfile("claude") { profile in
      var settings = profile.claudeSettings ?? AppClaudeTerminalProfileSettings()
      guard settings.effort != effort else {
        return false
      }
      settings.effort = effort
      profile.claudeSettings = settings
      return true
    }
  }

  func setCodexTerminalModel(_ model: String?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      let normalizedModel = normalizeOptionalSettingValue(model)
      guard settings.model != normalizedModel else {
        return false
      }
      settings.model = normalizedModel
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalConfigProfile(_ configProfile: String?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      let normalizedProfile = normalizeOptionalSettingValue(configProfile)
      guard settings.configProfile != normalizedProfile else {
        return false
      }
      settings.configProfile = normalizedProfile
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalApprovalPolicy(_ approvalPolicy: AppCodexApprovalPolicy?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      guard settings.approvalPolicy != approvalPolicy else {
        return false
      }
      settings.approvalPolicy = approvalPolicy
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalSandboxMode(_ sandboxMode: AppCodexSandboxMode?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      guard settings.sandboxMode != sandboxMode else {
        return false
      }
      settings.sandboxMode = sandboxMode
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalYoloMode(_ isEnabled: Bool) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      let nextApprovalPolicy: AppCodexApprovalPolicy? = isEnabled ? .never : nil
      let nextSandboxMode: AppCodexSandboxMode? = isEnabled ? .dangerFullAccess : nil
      guard settings.approvalPolicy != nextApprovalPolicy || settings.sandboxMode != nextSandboxMode else {
        return false
      }

      settings.approvalPolicy = nextApprovalPolicy
      settings.sandboxMode = nextSandboxMode
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalReasoningEffort(_ reasoningEffort: AppCodexReasoningEffort?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      guard settings.reasoningEffort != reasoningEffort else {
        return false
      }
      settings.reasoningEffort = reasoningEffort
      profile.codexSettings = settings
      return true
    }
  }

  func setCodexTerminalWebSearch(_ webSearch: AppCodexWebSearchMode?) {
    updateKnownTerminalProfile("codex") { profile in
      var settings = profile.codexSettings ?? AppCodexTerminalProfileSettings()
      guard settings.webSearch != webSearch else {
        return false
      }
      settings.webSearch = webSearch
      profile.codexSettings = settings
      return true
    }
  }

  func setDeveloperShowsOnboarding(_ isEnabled: Bool) {
    guard settings.developer.showsOnboarding != isEnabled else {
      return
    }

    updateSettings(persistLocallyOnly: true) { nextSettings in
      nextSettings.developer.showsOnboarding = isEnabled
    }
  }

  private func updateKnownTerminalProfile(
    _ profileID: String,
    mutate: (inout AppTerminalProfile) -> Bool
  ) {
    var profile = settings.terminal.profiles[profileID] ?? defaultAppTerminalProfile(id: profileID)
    guard mutate(&profile) else {
      return
    }

    updateSettings(
      bridgePayload: [
        "terminal": [
          "profiles": [
            profileID: appTerminalProfileJSONObject(profile)
          ]
        ]
      ]
    ) { nextSettings in
      nextSettings.terminal.profiles[profileID] = profile
    }
  }

  private func updateSettings(
    bridgePayload: [String: Any] = [:],
    persistLocallyOnly: Bool = false,
    mutate: (inout AppSettingsSnapshot) -> Void
  ) {
    var nextSettings = settings
    mutate(&nextSettings)
    applyInMemorySettings(nextSettings)

    if bridgeClient != nil, !persistLocallyOnly {
      let previousPersistTask = settingsPersistTask
      settingsPersistTask = Task {
        await previousPersistTask?.value
        await persistSettings(nextSettings, bridgePayload: bridgePayload)
      }
    } else {
      do {
        try persistSettingsLocally(nextSettings)
        errorMessage = nil
      } catch {
        errorMessage = error.localizedDescription
      }
    }
  }

  private func persistSettings(
    _ nextSettings: AppSettingsSnapshot,
    bridgePayload: [String: Any]
  ) async {
    if let bridgeClient {
      do {
        let envelope = try await bridgeClient.updateSettings(bridgePayload)
        syncPersistedObjectFromDisk(pathOverride: envelope.settingsPath)
        applyRemoteSettings(envelope)
        errorMessage = nil
        return
      } catch {
        if !isBridgeConnectivityError(error) {
          errorMessage = error.localizedDescription
        }
      }
    }

    do {
      try persistSettingsLocally(nextSettings)
      errorMessage = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func persistSettingsLocally(_ nextSettings: AppSettingsSnapshot) throws {
    let settingsURL = try LifecyclePaths.settingsURL(environment: environment)
    let snapshot = try LifecycleSettingsFile.writeSettings(
      nextSettings,
      to: settingsURL,
      fileManager: fileManager
    )
    applyLocalSnapshot(snapshot)
  }

  private func applyInMemorySettings(_ nextSettings: AppSettingsSnapshot) {
    settings = nextSettings
    preference = nextSettings.appearance.theme
    AppTypography.setFonts(
      ui: nextSettings.appearance.fonts.ui,
      code: nextSettings.appearance.fonts.code
    )
    refreshThemeArtifacts()
  }

  private func reloadSettings(preferBridge: Bool) async {
    if preferBridge, let bridgeClient {
      do {
        let envelope = try await bridgeClient.settings()
        syncPersistedObjectFromDisk(pathOverride: envelope.settingsPath)
        applyRemoteSettings(envelope)
        errorMessage = nil
        return
      } catch {
        if !isBridgeConnectivityError(error) {
          errorMessage = error.localizedDescription
        }
      }
    }

    do {
      let settingsURL = try LifecyclePaths.settingsURL(environment: environment)
      let snapshot = try LifecycleSettingsFile.read(from: settingsURL, fileManager: fileManager)
      applyLocalSnapshot(snapshot)
      errorMessage = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func applyLocalSnapshot(_ snapshot: LifecycleSettingsSnapshot) {
    applyInMemorySettings(snapshot.settings)
    persistedObject = snapshot.object
    settingsPath = snapshot.path
    startWatchingSettingsFile()
  }

  private func applyRemoteSettings(_ envelope: BridgeSettingsEnvelope) {
    applyInMemorySettings(
      AppSettingsSnapshot(
        bridgeSettings: envelope.settings,
        developer: loadDeveloperSettings(pathOverride: envelope.settingsPath)
      )
    )
    settingsPath = envelope.settingsPath
    startWatchingSettingsFile()
  }

  private func syncPersistedObjectFromDisk(pathOverride: String? = nil) {
    let path = resolvedSettingsPath(pathOverride: pathOverride)
    guard !path.isEmpty else {
      return
    }

    do {
      let snapshot = try LifecycleSettingsFile.read(
        from: URL(fileURLWithPath: path),
        fileManager: fileManager
      )
      persistedObject = snapshot.object
    } catch {
      // Keep the last known raw object until the next successful disk refresh.
    }
  }

  private func loadDeveloperSettings(pathOverride: String? = nil) -> AppDeveloperSettings {
    let path = resolvedSettingsPath(pathOverride: pathOverride)
    guard !path.isEmpty else {
      return LifecycleSettingsFile.parseDeveloperSettings(from: persistedObject)
    }

    if let snapshot = try? LifecycleSettingsFile.read(
      from: URL(fileURLWithPath: path),
      fileManager: fileManager
    ) {
      return snapshot.settings.developer
    }

    return LifecycleSettingsFile.parseDeveloperSettings(from: persistedObject)
  }

  private func resolvedSettingsPath(pathOverride: String? = nil) -> String {
    if let pathOverride, !pathOverride.isEmpty {
      return pathOverride
    }

    return settingsPath.isEmpty
      ? ((try? LifecyclePaths.settingsURL(environment: environment).path) ?? "")
      : settingsPath
  }

  private func refreshThemeArtifacts() {
    resolvedTheme = AppThemeCatalog.resolve(preference: preference, systemAppearance: systemAppearance)

    do {
      terminalThemeContext = try TerminalThemeConfigWriter.write(
        preset: resolvedTheme,
        codeFont: settings.appearance.fonts.code,
        fileManager: fileManager,
        environment: environment
      )
      errorMessage = nil
    } catch {
      terminalThemeContext = AppTerminalThemeContext(
        themeConfigPath: AppResources.bundledTerminalThemeConfigPath(),
        backgroundHexColor: resolvedTheme.theme.terminalBackgroundHexColor,
        darkAppearance: resolvedTheme.appearance.isDark
      )
      errorMessage = error.localizedDescription
    }
  }

  private func startWatchingSettingsFile() {
    stopWatchingSettingsFile()
    lastObservedSettingsFingerprint = currentSettingsFileFingerprint()
    settingsWatcher = Timer.publish(every: 1, on: .main, in: .common)
      .autoconnect()
      .sink { [weak self] _ in
        self?.pollSettingsFileIfNeeded()
      }
  }

  private func stopWatchingSettingsFile() {
    settingsWatcher = nil
  }

  private func pollSettingsFileIfNeeded() {
    let nextFingerprint = currentSettingsFileFingerprint()
    guard nextFingerprint != lastObservedSettingsFingerprint else {
      return
    }

    lastObservedSettingsFingerprint = nextFingerprint
    Task {
      await reloadSettings(preferBridge: bridgeClient != nil)
    }
  }

  private func currentSettingsFileFingerprint() -> SettingsFileFingerprint? {
    let path = settingsPath.isEmpty
      ? ((try? LifecyclePaths.settingsURL(environment: environment).path) ?? "")
      : settingsPath
    guard !path.isEmpty else {
      return nil
    }

    let attributes = try? fileManager.attributesOfItem(atPath: path)
    return SettingsFileFingerprint(
      path: path,
      exists: attributes != nil,
      modificationDate: attributes?[.modificationDate] as? Date,
      size: attributes?[.size] as? NSNumber
    )
  }
}

private func defaultAppTerminalProfile(id: String) -> AppTerminalProfile {
  defaultAppTerminalProfiles()[id] ?? AppTerminalProfile(
    id: id,
    launcher: .command,
    label: nil,
    command: AppTerminalProfileCommand(program: "/bin/sh"),
    claudeSettings: nil,
    codexSettings: nil
  )
}

private func appTerminalProfiles(
  from bridgeProfiles: [String: BridgeTerminalLaunchProfile]
) -> [String: AppTerminalProfile] {
  var profiles = defaultAppTerminalProfiles()
  for (profileID, profile) in bridgeProfiles {
    profiles[profileID] = appTerminalProfile(id: profileID, from: profile)
  }
  return profiles
}

private func appTerminalProfiles(from rawProfiles: [String: Any]?) -> [String: AppTerminalProfile] {
  var profiles = defaultAppTerminalProfiles()
  for (profileID, rawProfile) in rawProfiles ?? [:] {
    guard let profileObject = rawProfile as? [String: Any],
          let launcherRaw = profileObject["launcher"] as? String,
          let launcher = AppTerminalLauncher(rawValue: launcherRaw)
    else {
      continue
    }

    profiles[profileID] = AppTerminalProfile(
      id: profileID,
      launcher: launcher,
      label: profileObject["label"] as? String,
      command: appTerminalProfileCommand(from: profileObject["command"] as? [String: Any]),
      claudeSettings: appClaudeTerminalProfileSettings(
        from: profileObject["settings"] as? [String: Any]
      ),
      codexSettings: appCodexTerminalProfileSettings(
        from: profileObject["settings"] as? [String: Any]
      )
    )
  }
  return profiles
}

private func appTerminalProfile(
  id: String,
  from bridgeProfile: BridgeTerminalLaunchProfile
) -> AppTerminalProfile {
  AppTerminalProfile(
    id: id,
    launcher: AppTerminalLauncher(rawValue: bridgeProfile.launcher) ?? .command,
    label: bridgeProfile.label,
    command: bridgeProfile.command.map {
      AppTerminalProfileCommand(program: $0.program, args: $0.args, env: $0.env)
    },
    claudeSettings: AppClaudeTerminalProfileSettings(
      model: bridgeProfile.settings?.model,
      permissionMode: bridgeProfile.settings?.permissionMode.flatMap(AppClaudePermissionMode.init),
      effort: bridgeProfile.settings?.effort.flatMap(AppClaudeEffort.init)
    ),
    codexSettings: AppCodexTerminalProfileSettings(
      model: bridgeProfile.settings?.model,
      configProfile: bridgeProfile.settings?.configProfile,
      approvalPolicy: bridgeProfile.settings?.approvalPolicy.flatMap(AppCodexApprovalPolicy.init),
      sandboxMode: bridgeProfile.settings?.sandboxMode.flatMap(AppCodexSandboxMode.init),
      reasoningEffort: bridgeProfile.settings?.reasoningEffort.flatMap(
        AppCodexReasoningEffort.init
      ),
      webSearch: bridgeProfile.settings?.webSearch.flatMap(AppCodexWebSearchMode.init)
    )
  )
}

private func appTerminalProfileCommand(
  from rawCommand: [String: Any]?
) -> AppTerminalProfileCommand? {
  guard let rawCommand,
        let program = rawCommand["program"] as? String,
        !program.isEmpty
  else {
    return nil
  }

  return AppTerminalProfileCommand(
    program: program,
    args: rawCommand["args"] as? [String] ?? [],
    env: rawCommand["env"] as? [String: String] ?? [:]
  )
}

private func appClaudeTerminalProfileSettings(
  from rawSettings: [String: Any]?
) -> AppClaudeTerminalProfileSettings? {
  guard let rawSettings else {
    return nil
  }

  return AppClaudeTerminalProfileSettings(
    model: rawSettings["model"] as? String,
    permissionMode: (rawSettings["permissionMode"] as? String).flatMap(AppClaudePermissionMode.init),
    effort: (rawSettings["effort"] as? String).flatMap(AppClaudeEffort.init)
  )
}

private func appCodexTerminalProfileSettings(
  from rawSettings: [String: Any]?
) -> AppCodexTerminalProfileSettings? {
  guard let rawSettings else {
    return nil
  }

  return AppCodexTerminalProfileSettings(
    model: rawSettings["model"] as? String,
    configProfile: rawSettings["configProfile"] as? String,
    approvalPolicy: (rawSettings["approvalPolicy"] as? String).flatMap(
      AppCodexApprovalPolicy.init
    ),
    sandboxMode: (rawSettings["sandboxMode"] as? String).flatMap(AppCodexSandboxMode.init),
    reasoningEffort: (rawSettings["reasoningEffort"] as? String).flatMap(
      AppCodexReasoningEffort.init
    ),
    webSearch: (rawSettings["webSearch"] as? String).flatMap(AppCodexWebSearchMode.init)
  )
}

private func appTerminalProfilesJSONObject(_ profiles: [String: AppTerminalProfile]) -> [String: Any] {
  var object: [String: Any] = [:]
  for profileID in profiles.keys.sorted() {
    guard let profile = profiles[profileID] else {
      continue
    }
    object[profileID] = appTerminalProfileJSONObject(profile)
  }
  return object
}

private func appTerminalProfileJSONObject(_ profile: AppTerminalProfile) -> [String: Any] {
  var object: [String: Any] = [
    "label": jsonValue(profile.label),
    "launcher": profile.launcher.rawValue
  ]

  if let command = profile.command {
    object["command"] = [
      "program": command.program,
      "args": command.args,
      "env": command.env,
    ]
  }

  switch profile.launcher {
  case .claude:
    object["settings"] = [
      "model": jsonValue(profile.claudeSettings?.model),
      "permissionMode": jsonValue(profile.claudeSettings?.permissionMode?.rawValue),
      "effort": jsonValue(profile.claudeSettings?.effort?.rawValue),
    ]
  case .codex:
    object["settings"] = [
      "model": jsonValue(profile.codexSettings?.model),
      "configProfile": jsonValue(profile.codexSettings?.configProfile),
      "approvalPolicy": jsonValue(profile.codexSettings?.approvalPolicy?.rawValue),
      "sandboxMode": jsonValue(profile.codexSettings?.sandboxMode?.rawValue),
      "reasoningEffort": jsonValue(profile.codexSettings?.reasoningEffort?.rawValue),
      "webSearch": jsonValue(profile.codexSettings?.webSearch?.rawValue),
    ]
  case .shell, .command, .opencode:
    break
  }

  return object
}

private func normalizeOptionalSettingValue(_ value: String?) -> String? {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return nil
  }

  return trimmed
}

private func normalizeFontSettingValue(_ value: String?, fallback: String) -> String {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return fallback
  }

  return trimmed
}

private func jsonValue(_ value: String?) -> Any {
  value ?? NSNull()
}

fileprivate struct LifecycleSettingsSnapshot {
  let object: [String: Any]
  let settings: AppSettingsSnapshot
  let path: String
}

private struct SettingsFileFingerprint: Equatable {
  let path: String
  let exists: Bool
  let modificationDate: Date?
  let size: NSNumber?
}

typealias AppThemeStore = AppSettingsStore

enum LifecyclePaths {
  static func settingsURL(environment: [String: String]) throws -> URL {
    try lifecycleRootURL(environment: environment)
      .appendingPathComponent(LifecyclePathDefaults.settingsFileName)
  }

  static func terminalThemeDirectoryURL(environment: [String: String]) throws -> URL {
    try lifecycleRootURL(environment: environment)
      .appendingPathComponent(LifecyclePathDefaults.cacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.desktopMacCacheDirectoryName, isDirectory: true)
      .appendingPathComponent(LifecyclePathDefaults.terminalThemeCacheDirectoryName, isDirectory: true)
  }

  static func lifecycleRootURL(environment: [String: String]) throws -> URL {
    try LifecycleEnvironment(values: environment).lifecycleRootURL()
  }
}

enum LifecycleSettingsFile {
  fileprivate static func read(
    from url: URL,
    fileManager: FileManager = .default
  ) throws -> LifecycleSettingsSnapshot {
    guard fileManager.fileExists(atPath: url.path) else {
      return LifecycleSettingsSnapshot(object: [:], settings: .default, path: url.path)
    }

    let data = try Data(contentsOf: url)
    let raw = try JSONSerialization.jsonObject(with: data)
    guard let object = raw as? [String: Any] else {
      throw ThemeSettingsError.invalidSettingsShape(url.path)
    }

    return LifecycleSettingsSnapshot(
      object: object,
      settings: parseSettings(from: object),
      path: url.path
    )
  }

  fileprivate static func writeSettings(
    _ settings: AppSettingsSnapshot,
    to url: URL,
    fileManager: FileManager = .default
  ) throws -> LifecycleSettingsSnapshot {
    var nextObject: [String: Any] = [:]
    var appearanceObject: [String: Any] = [:]
    appearanceObject["theme"] = settings.appearance.theme.rawValue
    appearanceObject["fonts"] = [
      "ui": settings.appearance.fonts.ui,
      "code": settings.appearance.fonts.code,
    ]
    appearanceObject["dimInactivePanes"] = settings.appearance.dimInactivePanes
    appearanceObject["inactivePaneOpacity"] = settings.appearance.inactivePaneOpacity
    nextObject["appearance"] = appearanceObject

    var providersObject: [String: Any] = [:]
    var claudeObject: [String: Any] = [:]
    claudeObject["loginMethod"] = settings.providers.claude.loginMethod.rawValue
    providersObject["claude"] = claudeObject
    nextObject["providers"] = providersObject

    var terminalObject: [String: Any] = [:]
    var commandObject: [String: Any] = [:]
    commandObject["program"] = jsonValue(settings.terminal.command.program)
    terminalObject["command"] = commandObject

    var persistenceObject: [String: Any] = [:]
    persistenceObject["backend"] = settings.terminal.persistence.backend.rawValue
    persistenceObject["mode"] = settings.terminal.persistence.mode.rawValue
    persistenceObject["executablePath"] = jsonValue(settings.terminal.persistence.executablePath)
    terminalObject["persistence"] = persistenceObject
    terminalObject["defaultProfile"] = settings.terminal.defaultProfile
    terminalObject["profiles"] = appTerminalProfilesJSONObject(settings.terminal.profiles)

    nextObject["terminal"] = terminalObject
    nextObject["developer"] = [
      "showOnboarding": settings.developer.showsOnboarding
    ]

    try write(nextObject, to: url, fileManager: fileManager)
    return LifecycleSettingsSnapshot(
      object: nextObject,
      settings: parseSettings(from: nextObject),
      path: url.path
    )
  }

  static func write(
    _ object: [String: Any],
    to url: URL,
    fileManager: FileManager = .default
  ) throws {
    let data = try JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys])
    if let parent = url.deletingLastPathComponent() as URL? {
      try fileManager.createDirectory(at: parent, withIntermediateDirectories: true)
    }

    let tempURL = url.deletingPathExtension().appendingPathExtension("json.tmp")
    try (data + Data([0x0A])).write(to: tempURL, options: [.atomic])
    if fileManager.fileExists(atPath: url.path) {
      _ = try fileManager.replaceItemAt(url, withItemAt: tempURL)
    } else {
      try fileManager.moveItem(at: tempURL, to: url)
    }
  }

  private static func parseSettings(from object: [String: Any]) -> AppSettingsSnapshot {
    let appearanceObject = object["appearance"] as? [String: Any]
    let providersObject = object["providers"] as? [String: Any]
    let claudeObject = providersObject?["claude"] as? [String: Any]
    let terminalObject = object["terminal"] as? [String: Any]
    let commandObject = terminalObject?["command"] as? [String: Any]
    let persistenceObject = terminalObject?["persistence"] as? [String: Any]
    let profileObjects = terminalObject?["profiles"] as? [String: Any]

    let theme = AppThemePreference(
      rawValue: appearanceObject?["theme"] as? String ?? ""
    ) ?? .dark
    let dimInactivePanes = (appearanceObject?["dimInactivePanes"] as? Bool) ?? true
    let fontsObject = appearanceObject?["fonts"] as? [String: Any]
    let fonts = AppAppearanceFontSettings(
      ui: normalizeFontSettingValue(
        fontsObject?["ui"] as? String,
        fallback: AppTypography.defaultUIFontName
      ),
      code: normalizeFontSettingValue(
        fontsObject?["code"] as? String,
        fallback: AppTypography.defaultCodeFontName
      )
    )
    let inactivePaneOpacity = clampedInactivePaneOpacity(
      (appearanceObject?["inactivePaneOpacity"] as? NSNumber)?.doubleValue ?? 0.52
    )
    let commandProgram = commandObject?["program"] as? String
    let claudeLoginMethod = AppClaudeLoginMethod(
      rawValue: claudeObject?["loginMethod"] as? String ?? ""
    ) ?? .claudeai
    let persistenceBackend = AppTerminalPersistenceBackend(
      rawValue: persistenceObject?["backend"] as? String ?? ""
    ) ?? .tmux
    let persistenceMode = AppTerminalPersistenceMode(
      rawValue: persistenceObject?["mode"] as? String ?? ""
    ) ?? .managed
    let persistenceExecutablePath = persistenceObject?["executablePath"] as? String
    let defaultProfile = (terminalObject?["defaultProfile"] as? String) ?? "shell"
    let profiles = appTerminalProfiles(from: profileObjects)

    return AppSettingsSnapshot(
      appearance: AppAppearanceSettings(
        theme: theme,
        fonts: fonts,
        dimInactivePanes: dimInactivePanes,
        inactivePaneOpacity: inactivePaneOpacity
      ),
      providers: AppProviderSettings(
        claude: AppClaudeProviderSettings(loginMethod: claudeLoginMethod)
      ),
      terminal: AppTerminalSettings(
        command: AppTerminalCommandSettings(program: commandProgram),
        persistence: AppTerminalPersistenceSettings(
          backend: persistenceBackend,
          mode: persistenceMode,
          executablePath: persistenceExecutablePath
        ),
        defaultProfile: defaultProfile,
        profiles: profiles
      ),
      developer: parseDeveloperSettings(from: object)
    )
  }

  fileprivate static func parseDeveloperSettings(from object: [String: Any]) -> AppDeveloperSettings {
    let developerObject = object["developer"] as? [String: Any]
    return AppDeveloperSettings(
      showsOnboarding: developerObject?["showOnboarding"] as? Bool ?? false
    )
  }

}

enum TerminalThemeConfigWriter {
  static func write(
    preset: AppThemePreset,
    codeFont: String = AppTypography.defaultCodeFontName,
    fileManager: FileManager = .default,
    environment: [String: String]
  ) throws -> AppTerminalThemeContext {
    let directoryURL = try LifecyclePaths.terminalThemeDirectoryURL(environment: environment)
    try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)

    let contents = render(preset: preset, codeFont: codeFont)
    let digest = SHA256.hash(data: Data(contents.utf8))
      .compactMap { String(format: "%02x", $0) }
      .joined()
    let fileURL = directoryURL.appendingPathComponent(
      "theme-\(preset.id.rawValue)-\(String(digest.prefix(12))).config"
    )

    if !fileManager.fileExists(atPath: fileURL.path) {
      try contents.write(to: fileURL, atomically: true, encoding: .utf8)
    }

    return AppTerminalThemeContext(
      themeConfigPath: fileURL.path,
      backgroundHexColor: preset.theme.terminalBackgroundHexColor,
      darkAppearance: preset.appearance.isDark
    )
  }

  static func render(
    preset: AppThemePreset,
    codeFont: String = AppTypography.defaultCodeFontName
  ) -> String {
    let tokens = preset.theme
    let terminalFont = normalizeFontSettingValue(
      codeFont,
      fallback: AppTypography.defaultCodeFontName
    )
    var lines = [
      "# Generated by Lifecycle.",
      "font-family = \(terminalFont)",
      "background = \(tokens.terminalSurfaceBackground)",
      "foreground = \(tokens.terminalForeground)",
      "cursor-color = \(tokens.terminalCursorColor)",
      "cursor-text = \(tokens.terminalSurfaceBackground)",
      "selection-background = \(tokens.surfaceSelected)",
      "selection-foreground = \(tokens.foreground)",
    ]

    lines.append(
      contentsOf: tokens.terminalPalette.map { index, value in
        "palette = \(index)=\(value)"
      }
    )

    return lines.joined(separator: "\n") + "\n"
  }
}

enum ThemeSettingsError: LocalizedError {
  case invalidSettingsShape(String)

  var errorDescription: String? {
    switch self {
    case let .invalidSettingsShape(path):
      "Lifecycle settings must be a JSON object: \(path)"
    }
  }
}
