import Foundation
import XCTest

@testable import LifecycleDesktopMac

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

  func testAppThemeStoreWritesGhosttyThemeConfigIntoLifecycleCache() throws {
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

  func testGhosttyThemeConfigWriterRendersTerminalPaletteFromPresetTokens() {
    let preset = AppThemeCatalog.resolve(preference: .monokai, systemAppearance: .dark)
    let contents = GhosttyThemeConfigWriter.render(preset: preset)

    XCTAssertTrue(contents.contains("background = #272822"))
    XCTAssertTrue(contents.contains("foreground = #f8f8f2"))
    XCTAssertTrue(contents.contains("cursor-color = #66d9ef"))
    XCTAssertTrue(contents.contains("palette = 0=#403e41"))
    XCTAssertTrue(contents.contains("palette = 7=#ccccc6"))
    XCTAssertTrue(contents.contains("palette = 15=#f8f8f2"))
  }

  private func temporaryRootURL() -> URL {
    FileManager.default.temporaryDirectory
      .appendingPathComponent("lifecycle-desktop-mac-theme-tests", isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
  }
}
