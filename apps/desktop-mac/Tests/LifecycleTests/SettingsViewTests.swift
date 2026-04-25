import XCTest

@testable import Lifecycle

final class SettingsViewTests: XCTestCase {
  func testVisibleSettingsSectionsHidesDeveloperOutsideDev() {
    XCTAssertEqual(
      visibleSettingsSections(isDeveloperMode: false),
      [.appearance, .terminal, .connection]
    )
  }

  func testVisibleSettingsSectionsShowsDeveloperInDev() {
    XCTAssertEqual(
      visibleSettingsSections(isDeveloperMode: true),
      [.appearance, .terminal, .connection, .developer]
    )
  }

  func testOrderedTerminalProfilesKeepsBuiltInsAheadOfCustomProfiles() {
    let profiles: [String: AppTerminalProfile] = [
      "dev-server": AppTerminalProfile(
        id: "dev-server",
        launcher: .command,
        label: "Dev Server",
        command: AppTerminalProfileCommand(program: "npm", args: ["run", "dev"])
      ),
      "codex": AppTerminalProfile(
        id: "codex",
        launcher: .codex,
        label: "Codex",
        codexSettings: AppCodexTerminalProfileSettings()
      ),
      "shell": AppTerminalProfile(id: "shell", launcher: .shell, label: "Shell"),
      "claude": AppTerminalProfile(
        id: "claude",
        launcher: .claude,
        label: "Claude",
        claudeSettings: AppClaudeTerminalProfileSettings()
      ),
      "opencode": AppTerminalProfile(
        id: "opencode",
        launcher: .opencode,
        label: "OpenCode"
      ),
      "api": AppTerminalProfile(
        id: "api",
        launcher: .command,
        label: "API Server",
        command: AppTerminalProfileCommand(program: "bun", args: ["run", "api"])
      ),
    ]

    XCTAssertEqual(
      orderedTerminalProfiles(profiles).map(\.id),
      ["shell", "claude", "codex", "opencode", "api", "dev-server"]
    )
  }

  func testResolvedTerminalProfileSelectionPrefersCurrentWhenStillAvailable() {
    let profiles = orderedTerminalProfiles(defaultAppTerminalProfiles())

    XCTAssertEqual(
      resolvedTerminalProfileSelection(
        currentProfileID: "codex",
        defaultProfileID: "shell",
        profiles: profiles
      ),
      "codex"
    )
  }

  func testResolvedTerminalProfileSelectionFallsBackToDefaultThenFirstAvailable() {
    let profiles = orderedTerminalProfiles([
      "dev-server": AppTerminalProfile(
        id: "dev-server",
        launcher: .command,
        label: "Dev Server",
        command: AppTerminalProfileCommand(program: "npm", args: ["run", "dev"])
      )
    ])

    XCTAssertEqual(
      resolvedTerminalProfileSelection(
        currentProfileID: "codex",
        defaultProfileID: "dev-server",
        profiles: profiles
      ),
      "dev-server"
    )

    XCTAssertEqual(
      resolvedTerminalProfileSelection(
        currentProfileID: "missing",
        defaultProfileID: "also-missing",
        profiles: profiles
      ),
      "dev-server"
    )
  }

  func testCommandProfileEnvironmentSummaryIsStableAndReadable() {
    XCTAssertEqual(
      commandProfileEnvironmentSummary([
        "PORT": "3000",
        "NODE_ENV": "development",
      ]),
      "NODE_ENV=development\nPORT=3000"
    )
    XCTAssertEqual(commandProfileEnvironmentSummary([:]), "No overrides")
  }
}
