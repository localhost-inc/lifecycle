import Combine
import CryptoKit
import Foundation
import SwiftUI

struct AppTerminalThemeContext: Equatable, Sendable {
  let themeConfigPath: String
  let backgroundHexColor: String
  let darkAppearance: Bool

  static let fallback = AppTerminalThemeContext(
    themeConfigPath: AppResources.bundledGhosttyThemeConfigPath(),
    backgroundHexColor: AppThemeCatalog.defaultPreset.tokens.terminalBackgroundHexColor,
    darkAppearance: AppThemeCatalog.defaultPreset.appearance.isDark
  )
}

struct AppAppearanceSettings: Equatable, Sendable {
  var theme: AppThemePreference = .dark
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

struct AppTerminalSettings: Equatable, Sendable {
  var command = AppTerminalCommandSettings()
  var persistence = AppTerminalPersistenceSettings()
}

struct AppSettingsSnapshot: Equatable, Sendable {
  var appearance = AppAppearanceSettings()
  var terminal = AppTerminalSettings()

  static let `default` = AppSettingsSnapshot()

  init() {}

  init(
    appearance: AppAppearanceSettings,
    terminal: AppTerminalSettings
  ) {
    self.appearance = appearance
    self.terminal = terminal
  }

  init(bridgeSettings: BridgeSettings) {
    appearance = AppAppearanceSettings(
      theme: AppThemePreference(rawValue: bridgeSettings.appearance.theme) ?? .dark
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
      )
    )
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

  private let fileManager: FileManager
  private let environment: [String: String]
  private var persistedObject: [String: Any]
  private var systemAppearance: AppThemeAppearance
  private var bridgeClient: BridgeClient?
  private var settingsWatcher: AnyCancellable?
  private var lastObservedSettingsFingerprint: SettingsFileFingerprint?

  init(
    fileManager: FileManager = .default,
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) {
    self.fileManager = fileManager
    self.environment = environment
    self.systemAppearance = .dark

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
    refreshThemeArtifacts()
    startWatchingSettingsFile()
  }

  var theme: AppThemeTokens { resolvedTheme.tokens }

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

