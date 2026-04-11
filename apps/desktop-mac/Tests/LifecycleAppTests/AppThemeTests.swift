import Foundation
import XCTest

@testable import LifecycleApp

@MainActor
final class AppThemeTests: XCTestCase {
  func testLifecyclePathsResolvesLifecycleRootFromEnvironment() throws {
    let url = try LifecyclePaths.lifecycleRootURL(
      environment: [
        "HOME": "/Users/kyle",
        "LIFECYCLE_ROOT": "~/custom-lifecycle",
      ]
    )

    XCTAssertEqual(url.path, "/Users/kyle/custom-lifecycle")
  }

  func testAppResourcesLoadsLifecycleLogoImage() {
    XCTAssertNotNil(AppResources.lifecycleLogoImage)
  }

  func testAppThemeStorePersistsThemePreferenceAndPreservesUnknownFields() throws {
    let rootURL = temporaryRootURL()
    let settingsURL = rootURL.appendingPathComponent("settings.json")
    try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    try """
    {
      "customUserField": 42,
      "theme": "dark"
    }
    """.write(to: settingsURL, atomically: true, encoding: .utf8)

    let store = AppThemeStore(
      environment: [
        "HOME": NSHomeDirectory(),
        "LIFECYCLE_ROOT": rootURL.path,
      ]
    )
    store.setThemePreference(.monokai)

    let data = try Data(contentsOf: settingsURL)
    let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let appearance = try XCTUnwrap(raw["appearance"] as? [String: Any])

    XCTAssertNil(raw["theme"])
    XCTAssertEqual(appearance["theme"] as? String, AppThemePreference.monokai.rawValue)
    XCTAssertEqual(raw["customUserField"] as? Int, 42)
  }

  func testAppThemeStoreWritesTerminalThemeConfigIntoLifecycleCache() throws {
    let rootURL = temporaryRootURL()
    let store = AppThemeStore(
      environment: [
        "HOME": NSHomeDirectory(),
        "LIFECYCLE_ROOT": rootURL.path,
      ]
    )

    store.setThemePreference(.rosePine)

    let configPath = store.terminalThemeContext.themeConfigPath
    XCTAssertTrue(configPath.hasPrefix(rootURL.path))
    XCTAssertTrue(FileManager.default.fileExists(atPath: configPath))

    let contents = try String(contentsOfFile: configPath, encoding: .utf8)
    XCTAssertTrue(contents.contains("background = #191724"))
    XCTAssertTrue(contents.contains("cursor-color = #ebbcba"))
    XCTAssertTrue(contents.contains("palette = 1=#eb6f92"))
    XCTAssertTrue(contents.contains("palette = 15=#f4f1ff"))
  }

  func testAppThemeStorePersistsTerminalSettingsInTheNewShape() throws {
    let rootURL = temporaryRootURL()
    let settingsURL = rootURL.appendingPathComponent("settings.json")
    try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    try """
    {
      "customUserField": 42,
      "terminal": {
        "shell": {
          "program": "/bin/bash"
        },
        "tmux": {
          "mode": "inherit",
          "program": "/usr/bin/tmux"
        }
      }
    }
    """.write(to: settingsURL, atomically: true, encoding: .utf8)

    let store = AppThemeStore(
      environment: [
        "HOME": NSHomeDirectory(),
        "LIFECYCLE_ROOT": rootURL.path,
      ]
    )

    store.setTerminalCommandProgram("/bin/zsh")
    store.setTerminalPersistenceMode(.managed)
    store.setTerminalPersistenceExecutablePath(nil)

    let data = try Data(contentsOf: settingsURL)
    let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let terminal = try XCTUnwrap(raw["terminal"] as? [String: Any])
    let command = try XCTUnwrap(terminal["command"] as? [String: Any])
    let persistence = try XCTUnwrap(terminal["persistence"] as? [String: Any])

    XCTAssertEqual(raw["customUserField"] as? Int, 42)
    XCTAssertNil(terminal["shell"])
    XCTAssertNil(terminal["tmux"])
    XCTAssertEqual(command["program"] as? String, "/bin/zsh")
    XCTAssertEqual(persistence["backend"] as? String, "tmux")
    XCTAssertEqual(persistence["mode"] as? String, "managed")
    XCTAssertNil(persistence["executablePath"])
  }

