import AppKit
import LifecyclePresentation
import LifecycleTerminalHost
import SwiftUI

@MainActor
extension AppModel {
  func refresh() {
    AppLog.info(.app, "Manual refresh requested")
    Task {
      await reload()
    }
  }

  func addRepository() {
    Task {
      await addRepositoryTask()
    }
  }

  func removeRepository(_ repositoryID: String) {
    Task {
      await removeRepositoryTask(repositoryID)
    }
  }

  func createWorkspace(for repositoryID: String, name: String, host: WorkspaceCreationHost = .local) {
    Task {
      await createWorkspaceTask(for: repositoryID, name: name, host: host)
    }
  }

  func archiveWorkspace(_ workspaceID: String, repositoryPath: String) {
    Task {
      await archiveWorkspaceTask(workspaceID, repositoryPath: repositoryPath)
    }
  }

  func select(
    repository: BridgeRepository,
    workspace: BridgeWorkspaceSummary,
    autoCreateInitialTerminal: Bool = false
  ) {
    selectedRepositoryID = repository.id
    selectedWorkspaceID = workspace.id
    openedWorkspaceIDs.insert(workspace.id)
    setAppSidebarRepositoryExpanded(true, repositoryID: repository.id)
    subscribeToWorkspaceSocketTopics([workspace.id])
    if autoCreateInitialTerminal {
      pendingInitialTerminalWorkspaceIDs.insert(workspace.id)
    }
    Self.persistLastWorkspace(workspaceID: workspace.id, repositoryID: repository.id)
    AppLog.notice(
      .workspace,
      "Selected workspace",
      metadata: [
        "repositoryID": repository.id,
        "workspaceID": workspace.id,
      ]
    )

    Task {
      await openWorkspace(workspace.id)
    }
  }

  func selectWorkspace(id workspaceID: String) {
    guard let repository = repositories.first(where: { repository in
      repository.workspaces.contains(where: { $0.id == workspaceID })
    }),
      let workspace = repository.workspaces.first(where: { $0.id == workspaceID })
    else {
      return
    }

    select(repository: repository, workspace: workspace)
  }

  var selectedRepository: BridgeRepository? {
    repositories.first(where: { $0.id == selectedRepositoryID })
  }

  func repository(for workspaceID: String) -> BridgeRepository? {
    repositories.first { repository in
      repository.workspaces.contains(where: { $0.id == workspaceID })
    }
  }

