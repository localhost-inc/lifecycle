import XCTest

@testable import Lifecycle

final class CommandPaletteTests: XCTestCase {
  func testBuildCommandPaletteCommandsIncludesWorkspaceAndActiveWorkspaceActions() {
    let repository = BridgeRepository(
      id: "repo-1",
      name: "lifecycle",
      source: "local",
      path: "/tmp/lifecycle",
      workspaces: [
        BridgeWorkspaceSummary(
          id: "ws-1",
          name: "main",
          host: "local",
          status: "ready",
          ref: "main",
          path: "/tmp/lifecycle"
        ),
        BridgeWorkspaceSummary(
          id: "ws-2",
          name: "feature/cli",
          host: "local",
          status: "ready",
          ref: "feature/cli",
          path: "/tmp/lifecycle-feature"
        ),
      ]
    )

    let commands = buildCommandPaletteCommands(
      context: CommandPaletteBuildContext(
        repositories: [repository],
        selectedWorkspaceID: "ws-2",
        canNavigateBack: true,
        canCloseActiveTab: true,
        activeGroupID: "group-1",
        availableExtensionKinds: [.stack, .debug]
      ),
      handlers: testCommandPaletteHandlers()
    )

    XCTAssertTrue(commands.contains(where: { $0.id == "navigation:settings" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "navigation:back" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "workspace:ws-1" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "workspace:ws-2" && $0.systemImage == "checkmark.circle.fill" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "terminal:new" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "terminal:close-active" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "terminal:split-right" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "terminal:split-down" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "panel:stack" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "panel:debug" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "app:refresh" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "app:feedback" }))
  }

  func testBuildCommandPaletteCommandsOmitsWorkspaceScopedActionsWithoutSelection() {
    let commands = buildCommandPaletteCommands(
      context: CommandPaletteBuildContext(
        repositories: [],
        selectedWorkspaceID: nil,
        canNavigateBack: false,
        canCloseActiveTab: false,
        activeGroupID: nil,
        availableExtensionKinds: []
      ),
      handlers: testCommandPaletteHandlers()
    )

    XCTAssertFalse(commands.contains(where: { $0.category == .terminal }))
    XCTAssertFalse(commands.contains(where: { $0.category == .panel }))
    XCTAssertFalse(commands.contains(where: { $0.id == "navigation:back" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "navigation:settings" }))
    XCTAssertTrue(commands.contains(where: { $0.id == "app:refresh" }))
  }

  func testFilterAndSortCommandPaletteCommandsPrioritizesBestMatchAndPriority() {
    let commands = [
      CommandPaletteCommand(
        id: "workspace:main",
        category: .workspace,
        title: "lifecycle / main",
        subtitle: "main",
        keywords: ["workspace", "main"],
        systemImage: "circle",
        priority: 10,
        shortcut: nil,
        perform: {}
      ),
      CommandPaletteCommand(
        id: "terminal:new",
        category: .terminal,
        title: "New Terminal",
        subtitle: "Create a new terminal tab",
        keywords: ["terminal", "shell", "tab"],
        systemImage: "terminal",
        priority: 120,
        shortcut: "Cmd+T",
        perform: {}
      ),
      CommandPaletteCommand(
        id: "app:refresh",
        category: .app,
        title: "Refresh",
        subtitle: "Reload bridge state",
        keywords: ["reload", "bridge"],
        systemImage: "arrow.clockwise",
        priority: 30,
        shortcut: nil,
        perform: {}
      ),
    ]

    XCTAssertEqual(
      filterAndSortCommandPaletteCommands(query: "term", commands: commands).map(\.id).first,
      "terminal:new"
    )
    XCTAssertEqual(
      filterAndSortCommandPaletteCommands(query: "", commands: commands).map(\.id),
      ["terminal:new", "app:refresh", "workspace:main"]
    )
  }

  func testBuildCommandPaletteSectionsGroupsByCategoryOrder() {
    let commands = [
      CommandPaletteCommand(
        id: "app:refresh",
        category: .app,
        title: "Refresh",
        subtitle: nil,
        keywords: ["refresh"],
        systemImage: "arrow.clockwise",
        priority: 20,
        shortcut: nil,
        perform: {}
      ),
      CommandPaletteCommand(
        id: "navigation:settings",
        category: .navigation,
        title: "Open Settings",
        subtitle: nil,
        keywords: ["settings"],
        systemImage: "gearshape",
        priority: 40,
        shortcut: nil,
        perform: {}
      ),
      CommandPaletteCommand(
        id: "workspace:main",
        category: .workspace,
        title: "lifecycle / main",
        subtitle: nil,
        keywords: ["workspace"],
        systemImage: "circle",
        priority: 10,
        shortcut: nil,
        perform: {}
      ),
    ]

    let sections = buildCommandPaletteSections(commands: commands, grouped: true)

    XCTAssertEqual(sections.map(\.id), ["navigation", "workspace", "app"])
    XCTAssertEqual(sections[0].items.map(\.command.id), ["navigation:settings"])
    XCTAssertEqual(sections[1].items.map(\.command.id), ["workspace:main"])
    XCTAssertEqual(sections[2].items.map(\.command.id), ["app:refresh"])
  }
}

private func testCommandPaletteHandlers() -> CommandPaletteHandlers {
  CommandPaletteHandlers(
    openSettings: {},
    navigateBack: {},
    refresh: {},
    exportFeedbackBundle: {},
    openWorkspace: { _ in },
    createTerminalTab: {},
    closeActiveTab: {},
    splitActiveGroup: { _ in },
    selectExtension: { _ in }
  )
}