  func testAppThemeStorePersistsClaudeProviderAuthMode() throws {
    let rootURL = temporaryRootURL()
    let settingsURL = rootURL.appendingPathComponent("settings.json")
    try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    try """
    {
      "customUserField": 42
    }
    """.write(to: settingsURL, atomically: true, encoding: .utf8)

    let store = AppThemeStore(
      environment: [
        "HOME": NSHomeDirectory(),
        "LIFECYCLE_ROOT": rootURL.path,
      ]
    )

    store.setClaudeLoginMethod(.console)

    let data = try Data(contentsOf: settingsURL)
    let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let providers = try XCTUnwrap(raw["providers"] as? [String: Any])
    let claude = try XCTUnwrap(providers["claude"] as? [String: Any])

    XCTAssertEqual(raw["customUserField"] as? Int, 42)
    XCTAssertEqual(claude["loginMethod"] as? String, "console")
  }

  func testAppThemeStorePersistsTerminalProfilesInNewShape() throws {
    let rootURL = temporaryRootURL()
    let settingsURL = rootURL.appendingPathComponent("settings.json")
    try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
    try """
    {
      "customUserField": 42,
      "terminal": {
        "profiles": {
          "dev": {
            "launcher": "command",
            "label": "Dev Server",
            "command": {
              "program": "npm",
              "args": ["run", "dev"],
              "env": {
                "PORT": "3000"
              }
            }
          }
        }
      }
    }
    """.write(to: settingsURL, atomically: true, encoding: .utf8)

    let store = AppThemeStore(
      environment: [
        "HOME": NSHomeDirectory(),
        "LIFECYCLE_ROOT": rootURL.path,
      ]
    )

    store.setTerminalDefaultProfile("dev")
    store.setClaudeTerminalModel("claude-sonnet-4-6")
    store.setCodexTerminalConfigProfile("fast")
    store.setCodexTerminalWebSearch(.live)

    let data = try Data(contentsOf: settingsURL)
    let raw = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    let terminal = try XCTUnwrap(raw["terminal"] as? [String: Any])
    let profiles = try XCTUnwrap(terminal["profiles"] as? [String: Any])
    let claude = try XCTUnwrap(profiles["claude"] as? [String: Any])
    let claudeSettings = try XCTUnwrap(claude["settings"] as? [String: Any])
    let codex = try XCTUnwrap(profiles["codex"] as? [String: Any])
    let codexSettings = try XCTUnwrap(codex["settings"] as? [String: Any])
    let dev = try XCTUnwrap(profiles["dev"] as? [String: Any])

    XCTAssertEqual(raw["customUserField"] as? Int, 42)
    XCTAssertEqual(terminal["defaultProfile"] as? String, "dev")
    XCTAssertEqual(claudeSettings["model"] as? String, "claude-sonnet-4-6")
    XCTAssertEqual(codexSettings["configProfile"] as? String, "fast")
    XCTAssertEqual(codexSettings["webSearch"] as? String, "live")
    XCTAssertEqual(dev["launcher"] as? String, "command")
  }

  func testTerminalThemeConfigWriterRendersTerminalPaletteFromPresetTokens() {
    let preset = AppThemeCatalog.resolve(preference: .monokai, systemAppearance: .dark)
    let contents = TerminalThemeConfigWriter.render(preset: preset)

    XCTAssertTrue(contents.contains("background = #272822"))
    XCTAssertTrue(contents.contains("foreground = #f8f8f2"))
    XCTAssertTrue(contents.contains("cursor-color = #66d9ef"))
    XCTAssertTrue(contents.contains("palette = 0=#403e41"))
    XCTAssertTrue(contents.contains("palette = 7=#ccccc6"))
    XCTAssertTrue(contents.contains("palette = 15=#f8f8f2"))
  }

  private func temporaryRootURL() -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("lifecycle-theme-tests", isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
  }
}
