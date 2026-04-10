import Foundation
import LifecyclePresentation

enum CommandPaletteCategory: String, CaseIterable {
  case navigation
  case workspace
  case terminal
  case panel
  case app

  var label: String {
    switch self {
    case .navigation:
      "Navigation"
    case .workspace:
      "Workspaces"
    case .terminal:
      "Terminals"
    case .panel:
      "Panels"
    case .app:
      "App"
    }
  }

  static let orderedSections: [CommandPaletteCategory] = [
    .navigation,
    .workspace,
    .terminal,
    .panel,
    .app,
  ]
}

struct CommandPaletteCommand: Identifiable {
  let id: String
  let category: CommandPaletteCategory
  let title: String
  let subtitle: String?
  let keywords: [String]
  let systemImage: String
  let priority: Double
  let shortcut: String?
  let perform: @MainActor () -> Void
}

struct CommandPaletteSectionItem: Identifiable {
  let command: CommandPaletteCommand
  let index: Int

  var id: String {
    command.id
  }
}

struct CommandPaletteSection: Identifiable {
  let id: String
  let label: String?
  let items: [CommandPaletteSectionItem]
}

struct CommandPaletteBuildContext {
  let repositories: [BridgeRepository]
  let selectedWorkspaceID: String?
  let canNavigateBack: Bool
  let canCloseActiveTab: Bool
  let activeGroupID: String?
  let availableExtensionKinds: Set<WorkspaceExtensionKind>
}

struct CommandPaletteHandlers {
  let openSettings: @MainActor () -> Void
  let navigateBack: @MainActor () -> Void
  let refresh: @MainActor () -> Void
  let exportFeedbackBundle: @MainActor () -> Void
  let openWorkspace: @MainActor (_ workspaceID: String) -> Void
  let createTerminalTab: @MainActor () -> Void
  let closeActiveTab: @MainActor () -> Void
  let splitActiveGroup: @MainActor (_ direction: CanvasTiledLayoutSplit.Direction) -> Void
  let selectExtension: @MainActor (_ kind: WorkspaceExtensionKind) -> Void
}