  var selectedWorkspace: BridgeWorkspaceSummary? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return repositories
      .flatMap(\.workspaces)
      .first(where: { $0.id == selectedWorkspaceID })
  }

  func bootstrap() async {
    await AppSignpost.withInterval(.app, "App Bootstrap") {
      isLoading = true
      defer { isLoading = false }

      do {
        _ = try await rediscoverBridgeClient(startIfNeeded: true, resetTerminalConnections: false)
        endBridgeRecovery()
        clearError()

        try await loadAuthState()
        try await loadRepositories()
        await loadProviderAuthStatuses(force: true)
        await openSelectedWorkspaceIfNeeded()
        connectSocket()
        AppLog.notice(.app, "App bootstrap completed")
      } catch {
        if handleRecoverableBridgeFailure(
          error,
          message: "App bootstrap is waiting for a healthy bridge"
        ) {
          return
        }

        reportError(error, category: .app, message: "App bootstrap failed")
      }
    }
  }

  func reload() async {
    guard bridgeClient != nil else {
      await bootstrap()
      return
    }

    await AppSignpost.withInterval(.app, "App Reload") {
      isLoading = true
      defer { isLoading = false }

      do {
        _ = try await rediscoverBridgeClient(startIfNeeded: true, resetTerminalConnections: false)
        endBridgeRecovery()
        try await loadAuthState()
        try await loadRepositories()
        await loadProviderAuthStatuses(force: true)
        await openSelectedWorkspaceIfNeeded()
        clearError()
        AppLog.info(.app, "App reload completed")
      } catch {
        if handleRecoverableBridgeFailure(
          error,
          message: "App reload is waiting for a healthy bridge"
        ) {
          return
        }

        reportError(error, category: .app, message: "App reload failed")
      }
    }
  }

  func openWorkspace(_ workspaceID: String) async {
    await AppSignpost.withInterval(.workspace, "Open Workspace") {
      await loadTerminals(for: workspaceID, force: false)
      await ensureInitialTerminalTabIfNeeded(for: workspaceID)
      await loadStack(for: workspaceID, force: false)
      if workspaceCanvasDocumentContainsAgentSurface(canvasDocumentsByWorkspaceID[workspaceID]) {
        await loadAgents(for: workspaceID, force: false)
        enterVisibleAgentIfPresent(for: workspaceID)
      }
      AppLog.info(.workspace, "Workspace content loaded", metadata: ["workspaceID": workspaceID])
    }
  }

  func addRepositoryTask() async {
    guard let directoryURL = chooseRepositoryDirectory() else {
      return
    }

    let repositoryPath = directoryURL.standardizedFileURL.path
    let nextRepositoryName = repositoryName(from: repositoryPath)
    let rootWorkspaceName = preferredRootWorkspaceName(
      branchName: await detectRepositoryBranch(at: repositoryPath),
      repositoryName: nextRepositoryName
    )

    do {
      let response = try await AppSignpost.withInterval(.workspace, "Add Repository") {
        try await withBridgeRequest { client in
          try await client.createRepository(
            path: repositoryPath,
            name: nextRepositoryName,
            rootWorkspaceName: rootWorkspaceName,
            sourceRef: rootWorkspaceName
          )
        }
      }

      try await loadRepositories()
      clearError()

      if let repository = repositories.first(where: { $0.id == response.id }) {
        selectRepository(repository, autoCreateInitialTerminal: true)
      }

      AppLog.notice(
        .workspace,
        "Added repository",
        metadata: [
          "repositoryID": response.id,
          "repositoryPath": repositoryPath,
          "created": response.created ? "true" : "false",
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to add repository",
        metadata: ["repositoryPath": repositoryPath]
      )
    }
  }

  func removeRepositoryTask(_ repositoryID: String) async {
    do {
      try await AppSignpost.withInterval(.workspace, "Remove Repository") {
        let _: Void = try await withBridgeRequest { client in
          try await client.deleteRepository(repositoryID)
        }
      }

      try await loadRepositories()
      clearError()
      AppLog.notice(
        .workspace,
        "Removed repository",
        metadata: ["repositoryID": repositoryID]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to remove repository",
        metadata: ["repositoryID": repositoryID]
      )
    }
  }

  func createWorkspaceTask(
    for repositoryID: String,
    name: String,
    host: WorkspaceCreationHost
  ) async {
    guard let repository = repositories.first(where: { $0.id == repositoryID }) else {
      return
    }

    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedName.isEmpty else {
      return
    }

    let workspaceSeed = UUID().uuidString.lowercased()
    let sourceRef = workspaceBranchName(workspaceName: trimmedName, workspaceID: workspaceSeed)

    do {
      let response = try await AppSignpost.withInterval(.workspace, "Create Workspace") {
        try await withBridgeRequest { client in
          try await client.createWorkspace(
            repoPath: repository.path,
            name: trimmedName,
            sourceRef: sourceRef,
            host: host.rawValue
          )
        }
      }

      try await loadRepositories()
      clearError()

      if let refreshedRepository = repositories.first(where: { $0.id == repositoryID }),
        let workspace = refreshedRepository.workspaces.first(where: { $0.id == response.id })
      {
        select(
          repository: refreshedRepository,
          workspace: workspace,
          autoCreateInitialTerminal: true
        )
      }

      AppLog.notice(
        .workspace,
        "Created workspace",
        metadata: [
          "repositoryID": repositoryID,
          "workspaceID": response.id,
          "workspaceName": trimmedName,
          "host": host.rawValue,
          "sourceRef": sourceRef,
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to create workspace",
        metadata: [
          "repositoryID": repositoryID,
          "workspaceName": trimmedName,
          "host": host.rawValue,
        ]
      )
    }
  }

  func archiveWorkspaceTask(_ workspaceID: String, repositoryPath: String) async {
    do {
      let response = try await AppSignpost.withInterval(.workspace, "Archive Workspace") {
        try await withBridgeRequest { client in
          try await client.archiveWorkspace(workspaceID, repoPath: repositoryPath)
        }
      }

      try await loadRepositories()
      await openSelectedWorkspaceIfNeeded()
      clearError()
      AppLog.notice(
        .workspace,
        "Archived workspace",
        metadata: [
          "workspaceID": workspaceID,
          "repositoryPath": repositoryPath,
          "workspaceName": response.name,
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to archive workspace",
        metadata: [
          "workspaceID": workspaceID,
          "repositoryPath": repositoryPath,
        ]
      )
    }
  }

  func loadRepositories() async throws {
    let repositories = try await AppSignpost.withInterval(.workspace, "Load Repositories") {
      try await withBridgeRequest { client in
        try await client.repositories()
      }
    }
    self.repositories = repositories

    let allWorkspaceIDs = Set(repositories.flatMap(\.workspaces).map(\.id))
    openedWorkspaceIDs.formIntersection(allWorkspaceIDs)
    stackSummaryByWorkspaceID = stackSummaryByWorkspaceID.filter { allWorkspaceIDs.contains($0.key) }
    restorePersistedCanvasDocuments(validWorkspaceIDs: allWorkspaceIDs)
    restorePersistedExtensionSidebarLayoutState(validWorkspaceIDs: allWorkspaceIDs)
    AppLog.info(
      .workspace,
      "Loaded repositories",
      metadata: [
        "repositoryCount": String(repositories.count),
        "workspaceCount": String(allWorkspaceIDs.count),
      ]
    )

    // Keep current selection if still valid
    if let selectedRepositoryID,
       repositories.contains(where: { $0.id == selectedRepositoryID }),
       let selectedWorkspaceID,
       repositories.flatMap(\.workspaces).contains(where: { $0.id == selectedWorkspaceID })
    {
      openedWorkspaceIDs.insert(selectedWorkspaceID)
      restorePersistedAppSidebarLayoutState(
        validRepositoryIDs: Set(repositories.map(\.id)),
        defaultExpandedRepositoryID: selectedRepositoryID
      )
      return
    }

    // Try restoring persisted selection
    let allWorkspaces = repositories.flatMap(\.workspaces)
    if let persisted = Self.loadLastWorkspace(),
       repositories.contains(where: { $0.id == persisted.repositoryID }),
       allWorkspaces.contains(where: { $0.id == persisted.workspaceID })
    {
      selectedRepositoryID = persisted.repositoryID
      selectedWorkspaceID = persisted.workspaceID
      openedWorkspaceIDs.insert(persisted.workspaceID)
      restorePersistedAppSidebarLayoutState(
        validRepositoryIDs: Set(repositories.map(\.id)),
        defaultExpandedRepositoryID: selectedRepositoryID
      )
      return
    }

    // Fall back to first workspace
    if let firstRepository = repositories.first {
      selectedRepositoryID = firstRepository.id
      if let firstWorkspace = firstRepository.workspaces.first {
        selectedWorkspaceID = firstWorkspace.id
        openedWorkspaceIDs.insert(firstWorkspace.id)
      } else {
        selectedWorkspaceID = nil
      }
    } else {
      selectedRepositoryID = nil
      selectedWorkspaceID = nil
    }

    restorePersistedAppSidebarLayoutState(
      validRepositoryIDs: Set(repositories.map(\.id)),
      defaultExpandedRepositoryID: selectedRepositoryID
    )
  }

  func openSelectedWorkspaceIfNeeded() async {
    guard let selectedWorkspaceID else {
      return
    }

    await openWorkspace(selectedWorkspaceID)
  }

  func workspaceSummary(for workspaceID: String) -> BridgeWorkspaceSummary? {
    repositories
      .flatMap(\.workspaces)
      .first(where: { $0.id == workspaceID })
  }

  func ensureWorkspaceStore(for workspaceID: String) -> WorkspaceStore {
    if let existing = workspaceStoresByID[workspaceID] {
      existing.syncFromModel()
      return existing
    }

    let store = WorkspaceStore(workspaceID: workspaceID, model: self)
    workspaceStoresByID[workspaceID] = store
    return store
  }

  func syncWorkspaceStore(for workspaceID: String) {
    workspaceStoresByID[workspaceID]?.syncFromModel()
  }

  func syncAllWorkspaceStores() {
    for store in workspaceStoresByID.values {
      store.syncFromModel()
    }
  }

  func chooseRepositoryDirectory() -> URL? {
    let panel = NSOpenPanel()
    panel.canChooseDirectories = true
    panel.canChooseFiles = false
    panel.canCreateDirectories = false
    panel.allowsMultipleSelection = false
    panel.prompt = "Open"
    panel.message = "Choose a repository folder to add to Lifecycle."
    panel.directoryURL = FileManager.default.homeDirectoryForCurrentUser

    guard panel.runModal() == .OK else {
      return nil
    }

    return panel.url
  }

  func detectRepositoryBranch(at repositoryPath: String) async -> String? {
    let output = try? await ProcessRunner.run(
      program: "git",
      args: ["rev-parse", "--abbrev-ref", "HEAD"],
      cwd: repositoryPath
    )
    return output?.stdout
  }

  func selectRepository(
    _ repository: BridgeRepository,
    autoCreateInitialTerminal: Bool = false
  ) {
    selectedRepositoryID = repository.id
    setAppSidebarRepositoryExpanded(true, repositoryID: repository.id)

    guard let workspace = preferredRepositoryWorkspace(repository) else {
      selectedWorkspaceID = nil
      return
    }

    select(
      repository: repository,
      workspace: workspace,
      autoCreateInitialTerminal: autoCreateInitialTerminal
    )
  }

  static func persistLastWorkspace(workspaceID: String, repositoryID: String) {
    UserDefaults.standard.set(workspaceID, forKey: lastWorkspaceIDKey)
    UserDefaults.standard.set(repositoryID, forKey: lastRepositoryIDKey)
  }

  static func loadLastWorkspace() -> (workspaceID: String, repositoryID: String)? {
    guard let workspaceID = UserDefaults.standard.string(forKey: lastWorkspaceIDKey),
          let repositoryID = UserDefaults.standard.string(forKey: lastRepositoryIDKey)
    else {
      return nil
    }
    return (workspaceID, repositoryID)
  }
}
