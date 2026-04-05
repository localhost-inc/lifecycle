import Combine
import Foundation

let defaultWorkspaceExtensionSidebarWidth: CGFloat = 320
let minimumWorkspaceExtensionSidebarWidth: CGFloat = 260
let maximumWorkspaceExtensionSidebarWidth: CGFloat = 420
let minimumWorkspaceCanvasWidth: CGFloat = 480
let workspaceExtensionSidebarDividerThickness: CGFloat = 12

func clampedWorkspaceExtensionSidebarWidth(_ width: CGFloat, availableWidth: CGFloat) -> CGFloat {
  guard availableWidth.isFinite, availableWidth > 0 else {
    return min(max(width, minimumWorkspaceExtensionSidebarWidth), maximumWorkspaceExtensionSidebarWidth)
  }

  let upperBound = min(
    maximumWorkspaceExtensionSidebarWidth,
    max(availableWidth - minimumWorkspaceCanvasWidth, 0)
  )
  let lowerBound = min(minimumWorkspaceExtensionSidebarWidth, upperBound)
  return min(max(width, lowerBound), upperBound)
}

@MainActor
final class AppModel: ObservableObject {
  @Published var bridgeURL: URL?
  @Published var bridgeClient: BridgeClient?
  @Published var repositories: [BridgeRepository] = []
  @Published var activityByWorkspaceID: [String: BridgeWorkspaceActivity] = [:]
  @Published var terminalEnvelopeByWorkspaceID: [String: BridgeWorkspaceTerminalsEnvelope] = [:]
  @Published var terminalConnectionBySurfaceID: [String: BridgeTerminalConnection] = [:]
  @Published private var canvasDocumentsByWorkspaceID: [String: WorkspaceCanvasDocument] = [:]
  @Published private var activeExtensionKindByWorkspaceID: [String: WorkspaceExtensionKind] = [:]
  @Published private var extensionSidebarWidthByWorkspaceID: [String: CGFloat] = [:]
  @Published var terminalThemeContext: AppTerminalThemeContext = .fallback
  @Published var selectedRepositoryID: String?
  @Published var selectedWorkspaceID: String?
  @Published var isLoading = false
  @Published var errorMessage: String?
  @Published var terminalLoadingWorkspaceIDs = Set<String>()
  @Published private(set) var openedWorkspaceIDs = Set<String>()

  private var bridgePID: Int?
  private var bridgeMonitorTask: Task<Void, Never>?
  private let bridgeSocket = BridgeSocket()
  private var didStart = false

  deinit {
    bridgeMonitorTask?.cancel()
  }

  func start() {
    guard !didStart else {
      return
    }

    didStart = true
    registerSurfaces()
    registerExtensions()
    Task {
      await bootstrap()
    }
  }

  private func registerSurfaces() {
    SurfaceRegistry.shared.register(TerminalSurfaceDefinition())
  }

  private func registerExtensions() {
    WorkspaceExtensionRegistry.shared.register(DebugExtensionDefinition())
  }

  func refresh() {
    Task {
      await reload()
    }
  }

  func select(repository: BridgeRepository, workspace: BridgeWorkspaceSummary) {
    selectedRepositoryID = repository.id
    selectedWorkspaceID = workspace.id
    openedWorkspaceIDs.insert(workspace.id)
    Self.persistLastWorkspace(workspaceID: workspace.id, repositoryID: repository.id)

    Task {
      await loadTerminals(for: workspace.id, force: false)
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

  func setTerminalThemeContext(_ context: AppTerminalThemeContext) {
    guard terminalThemeContext != context else {
      return
    }

    terminalThemeContext = context
  }

  var selectedRepository: BridgeRepository? {
    repositories.first(where: { $0.id == selectedRepositoryID })
  }

  var selectedWorkspace: BridgeWorkspaceSummary? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return repositories
      .flatMap(\.workspaces)
      .first(where: { $0.id == selectedWorkspaceID })
  }

  var selectedTerminalEnvelope: BridgeWorkspaceTerminalsEnvelope? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return terminalEnvelopeByWorkspaceID[selectedWorkspaceID]
  }