func buildCommandPaletteCommands(
  context: CommandPaletteBuildContext,
  handlers: CommandPaletteHandlers
) -> [CommandPaletteCommand] {
  var commands: [CommandPaletteCommand] = [
    CommandPaletteCommand(
      id: "navigation:settings",
      category: .navigation,
      title: "Open Settings",
      subtitle: "Preferences and terminal profiles",
      keywords: ["settings", "preferences", "config", "profile", "terminal"],
      systemImage: "gearshape",
      priority: 140,
      shortcut: "Cmd+,",
      perform: handlers.openSettings
    ),
  ]

  if context.canNavigateBack {
    commands.append(
      CommandPaletteCommand(
        id: "navigation:back",
        category: .navigation,
        title: "Go Back",
        subtitle: "Return to the previous screen",
        keywords: ["back", "previous", "navigate"],
        systemImage: "chevron.left",
        priority: 120,
        shortcut: "Cmd+[",
        perform: handlers.navigateBack
      )
    )
  }

  for repository in context.repositories {
    for workspace in repository.workspaces {
      let workspaceID = workspace.id
      let isSelected = workspaceID == context.selectedWorkspaceID
      commands.append(
        CommandPaletteCommand(
          id: "workspace:\(workspaceID)",
          category: .workspace,
          title: "\(repository.name) / \(workspace.name)",
          subtitle: commandPaletteWorkspaceSubtitle(for: workspace),
          keywords: commandPaletteWorkspaceKeywords(repository: repository, workspace: workspace),
          systemImage: isSelected ? "checkmark.circle.fill" : "circle",
          priority: isSelected ? 80 : 30,
          shortcut: nil,
          perform: { handlers.openWorkspace(workspaceID) }
        )
      )
    }
  }

  if context.selectedWorkspaceID != nil {
    commands.append(
      CommandPaletteCommand(
        id: "terminal:new",
        category: .terminal,
        title: "New Terminal",
        subtitle: "Create a new terminal tab in the active workspace",
        keywords: ["terminal", "tab", "shell", "new"],
        systemImage: "plus.rectangle.on.rectangle",
        priority: 150,
        shortcut: "Cmd+T",
        perform: handlers.createTerminalTab
      )
    )
  }

  if context.canCloseActiveTab {
    commands.append(
      CommandPaletteCommand(
        id: "terminal:close-active",
        category: .terminal,
        title: "Close Active Tab",
        subtitle: "Close the currently focused canvas surface",
        keywords: ["close", "tab", "surface", "terminal"],
        systemImage: "xmark.rectangle",
        priority: 110,
        shortcut: "Cmd+W",
        perform: handlers.closeActiveTab
      )
    )
  }

  if context.activeGroupID != nil {
    commands.append(contentsOf: [
      CommandPaletteCommand(
        id: "terminal:split-right",
        category: .terminal,
        title: "Split Right",
        subtitle: "Create a new terminal to the right of the active group",
        keywords: ["split", "right", "horizontal", "terminal"],
        systemImage: "rectangle.split.2x1",
        priority: 100,
        shortcut: nil,
        perform: { handlers.splitActiveGroup(.row) }
      ),
      CommandPaletteCommand(
        id: "terminal:split-down",
        category: .terminal,
        title: "Split Down",
        subtitle: "Create a new terminal below the active group",
        keywords: ["split", "down", "bottom", "vertical", "terminal"],
        systemImage: "rectangle.split.1x2",
        priority: 98,
        shortcut: nil,
        perform: { handlers.splitActiveGroup(.column) }
      ),
    ])
  }

  if context.availableExtensionKinds.contains(.stack) {
    commands.append(
      CommandPaletteCommand(
        id: "panel:stack",
        category: .panel,
        title: "Show Stack",
        subtitle: "Open the workspace stack sidebar",
        keywords: ["stack", "services", "processes", "sidebar"],
        systemImage: "square.stack.3d.down.right",
        priority: 90,
        shortcut: nil,
        perform: { handlers.selectExtension(.stack) }
      )
    )
  }

  if context.availableExtensionKinds.contains(.debug) {
    commands.append(
      CommandPaletteCommand(
        id: "panel:debug",
        category: .panel,
        title: "Show Debug",
        subtitle: "Open the workspace debug sidebar",
        keywords: ["debug", "diagnostics", "sidebar"],
        systemImage: "ladybug",
        priority: 88,
        shortcut: nil,
        perform: { handlers.selectExtension(.debug) }
      )
    )
  }

  commands.append(
    contentsOf: [
      CommandPaletteCommand(
        id: "app:refresh",
        category: .app,
        title: "Refresh",
        subtitle: "Reload bridge and workspace state",
        keywords: ["refresh", "reload", "bridge", "workspace"],
        systemImage: "arrow.clockwise",
        priority: 70,
        shortcut: nil,
        perform: handlers.refresh
      ),
      CommandPaletteCommand(
        id: "app:feedback",
        category: .app,
        title: "Export Feedback Bundle",
        subtitle: "Write a diagnostics bundle for support and debugging",
        keywords: ["feedback", "export", "bundle", "diagnostics", "logs"],
        systemImage: "square.and.arrow.up",
        priority: 60,
        shortcut: "Shift+Cmd+E",
        perform: handlers.exportFeedbackBundle
      ),
    ]
  )

  return commands
}

struct CommandPaletteMatchResult {
  let match: Bool
  let score: Double
}

