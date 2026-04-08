import XCTest

@testable import LifecycleApp

final class SettingsViewTests: XCTestCase {
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
      "api": AppTerminalProfile(
        id: "api",
        launcher: .command,
        label: "API Server",
        command: AppTerminalProfileCommand(program: "bun", args: ["run", "api"])
      ),
    ]

    XCTAssertEqual(
      orderedTerminalProfiles(profiles).map(\.id),
      ["shell", "claude", "codex", "api", "dev-server"]
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