  var selectedWorkspaceActivity: BridgeWorkspaceActivity? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return activityByWorkspaceID[selectedWorkspaceID]
  }

  func extensionSidebarState(for workspaceID: String? = nil) -> WorkspaceExtensionSidebarState? {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          let context = workspaceExtensionContext(for: targetWorkspaceID)
    else {
      return nil
    }

    return WorkspaceExtensionSidebarState(
      workspaceID: targetWorkspaceID,
      extensions: WorkspaceExtensionRegistry.shared.resolveExtensions(context: context),
      activeKind: activeExtensionKindByWorkspaceID[targetWorkspaceID]
    )
  }

  func selectExtension(_ kind: WorkspaceExtensionKind, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    activeExtensionKindByWorkspaceID[targetWorkspaceID] = kind
  }

  func extensionSidebarWidth(for workspaceID: String? = nil, availableWidth: CGFloat? = nil) -> CGFloat {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return defaultWorkspaceExtensionSidebarWidth
    }

    let storedWidth = extensionSidebarWidthByWorkspaceID[targetWorkspaceID] ??
      defaultWorkspaceExtensionSidebarWidth
    guard let availableWidth else {
      return storedWidth
    }

    return clampedWorkspaceExtensionSidebarWidth(storedWidth, availableWidth: availableWidth)
  }

  func setExtensionSidebarWidth(
    _ width: CGFloat,
    workspaceID: String? = nil,
    availableWidth: CGFloat? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    let nextWidth =
      if let availableWidth {
        clampedWorkspaceExtensionSidebarWidth(width, availableWidth: availableWidth)
      } else {
        min(max(width, minimumWorkspaceExtensionSidebarWidth), maximumWorkspaceExtensionSidebarWidth)
      }

    guard extensionSidebarWidthByWorkspaceID[targetWorkspaceID] != nextWidth else {
      return
    }

    extensionSidebarWidthByWorkspaceID[targetWorkspaceID] = nextWidth
  }

  func canvasState() -> CanvasState? {
    guard let selectedWorkspaceID else { return nil }
    return canvasState(for: selectedWorkspaceID)
  }

  func canvasState(for workspaceID: String) -> CanvasState? {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surfacesByID = resolveCanvasSurfaces(for: workspaceID, document: document),
          !surfacesByID.isEmpty
    else {
      return nil
    }

    return CanvasState(
      activeGroupID: document.activeGroupID,
      groupsByID: document.groupsByID,
      surfacesByID: surfacesByID,
      layout: document.layout
    )
  }

  func terminalEnvelope(for workspaceID: String) -> BridgeWorkspaceTerminalsEnvelope? {
    terminalEnvelopeByWorkspaceID[workspaceID]
  }

  /// Workspace IDs that have been opened and have canvas data ready to render.
  var cachedWorkspaceIDs: [String] {
    openedWorkspaceIDs.filter { canvasDocumentsByWorkspaceID[$0] != nil }.sorted()
  }

  func createTerminalTab(workspaceID: String? = nil, groupID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    terminalLoadingWorkspaceIDs.insert(targetWorkspaceID)
    Task {
      await createTerminalTab(for: targetWorkspaceID, groupID: groupID)
    }
  }

  func selectSurface(
    _ surfaceID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard let targetGroupID = groupID ?? groupIDContainingSurface(surfaceID, in: document),
            let group = document.groupsByID[targetGroupID],
            group.surfaceOrder.contains(surfaceID)
      else {
        return document
      }

      var groups = document.groupsByID
      groups[targetGroupID] = CanvasGroup(
        id: group.id,
        surfaceOrder: group.surfaceOrder,
        activeSurfaceID: surfaceID
      )

      return WorkspaceCanvasDocument(
        activeGroupID: targetGroupID,
        groupsByID: groups,
        surfacesByID: document.surfacesByID,
        layout: document.layout
      )
    }
  }

  func closeSurface(_ surfaceID: String, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    Task {
      await closeTerminalSurface(surfaceID, for: targetWorkspaceID)
    }
  }

  func selectGroup(_ groupID: String, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      WorkspaceCanvasDocument(
        activeGroupID: document.groupsByID[groupID] == nil ? document.activeGroupID : groupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        layout: document.layout
      )
    }
  }

  func splitGroup(
    _ groupID: String,
    direction: CanvasTiledLayoutSplit.Direction,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    terminalLoadingWorkspaceIDs.insert(targetWorkspaceID)
    Task {
      await splitGroup(groupID, direction: direction, for: targetWorkspaceID)
    }
  }

  func setSplitRatio(_ splitID: String, ratio: Double, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: document.groupsByID,
        surfacesByID: document.surfacesByID,
        layout: updateCanvasLayoutSplitRatio(document.layout, splitID: splitID, ratio: ratio)
      )
    }
  }

  func reorderSurface(
    surfaceID: String,
    onto targetSurfaceID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID,
          surfaceID != targetSurfaceID
    else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      guard let targetGroupID = groupID ?? groupIDContainingSurface(surfaceID, in: document),
            let group = document.groupsByID[targetGroupID],
            group.surfaceOrder.contains(surfaceID),
            group.surfaceOrder.contains(targetSurfaceID)
      else {
        return document
      }

      var groups = document.groupsByID
      groups[targetGroupID] = CanvasGroup(
        id: group.id,
        surfaceOrder: reorderedCanvasSurfaceIDs(
          group.surfaceOrder,
          movingSurfaceID: surfaceID,
          targetSurfaceID: targetSurfaceID
        ),
        activeSurfaceID: group.activeSurfaceID
      )

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: groups,
        surfacesByID: document.surfacesByID,
        layout: document.layout
      )
    }
  }

  private func bootstrap() async {
    isLoading = true
    defer { isLoading = false }

    do {
      _ = try await rediscoverBridgeClient(startIfNeeded: true, resetTerminalConnections: false)
      errorMessage = nil

      try await loadRepositories()
      try await loadActivity()
      await loadTerminalsIfNeeded()
      startBridgeMonitoring()
      connectSocket()
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func reload() async {
    guard bridgeClient != nil else {
      await bootstrap()
      return
    }

    isLoading = true
    defer { isLoading = false }

    do {
      _ = try await rediscoverBridgeClient(startIfNeeded: true, resetTerminalConnections: false)
      try await loadRepositories()
      try await loadActivity()
      await loadTerminalsIfNeeded()
      errorMessage = nil
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func loadRepositories() async throws {
    let repositories = try await withBridgeRequest { client in
      try await client.repositories()
    }
    self.repositories = repositories

    let allWorkspaceIDs = Set(repositories.flatMap(\.workspaces).map(\.id))
    openedWorkspaceIDs.formIntersection(allWorkspaceIDs)

    // Keep current selection if still valid
    if let selectedRepositoryID,
       repositories.contains(where: { $0.id == selectedRepositoryID }),
       let selectedWorkspaceID,
       repositories.flatMap(\.workspaces).contains(where: { $0.id == selectedWorkspaceID })
    {
      openedWorkspaceIDs.insert(selectedWorkspaceID)
      return
    }

    // Try restoring persisted selection
    let allWorkspaces = repositories.flatMap(\.workspaces)
    if let persisted = Self.loadLastWorkspace(),
       let repository = repositories.first(where: { $0.id == persisted.repositoryID }),
       allWorkspaces.contains(where: { $0.id == persisted.workspaceID })
    {
      selectedRepositoryID = persisted.repositoryID
      selectedWorkspaceID = persisted.workspaceID
      openedWorkspaceIDs.insert(persisted.workspaceID)
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
  }

  private func loadActivity() async throws {
    let activity = try await withBridgeRequest { client in
      try await client.activity()
    }
    activityByWorkspaceID = Dictionary(uniqueKeysWithValues: activity.map { ($0.id, $0) })
  }

  private func loadTerminalsIfNeeded() async {
    guard let selectedWorkspaceID else {
      return
    }

    await loadTerminals(for: selectedWorkspaceID, force: false)
  }

  private func loadTerminals(for workspaceID: String, force: Bool) async {
    if terminalEnvelopeByWorkspaceID[workspaceID] != nil && !force {
      await refreshTerminals(for: workspaceID, showLoading: false)
      return
    }

    await refreshTerminals(for: workspaceID, showLoading: true)
  }

  private func startBridgeMonitoring() {
    bridgeMonitorTask?.cancel()
    bridgeMonitorTask = Task { [weak self] in
      while !Task.isCancelled {
        do {
          try await Task.sleep(nanoseconds: 1_500_000_000)
          guard let self else {
            continue
          }

          await self.rediscoverBridgeIfNeeded()
        } catch {
          continue
        }
      }
    }
  }

  private func connectSocket() {
    guard let baseURL = bridgeURL else { return }

    bridgeSocket.connect(to: baseURL) { [weak self] event in
      guard let self else { return }
      self.handleSocketEvent(event)
    }
  }

  private func handleSocketEvent(_ event: BridgeSocket.Event) {
    switch event {
    case .connected:
      break
    case .activity(let workspaces):
      activityByWorkspaceID = Dictionary(uniqueKeysWithValues: workspaces.map { ($0.id, $0) })
    case .serviceStarted, .serviceFailed, .serviceStopped:
      // Service events can be handled as needed in the future.
      break
    case .pong:
      break
    case .unknown:
      break
    }
  }

  private func refreshTerminals(for workspaceID: String, showLoading: Bool) async {
    if showLoading {
      terminalLoadingWorkspaceIDs.insert(workspaceID)
    }

    defer {
      if showLoading {
        terminalLoadingWorkspaceIDs.remove(workspaceID)
      }
    }

    do {
      let envelope = try await withBridgeRequest { client in
        try await client.terminals(for: workspaceID)
      }
      terminalEnvelopeByWorkspaceID[workspaceID] = envelope
      syncCanvasDocument(for: workspaceID)
      try await ensureSurfaceConnections(for: workspaceID)
      if selectedWorkspaceID == workspaceID {
        errorMessage = nil
      }
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func createTerminalTab(for workspaceID: String, groupID: String?) async {
    defer {
      terminalLoadingWorkspaceIDs.remove(workspaceID)
    }

    do {
      let created = try await withBridgeRequest { client in
        try await client.createTerminal(
          for: workspaceID,
          title: self.nextTerminalName(
            from: self.terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
          )
        )
      }
      upsertTerminalEnvelope(created, for: workspaceID)

      let surfaceRecord = terminalSurfaceRecord(for: workspaceID, terminal: created.terminal)
      updateCanvasDocument(for: workspaceID) { document in
        let targetGroupID =
          groupID ??
          document.activeGroupID ??
          canvasGroupIDs(in: document.layout).first ??
          defaultCanvasGroupID(for: workspaceID)
        let targetGroup = document.groupsByID[targetGroupID] ?? CanvasGroup(
          id: targetGroupID,
          surfaceOrder: [],
          activeSurfaceID: nil
        )

        var groups = document.groupsByID
        var surfacesByID = document.surfacesByID
        groups[targetGroupID] = CanvasGroup(
          id: targetGroup.id,
          surfaceOrder: targetGroup.surfaceOrder + [surfaceRecord.id],
          activeSurfaceID: surfaceRecord.id
        )
        surfacesByID[surfaceRecord.id] = surfaceRecord

        return WorkspaceCanvasDocument(
          activeGroupID: targetGroupID,
          groupsByID: groups,
          surfacesByID: surfacesByID,
          layout: document.layout
        )
      }

      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
      await refreshTerminals(for: workspaceID, showLoading: false)
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func closeTerminalSurface(_ surfaceID: String, for workspaceID: String) async {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surface = document.surfacesByID[surfaceID],
          let terminalBinding = TerminalSurfaceBinding(binding: surface.binding)
    else {
      return
    }

    do {
      try await disconnectSurfaceConnection(
        for: workspaceID,
        terminalID: terminalBinding.terminalID,
        surfaceID: surfaceID
      )
      let _: Void = try await withBridgeRequest { client in
        try await client.closeTerminal(for: workspaceID, terminalID: terminalBinding.terminalID)
      }

      updateCanvasDocument(for: workspaceID) { document in
        var groups = document.groupsByID
        let surfacesByID = document.surfacesByID.filter { $0.key != surfaceID }

        for (groupID, group) in groups {
          let nextSurfaceOrder = group.surfaceOrder.filter { $0 != surfaceID }
          groups[groupID] = CanvasGroup(
            id: group.id,
            surfaceOrder: nextSurfaceOrder,
            activeSurfaceID: group.activeSurfaceID == surfaceID ? nextSurfaceOrder.first : group.activeSurfaceID
          )
        }

        return WorkspaceCanvasDocument(
          activeGroupID: document.activeGroupID,
          groupsByID: groups,
          surfacesByID: surfacesByID,
          layout: document.layout
        )
      }

      await refreshTerminals(for: workspaceID, showLoading: false)
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func splitGroup(
    _ groupID: String,
    direction: CanvasTiledLayoutSplit.Direction,
    for workspaceID: String
  ) async {
    defer {
      terminalLoadingWorkspaceIDs.remove(workspaceID)
    }

    do {
      let created = try await withBridgeRequest { client in
        try await client.createTerminal(
          for: workspaceID,
          title: self.nextTerminalName(
            from: self.terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
          )
        )
      }
      upsertTerminalEnvelope(created, for: workspaceID)

      updateCanvasDocument(for: workspaceID) { document in
        guard document.groupsByID[groupID] != nil else {
          return document
        }

        let newGroupID = createCanvasGroupID(for: workspaceID)
        let surfaceRecord = terminalSurfaceRecord(for: workspaceID, terminal: created.terminal)
        var groups = document.groupsByID
        var surfacesByID = document.surfacesByID
        groups[newGroupID] = CanvasGroup(
          id: newGroupID,
          surfaceOrder: [surfaceRecord.id],
          activeSurfaceID: surfaceRecord.id
        )
        surfacesByID[surfaceRecord.id] = surfaceRecord

        return WorkspaceCanvasDocument(
          activeGroupID: newGroupID,
          groupsByID: groups,
          surfacesByID: surfacesByID,
          layout: splitCanvasLayout(
            document.layout,
            targetGroupID: groupID,
            newGroupID: newGroupID,
            direction: direction,
            splitID: createCanvasSplitID(for: workspaceID)
          )
        )
      }

      try await ensureSurfaceConnections(for: workspaceID)
      await refreshTerminals(for: workspaceID, showLoading: false)
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func handleTerminalError(_ error: Error, workspaceID: String) {
    if selectedWorkspaceID == workspaceID {
      errorMessage = error.localizedDescription
    }
  }

  private func syncCanvasDocument(for workspaceID: String) {
    guard let envelope = terminalEnvelopeByWorkspaceID[workspaceID] else {
      canvasDocumentsByWorkspaceID.removeValue(forKey: workspaceID)
      return
    }

    guard envelope.runtime.launchError == nil else {
      canvasDocumentsByWorkspaceID.removeValue(forKey: workspaceID)
      return
    }

    let baseDocument = canvasDocumentsByWorkspaceID[workspaceID] ?? defaultCanvasDocument(for: workspaceID)
    let availableSurfaceRecords = envelope.terminals.map {
      terminalSurfaceRecord(for: workspaceID, terminal: $0)
    }
    let availableSurfaceIDs = Set(availableSurfaceRecords.map(\.id))
    var surfacesByID = baseDocument.surfacesByID.filter { availableSurfaceIDs.contains($0.key) }

    for surfaceRecord in availableSurfaceRecords {
      surfacesByID[surfaceRecord.id] = surfaceRecord
    }

    let staleSurfaceIDs = Set(baseDocument.surfacesByID.keys).subtracting(availableSurfaceIDs)
    for surfaceID in staleSurfaceIDs {
      terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    }

    canvasDocumentsByWorkspaceID[workspaceID] = normalizeCanvasDocument(
      WorkspaceCanvasDocument(
        activeGroupID: baseDocument.activeGroupID,
        groupsByID: baseDocument.groupsByID,
        surfacesByID: surfacesByID,
        layout: baseDocument.layout
      ),
      workspaceID: workspaceID,
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )
  }

  private func updateCanvasDocument(
    for workspaceID: String,
    _ transform: (WorkspaceCanvasDocument) -> WorkspaceCanvasDocument
  ) {
    let document = canvasDocumentsByWorkspaceID[workspaceID] ?? defaultCanvasDocument(for: workspaceID)
    canvasDocumentsByWorkspaceID[workspaceID] = normalizeCanvasDocument(
      transform(document),
      workspaceID: workspaceID,
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )
  }

  private func resolveCanvasSurfaces(
    for workspaceID: String,
    document: WorkspaceCanvasDocument
  ) -> [String: CanvasSurface]? {
    guard let workspace = workspaceSummary(for: workspaceID),
          let envelope = terminalEnvelopeByWorkspaceID[workspaceID],
          envelope.runtime.launchError == nil
    else {
      return nil
    }

    let workingDirectory =
      envelope.workspace.cwd ??
      envelope.workspace.worktreePath ??
      workspace.path ??
      FileManager.default.homeDirectoryForCurrentUser.path

    let context = SurfaceResolutionContext(
      workspaceID: workspaceID,
      workingDirectory: workingDirectory,
      themeConfigPath: terminalThemeContext.themeConfigPath,
      terminalBackgroundHexColor: terminalThemeContext.backgroundHexColor,
      terminalDarkAppearance: terminalThemeContext.darkAppearance,
      backendLabel: envelope.runtime.backendLabel,
      persistent: envelope.runtime.persistent,
      terminalsByID: Dictionary(uniqueKeysWithValues: envelope.terminals.map { ($0.id, $0) }),
      connectionBySurfaceID: terminalConnectionBySurfaceID
    )

    let surfaceCount = document.surfacesByID.count
    let surfaces = document.surfacesByID.values.compactMap { record -> (String, CanvasSurface)? in
      guard let definition = SurfaceRegistry.shared[record.surfaceKind],
            let resolved = definition.resolve(record: record, context: context)
      else { return nil }

      return (
        record.id,
        CanvasSurface(
          id: record.id,
          title: resolved.tab.title,
          surfaceKind: record.surfaceKind,
          record: record,
          content: resolved.content,
          tabPresentation: resolved.tab,
          isClosable: resolved.isClosable && surfaceCount > 1
        )
      )
    }

    return surfaces.isEmpty ? nil : Dictionary(uniqueKeysWithValues: surfaces)
  }

  func workspaceSummary(for workspaceID: String) -> BridgeWorkspaceSummary? {
    repositories
      .flatMap(\.workspaces)
      .first(where: { $0.id == workspaceID })
  }

  private func workspaceExtensionContext(for workspaceID: String) -> WorkspaceExtensionContext? {
    guard let workspace = workspaceSummary(for: workspaceID) else {
      return nil
    }

    let repository = repositories.first { repository in
      repository.workspaces.contains(where: { $0.id == workspaceID })
    }

    return WorkspaceExtensionContext(
      model: self,
      repository: repository,
      workspace: workspace,
      activity: activityByWorkspaceID[workspaceID],
      terminalEnvelope: terminalEnvelopeByWorkspaceID[workspaceID]
    )
  }

  private func upsertTerminalEnvelope(
    _ created: BridgeWorkspaceTerminalEnvelope,
    for workspaceID: String
  ) {
    let current = terminalEnvelopeByWorkspaceID[workspaceID]
    var terminals = current?.terminals ?? []
    terminals.removeAll { $0.id == created.terminal.id }
    terminals.append(created.terminal)

    terminalEnvelopeByWorkspaceID[workspaceID] = BridgeWorkspaceTerminalsEnvelope(
      workspace: current?.workspace ?? created.workspace,
      runtime: created.runtime,
      terminals: terminals
    )
  }

  private func terminalSurfaceRecord(
    for workspaceID: String,
    terminal: BridgeTerminalRecord
  ) -> CanvasSurfaceRecord {
    let binding = TerminalSurfaceBinding(
      workspaceID: workspaceID,
      terminalID: terminal.id
    )
    return CanvasSurfaceRecord(
      id: terminalSurfaceID(for: workspaceID, terminalID: terminal.id),
      title: terminal.title,
      surfaceKind: .terminal,
      binding: binding.surfaceBinding
    )
  }

  private func surfaceOrderPreference(for workspaceID: String) -> [String] {
    (terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []).map { terminal in
      terminalSurfaceID(for: workspaceID, terminalID: terminal.id)
    }
  }

  private func ensureSurfaceConnections(for workspaceID: String) async throws {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID]
    else {
      return
    }

    let validSurfaceIDs = Set(document.surfacesByID.keys)
    for (surfaceID, connection) in terminalConnectionBySurfaceID where
      surfaceID.hasPrefix("surface:\(workspaceID):") && !validSurfaceIDs.contains(surfaceID)
    {
      let terminalID = document.surfacesByID[surfaceID].flatMap { surfaceRecord -> String? in
        TerminalSurfaceBinding(binding: surfaceRecord.binding)?.terminalID
      } ?? connection.terminalID

      let _: Void? = try? await withBridgeRequest { client in
        try await client.disconnectTerminal(
          for: workspaceID,
          terminalID: terminalID,
          connectionID: connection.connectionID
        )
      }
      terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    }

    for surfaceRecord in document.surfacesByID.values {
      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
    }
  }

  private func ensureSurfaceConnection(
    for workspaceID: String,
    surfaceRecord: CanvasSurfaceRecord
  ) async throws {
    guard terminalConnectionBySurfaceID[surfaceRecord.id] == nil else {
      return
    }

    switch surfaceRecord.surfaceKind {
    case .terminal:
      guard let terminalBinding = TerminalSurfaceBinding(binding: surfaceRecord.binding) else {
        return
      }

      let response = try await withBridgeRequest { client in
        try await client.connectTerminal(
          for: workspaceID,
          terminalID: terminalBinding.terminalID,
          clientID: surfaceRecord.id
        )
      }

      if let launchError = response.connection.launchError {
        throw NSError(
          domain: "LifecycleDesktopMac.Terminal",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: launchError]
        )
      }

      terminalConnectionBySurfaceID[surfaceRecord.id] = response.connection
    default:
      break
    }
  }

  private func disconnectSurfaceConnection(
    for workspaceID: String,
    terminalID: String,
    surfaceID: String
  ) async throws {
    guard let connection = terminalConnectionBySurfaceID[surfaceID] else {
      return
    }

    let _: Void = try await withBridgeRequest { client in
      try await client.disconnectTerminal(
        for: workspaceID,
        terminalID: terminalID,
        connectionID: connection.connectionID
      )
    }
    terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
  }

  private func withBridgeRequest<Response>(
    retryingConnectivityFailures: Bool = true,
    _ operation: @escaping (BridgeClient) async throws -> Response
  ) async throws -> Response {
    let client = try await ensureBridgeClient(startIfNeeded: true)

    do {
      return try await operation(client)
    } catch {
      guard retryingConnectivityFailures, isBridgeConnectivityError(error) else {
        throw error
      }

      let recoveredClient = try await rediscoverBridgeClient(
        startIfNeeded: true,
        resetTerminalConnections: true
      )
      return try await operation(recoveredClient)
    }
  }

  private func ensureBridgeClient(startIfNeeded: Bool) async throws -> BridgeClient {
    if let bridgeClient {
      return bridgeClient
    }

    return try await rediscoverBridgeClient(
      startIfNeeded: startIfNeeded,
      resetTerminalConnections: false
    )
  }

  @discardableResult
  private func rediscoverBridgeClient(
    startIfNeeded: Bool,
    resetTerminalConnections: Bool
  ) async throws -> BridgeClient {
    let discovery: BridgeDiscovery
    if startIfNeeded {
      discovery = try await BridgeBootstrap.ensureBridgeDiscovery()
    } else if let discovered = try await BridgeBootstrap.discoverBridge(startIfNeeded: false) {
      discovery = discovered
    } else if let bridgeClient {
      return bridgeClient
    } else {
      throw BridgeBootstrapError.couldNotStart(URL(string: "http://127.0.0.1:0")!)
    }

    let shouldResetConnections =
      resetTerminalConnections ||
      bridgeClient == nil ||
      bridgeURL == nil ||
      bridgeURL != discovery.url ||
      bridgePID != discovery.pid

    let client = BridgeClient(baseURL: discovery.url)
    bridgeURL = discovery.url
    bridgePID = discovery.pid
    bridgeClient = client
    if shouldResetConnections {
      terminalConnectionBySurfaceID.removeAll()
    }
    return client
  }

  private func rediscoverBridgeIfNeeded() async {
    do {
      guard let discovered = try await BridgeBootstrap.discoverBridge(startIfNeeded: false) else {
        return
      }

      guard bridgeURL != discovered.url || bridgePID != discovered.pid else {
        return
      }

      _ = try await rediscoverBridgeClient(startIfNeeded: false, resetTerminalConnections: true)
      try await loadRepositories()
      try await loadActivity()
      await loadTerminalsIfNeeded()
      connectSocket()
      errorMessage = nil
    } catch {
      guard isBridgeConnectivityError(error) || error is BridgeBootstrapError else {
        return
      }
    }
  }

  private func groupIDContainingSurface(
    _ surfaceID: String,
    in document: WorkspaceCanvasDocument
  ) -> String? {
    canvasGroupIDs(in: document.layout).first { groupID in
      document.groupsByID[groupID]?.surfaceOrder.contains(surfaceID) == true
    }
  }

  private func nextTerminalName(from terminals: [BridgeTerminalRecord]) -> String {
    let existingNames = Set(terminals.map(\.title))
    var nextIndex = max(terminals.count + 1, 2)

    while true {
      let candidate = "Tab \(nextIndex)"
      if !existingNames.contains(candidate) {
        return candidate
      }
      nextIndex += 1
    }
  }

  // MARK: - Last Workspace Persistence

  private static let lastWorkspaceIDKey = "lifecycle.lastWorkspaceID"
  private static let lastRepositoryIDKey = "lifecycle.lastRepositoryID"

  private static func persistLastWorkspace(workspaceID: String, repositoryID: String) {
    UserDefaults.standard.set(workspaceID, forKey: lastWorkspaceIDKey)
    UserDefaults.standard.set(repositoryID, forKey: lastRepositoryIDKey)
  }

  private static func loadLastWorkspace() -> (workspaceID: String, repositoryID: String)? {
    guard let workspaceID = UserDefaults.standard.string(forKey: lastWorkspaceIDKey),
          let repositoryID = UserDefaults.standard.string(forKey: lastRepositoryIDKey)
    else {
      return nil
    }
    return (workspaceID, repositoryID)
  }
}