func fuzzyMatchCommandPalette(query: String, text: String) -> CommandPaletteMatchResult {
  let loweredQuery = query.lowercased()
  let loweredText = text.lowercased()

  if loweredQuery.isEmpty {
    return CommandPaletteMatchResult(match: true, score: 0)
  }

  if loweredText.contains(loweredQuery) {
    let bonus = Double(loweredQuery.count) / Double(max(loweredText.count, 1))
    return CommandPaletteMatchResult(match: true, score: 100 + (bonus * 50))
  }

  var queryIndex = loweredQuery.startIndex
  var score = 0.0
  var consecutive = 0
  var previousMatchOffset = -2

  for (offset, character) in loweredText.enumerated() {
    guard queryIndex < loweredQuery.endIndex else {
      break
    }

    if character != loweredQuery[queryIndex] {
      consecutive = 0
      continue
    }

    queryIndex = loweredQuery.index(after: queryIndex)
    consecutive += 1
    score += 1

    if consecutive > 1 {
      score += Double(consecutive)
    }

    let previousCharacter = offset > 0 ? loweredText[loweredText.index(loweredText.startIndex, offsetBy: offset - 1)] : nil
    if offset == 0 || previousCharacter == " " || previousCharacter == "/" || previousCharacter == "-" {
      score += 5
    }

    if offset == previousMatchOffset + 1 {
      score += 2
    }

    previousMatchOffset = offset
  }

  if queryIndex < loweredQuery.endIndex {
    return CommandPaletteMatchResult(match: false, score: 0)
  }

  return CommandPaletteMatchResult(match: true, score: score)
}

func filterAndSortCommandPaletteCommands(
  query: String,
  commands: [CommandPaletteCommand]
) -> [CommandPaletteCommand] {
  let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
  if trimmedQuery.isEmpty {
    return commands.sorted { lhs, rhs in
      if lhs.priority == rhs.priority {
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
      }
      return lhs.priority > rhs.priority
    }
  }

  let scored: [(command: CommandPaletteCommand, score: Double)] = commands.compactMap { command in
    let titleResult = fuzzyMatchCommandPalette(query: trimmedQuery, text: command.title)
    let keywordResults = command.keywords.map { keyword in
      fuzzyMatchCommandPalette(query: trimmedQuery, text: keyword)
    }
    let bestKeywordScore = keywordResults.map(\.score).max() ?? 0
    let keywordMatch = keywordResults.contains(where: \.match)
    let bestScore = max(titleResult.score, bestKeywordScore * 0.8) + command.priority
    let matches = titleResult.match || keywordMatch

    guard matches else {
      return nil
    }

    return (command: command, score: bestScore)
  }
  return scored
    .sorted { lhs, rhs in
      if lhs.score == rhs.score {
        return lhs.command.title.localizedCaseInsensitiveCompare(rhs.command.title) == .orderedAscending
      }
      return lhs.score > rhs.score
    }
    .map(\.command)
}

func buildCommandPaletteSections(
  commands: [CommandPaletteCommand],
  grouped: Bool
) -> [CommandPaletteSection] {
  if !grouped {
    return [
      CommandPaletteSection(
        id: "results",
        label: nil,
        items: commands.enumerated().map { index, command in
          CommandPaletteSectionItem(command: command, index: index)
        }
      )
    ]
  }

  var groupedCommands: [CommandPaletteCategory: [CommandPaletteCommand]] = [:]
  for command in commands {
    groupedCommands[command.category, default: []].append(command)
  }

  var runningIndex = 0

  return CommandPaletteCategory.orderedSections.compactMap { category in
    guard let items = groupedCommands[category], !items.isEmpty else {
      return nil
    }

    let sectionItems = items.map { command in
      defer { runningIndex += 1 }
      return CommandPaletteSectionItem(command: command, index: runningIndex)
    }

    return CommandPaletteSection(
      id: category.rawValue,
      label: category.label,
      items: sectionItems
    )
  }
}

private func commandPaletteWorkspaceKeywords(
  repository: BridgeRepository,
  workspace: BridgeWorkspaceSummary
) -> [String] {
  [
    "workspace",
    repository.name,
    workspace.name,
    workspace.host,
    workspace.status,
    workspace.ref ?? "",
    workspace.path ?? "",
  ].filter { !$0.isEmpty }
}

private func commandPaletteWorkspaceSubtitle(for workspace: BridgeWorkspaceSummary) -> String {
  if let ref = workspace.ref?.trimmingCharacters(in: .whitespacesAndNewlines), !ref.isEmpty {
    return ref
  }

  return workspace.host
}