  private func updateSettings(
    bridgePayload: [String: Any],
    mutate: (inout AppSettingsSnapshot) -> Void
  ) {
    var nextSettings = settings
    mutate(&nextSettings)
    applyInMemorySettings(nextSettings)

    if bridgeClient != nil {
      Task {
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
        applyRemoteSettings(envelope)
        syncPersistedObjectFromDisk()
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
    refreshThemeArtifacts()
  }

  private func reloadSettings(preferBridge: Bool) async {
    if preferBridge, let bridgeClient {
      do {
        let envelope = try await bridgeClient.settings()
        applyRemoteSettings(envelope)
        syncPersistedObjectFromDisk()
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
    applyInMemorySettings(AppSettingsSnapshot(bridgeSettings: envelope.settings))
    settingsPath = envelope.settingsPath
    startWatchingSettingsFile()
  }

  private func syncPersistedObjectFromDisk() {
    let path = settingsPath.isEmpty
      ? ((try? LifecyclePaths.settingsURL(environment: environment).path) ?? "")
      : settingsPath
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

  private func refreshThemeArtifacts() {
    resolvedTheme = AppThemeCatalog.resolve(preference: preference, systemAppearance: systemAppearance)

    do {
      terminalThemeContext = try GhosttyThemeConfigWriter.write(
        preset: resolvedTheme,
        fileManager: fileManager,
        environment: environment
      )
      errorMessage = nil
    } catch {
      terminalThemeContext = AppTerminalThemeContext(
        themeConfigPath: AppResources.bundledGhosttyThemeConfigPath(),
        backgroundHexColor: resolvedTheme.tokens.terminalBackgroundHexColor,
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

private func normalizeOptionalSettingValue(_ value: String?) -> String? {
  guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
    return nil
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
  private static let defaultLifecycleRoot = "~/.lifecycle"

  static func settingsURL(environment: [String: String]) throws -> URL {
    try lifecycleRootURL(environment: environment).appendingPathComponent("settings.json")
  }

  static func ghosttyThemeDirectoryURL(environment: [String: String]) throws -> URL {
    try lifecycleRootURL(environment: environment)
      .appendingPathComponent("cache", isDirectory: true)
      .appendingPathComponent("desktop-mac", isDirectory: true)
      .appendingPathComponent("ghostty", isDirectory: true)
  }

  static func lifecycleRootURL(environment: [String: String]) throws -> URL {
    if let configured = environment["LIFECYCLE_ROOT"]?.trimmingCharacters(in: .whitespacesAndNewlines),
       !configured.isEmpty
    {
      return try expandedAbsoluteURL(path: configured, environment: environment)
    }

    return try expandedAbsoluteURL(path: defaultLifecycleRoot, environment: environment)
  }

  private static func expandedAbsoluteURL(
    path: String,
    environment: [String: String]
  ) throws -> URL {
    let expanded: String
    if path == "~" || path.hasPrefix("~/") {
      guard let home = environment["HOME"]?.trimmingCharacters(in: .whitespacesAndNewlines),
            !home.isEmpty
      else {
        throw ThemeSettingsError.homeDirectoryUnavailable
      }

      expanded = NSString(string: path.replacingOccurrences(of: "~", with: home, options: [.anchored], range: nil)).expandingTildeInPath
    } else {
      expanded = NSString(string: path).expandingTildeInPath
    }

    guard expanded.hasPrefix("/") else {
      throw ThemeSettingsError.invalidLifecycleRoot(path)
    }

    return URL(fileURLWithPath: expanded, isDirectory: true)
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
    let current = try read(from: url, fileManager: fileManager)
    var nextObject = current.object
    var appearanceObject = (nextObject["appearance"] as? [String: Any]) ?? [:]
    appearanceObject["theme"] = settings.appearance.theme.rawValue
    nextObject["appearance"] = appearanceObject
    nextObject.removeValue(forKey: "theme")

    var terminalObject = migrateLegacyTerminalObject(
      nextObject["terminal"] as? [String: Any]
    )
    var commandObject = (terminalObject["command"] as? [String: Any]) ?? [:]
    if let program = settings.terminal.command.program {
      commandObject["program"] = program
    } else {
      commandObject.removeValue(forKey: "program")
    }
    terminalObject["command"] = commandObject

    var persistenceObject = (terminalObject["persistence"] as? [String: Any]) ?? [:]
    persistenceObject["backend"] = settings.terminal.persistence.backend.rawValue
    persistenceObject["mode"] = settings.terminal.persistence.mode.rawValue
    if let executablePath = settings.terminal.persistence.executablePath {
      persistenceObject["executablePath"] = executablePath
    } else {
      persistenceObject.removeValue(forKey: "executablePath")
    }
    terminalObject["persistence"] = persistenceObject

    nextObject["terminal"] = terminalObject
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
    let terminalObject = object["terminal"] as? [String: Any]
    let commandObject = terminalObject?["command"] as? [String: Any]
    let shellObject = terminalObject?["shell"] as? [String: Any]
    let persistenceObject = terminalObject?["persistence"] as? [String: Any]
    let tmuxObject = terminalObject?["tmux"] as? [String: Any]

    let theme = AppThemePreference(
      rawValue: (appearanceObject?["theme"] as? String) ?? (object["theme"] as? String) ?? ""
    ) ?? .dark
    let commandProgram = (commandObject?["program"] as? String) ?? (shellObject?["program"] as? String)
    let persistenceBackend = AppTerminalPersistenceBackend(
      rawValue: persistenceObject?["backend"] as? String ?? ""
    ) ?? .tmux
    let persistenceMode = AppTerminalPersistenceMode(
      rawValue: (persistenceObject?["mode"] as? String) ?? (tmuxObject?["mode"] as? String) ?? ""
    ) ?? .managed
    let persistenceExecutablePath = (persistenceObject?["executablePath"] as? String) ??
      (tmuxObject?["program"] as? String)

    return AppSettingsSnapshot(
      appearance: AppAppearanceSettings(theme: theme),
      terminal: AppTerminalSettings(
        command: AppTerminalCommandSettings(program: commandProgram),
        persistence: AppTerminalPersistenceSettings(
          backend: persistenceBackend,
          mode: persistenceMode,
          executablePath: persistenceExecutablePath
        )
      )
    )
  }

  private static func migrateLegacyTerminalObject(_ terminalObject: [String: Any]?) -> [String: Any] {
    var nextObject = terminalObject ?? [:]
    let shellObject = nextObject["shell"] as? [String: Any]
    let tmuxObject = nextObject["tmux"] as? [String: Any]

    var commandObject = (nextObject["command"] as? [String: Any]) ?? [:]
    if commandObject["program"] == nil, let shellProgram = shellObject?["program"] {
      commandObject["program"] = shellProgram
    }
    nextObject["command"] = commandObject

    var persistenceObject = (nextObject["persistence"] as? [String: Any]) ?? [:]
    if persistenceObject["backend"] == nil {
      persistenceObject["backend"] = AppTerminalPersistenceBackend.tmux.rawValue
    }
    if persistenceObject["mode"] == nil, let tmuxMode = tmuxObject?["mode"] {
      persistenceObject["mode"] = tmuxMode
    }
    if persistenceObject["executablePath"] == nil, let tmuxProgram = tmuxObject?["program"] {
      persistenceObject["executablePath"] = tmuxProgram
    }
    nextObject["persistence"] = persistenceObject
    nextObject.removeValue(forKey: "shell")
    nextObject.removeValue(forKey: "tmux")
    return nextObject
  }
}

enum GhosttyThemeConfigWriter {
  static func write(
    preset: AppThemePreset,
    fileManager: FileManager = .default,
    environment: [String: String]
  ) throws -> AppTerminalThemeContext {
    let directoryURL = try LifecyclePaths.ghosttyThemeDirectoryURL(environment: environment)
    try fileManager.createDirectory(at: directoryURL, withIntermediateDirectories: true)

    let contents = render(preset: preset)
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
      backgroundHexColor: preset.tokens.terminalBackgroundHexColor,
      darkAppearance: preset.appearance.isDark
    )
  }

  static func render(preset: AppThemePreset) -> String {
    let tokens = preset.tokens
    var lines = [
      "# Generated by lifecycle-desktop-mac.",
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
  case homeDirectoryUnavailable
  case invalidLifecycleRoot(String)
  case invalidSettingsShape(String)

  var errorDescription: String? {
    switch self {
    case .homeDirectoryUnavailable:
      "HOME is not set, so desktop settings could not be resolved."
    case let .invalidLifecycleRoot(path):
      "LIFECYCLE_ROOT must be absolute or start with ~/: \(path)"
    case let .invalidSettingsShape(path):
      "Lifecycle settings must be a JSON object: \(path)"
    }
  }
}
