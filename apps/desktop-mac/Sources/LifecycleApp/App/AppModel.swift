import AppKit
import Combine
import Foundation
import LifecyclePresentation
import SwiftUI

let defaultWorkspaceExtensionSidebarWidth: CGFloat = 320
let minimumWorkspaceExtensionSidebarWidth: CGFloat = 260
let maximumWorkspaceExtensionSidebarWidth: CGFloat = 420
let minimumWorkspaceCanvasWidth: CGFloat = 480
let workspaceExtensionSidebarDividerThickness: CGFloat = 12
let bridgeDiscoveryRetryNanosecondsWhenDisconnected: UInt64 = 500_000_000
let bridgeDiscoveryRetryNanosecondsWhenConnected: UInt64 = 1_500_000_000

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
private func unresolvedCanvasSurface(record: CanvasSurfaceRecord) -> ResolvedSurface {
  let tab = SurfaceTabPresentation(
    title: record.title,
    subtitle: record.surfaceKind.rawValue,
    icon: unresolvedCanvasSurfaceIcon(for: record.surfaceKind)
  )

  let content = AnySurfaceContent(id: record.id) { _ in
    UnresolvedCanvasSurfaceView(record: record)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  return ResolvedSurface(
    content: content,
    tab: tab,
    isClosable: true
  )
}

private func unresolvedCanvasSurfaceIcon(for kind: SurfaceKind) -> String {
  switch kind {
  case .agent:
    "sparkles"
  case .terminal:
    "terminal"
  default:
    "square.stack"
  }
}

private struct UnresolvedCanvasSurfaceView: View {
  @Environment(\.appTheme) private var theme

  let record: CanvasSurfaceRecord

  var body: some View {
    VStack(spacing: 12) {
      Image(systemName: unresolvedCanvasSurfaceIcon(for: record.surfaceKind))
        .font(.system(size: 24, weight: .regular))
        .foregroundStyle(theme.mutedColor.opacity(0.7))

      Text(record.title)
        .font(.system(size: 16, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)

      Text("Resolving \(record.surfaceKind.rawValue) surface...")
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(theme.mutedColor)
        .multilineTextAlignment(.center)
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(theme.surfaceBackground)
  }
}

@MainActor
final class AppModel: ObservableObject {
  @Published var bridgeURL: URL?
  @Published var bridgeClient: BridgeClient?
  @Published var authState: BridgeAuthState?
  @Published var providerAuthStatusByProvider: [BridgeAgentProvider: BridgeProviderAuthStatus] = [:]
  @Published var organizations: [BridgeOrganization] = []
  @Published var repositories: [BridgeRepository] = []
  @Published var terminalEnvelopeByWorkspaceID: [String: BridgeWorkspaceTerminalsEnvelope] = [:]
  @Published var stackSummaryByWorkspaceID: [String: BridgeWorkspaceStackSummary] = [:]
  @Published var terminalConnectionBySurfaceID: [String: BridgeTerminalConnection] = [:]
  @Published var agentsByWorkspaceID: [String: [BridgeAgentRecord]] = [:]
  @Published private var canvasDocumentsByWorkspaceID: [String: WorkspaceCanvasDocument] = [:]
  @Published private var activeExtensionKindByWorkspaceID: [String: WorkspaceExtensionKind] = [:]
  @Published private var extensionSidebarWidthByWorkspaceID: [String: CGFloat] = [:]
  @Published private var selectedAgentIDByWorkspaceID: [String: String] = [:]
  @Published var terminalThemeContext: AppTerminalThemeContext = .fallback
  @Published var selectedRepositoryID: String?
  @Published var selectedWorkspaceID: String?
  @Published var isLoading = false
  @Published private(set) var isRecoveringBridge = false
  @Published var errorMessage: String?
  @Published private(set) var lastFailureSummary: String?
  @Published var terminalLoadingWorkspaceIDs = Set<String>()
  @Published var draggingSurfaceID: String?
  @Published private(set) var openedWorkspaceIDs = Set<String>()

  private var bridgePID: Int?
  private var bridgeMonitorTask: Task<Void, Never>?
  private let bridgeSocket = BridgeSocket()
  private var didStart = false
  private var didRestorePersistedCanvasDocuments = false
  private var agentHandlesByID: [String: AgentHandle] = [:]
  private var workspaceStoresByID: [String: WorkspaceStore] = [:]

  deinit {
    bridgeMonitorTask?.cancel()
  }

  func start() {
    guard !didStart else {
      return
    }

    didStart = true
    AppLog.notice(.app, "Starting desktop-mac app model")
    registerSurfaces()
    registerExtensions()
    startBridgeMonitoring()
    Task {
      await bootstrap()
    }
  }

  private func registerSurfaces() {
    SurfaceRegistry.shared.register(AgentSurfaceDefinition())
    SurfaceRegistry.shared.register(TerminalSurfaceDefinition())
  }

  private func registerExtensions() {
    WorkspaceExtensionRegistry.shared.register(StackExtensionDefinition())
    WorkspaceExtensionRegistry.shared.register(DebugExtensionDefinition())
  }

  func refresh() {
    AppLog.info(.app, "Manual refresh requested")
    Task {
      await reload()
    }
  }

  func select(repository: BridgeRepository, workspace: BridgeWorkspaceSummary) {
    selectedRepositoryID = repository.id
    selectedWorkspaceID = workspace.id
    openedWorkspaceIDs.insert(workspace.id)
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

  func setTerminalThemeContext(_ context: AppTerminalThemeContext) {
    guard terminalThemeContext != context else {
      return
    }

    terminalThemeContext = context
    syncAllWorkspaceStores()
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

  var selectedTerminalEnvelope: BridgeWorkspaceTerminalsEnvelope? {
    guard let selectedWorkspaceID else {
      return nil
    }

    return terminalEnvelopeByWorkspaceID[selectedWorkspaceID]
  }

  func selectedAgent(for workspaceID: String) -> BridgeAgentRecord? {
    let agents = agentsByWorkspaceID[workspaceID] ?? []
    guard let selectedAgentID = selectedAgentIDByWorkspaceID[workspaceID] else {
      return agents.first
    }

    return agents.first(where: { $0.id == selectedAgentID }) ?? agents.first
  }

  func agent(agentID: String, workspaceID: String) -> BridgeAgentRecord? {
    (agentsByWorkspaceID[workspaceID] ?? []).first(where: { $0.id == agentID })
  }

  func agentHandle(agentID: String, workspaceID: String) -> AgentHandle {
    ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)
  }

  func workspaceStore(for workspaceID: String) -> WorkspaceStore {
    ensureWorkspaceStore(for: workspaceID)
  }

  func providerAuthStatus(for provider: BridgeAgentProvider) -> BridgeProviderAuthStatus {
    providerAuthStatusByProvider[provider] ?? .notChecked
  }

  func refreshProviderAuthStatus(for provider: BridgeAgentProvider, force: Bool = false) {
    Task {
      await loadProviderAuthStatus(for: provider, force: force)
    }
  }

  func loginProviderAuth(_ provider: BridgeAgentProvider) {
    Task {
      await loginProviderAuth(for: provider)
    }
  }

  func createAgentSurface(
    provider: BridgeAgentProvider,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    Task {
      await createAgentSurface(for: targetWorkspaceID, provider: provider, groupID: groupID)
    }
  }

  func openAgentSurface(
    agentID: String,
    workspaceID: String? = nil,
    groupID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    enterAgent(agentID: agentID, workspaceID: targetWorkspaceID, groupID: groupID)
  }

  func sendAgentPrompt(
    agentID: String,
    workspaceID: String,
    text: String
  ) async throws {
    let turnID = "turn-\(UUID().uuidString.lowercased())"
    try await AppSignpost.withInterval(.agent, "Send Agent Prompt") {
      try await withBridgeRequest { client in
        try await client.sendAgentTurn(agentID: agentID, turnID: turnID, text: text)
      }
    }
    AppLog.notice(
      .agent,
      "Sent agent prompt",
      metadata: [
        "agentID": agentID,
        "workspaceID": workspaceID,
        "turnID": turnID,
      ]
    )
  }

  func cancelAgentTurn(agentID: String) async throws {
    try await AppSignpost.withInterval(.agent, "Cancel Agent Turn") {
      try await withBridgeRequest { client in
        try await client.cancelAgentTurn(agentID: agentID)
      }
    }
    AppLog.notice(.agent, "Cancelled agent turn", metadata: ["agentID": agentID])
  }

  func resolveAgentApproval(
    agentID: String,
    approvalID: String,
    decision: BridgeAgentApprovalDecision
  ) async throws {
    try await AppSignpost.withInterval(.agent, "Resolve Agent Approval") {
      try await withBridgeRequest { client in
        try await client.resolveAgentApproval(
          agentID: agentID,
          approvalID: approvalID,
          decision: decision
        )
      }
    }
    AppLog.notice(
      .agent,
      "Resolved agent approval",
      metadata: [
        "agentID": agentID,
        "approvalID": approvalID,
        "decision": decision.rawValue,
      ]
    )
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
    syncWorkspaceStore(for: targetWorkspaceID)
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

  func setDraggingSurfaceID(_ surfaceID: String?) {
    guard draggingSurfaceID != surfaceID else {
      return
    }

    draggingSurfaceID = surfaceID
    syncAllWorkspaceStores()
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
      activeLayoutMode: document.activeLayoutMode,
      tiledLayout: document.tiledLayout,
      spatialLayout: document.spatialLayout
    )
  }

  func terminalEnvelope(for workspaceID: String) -> BridgeWorkspaceTerminalsEnvelope? {
    terminalEnvelopeByWorkspaceID[workspaceID]
  }

  func stackSummary(for workspaceID: String) -> BridgeWorkspaceStackSummary? {
    stackSummaryByWorkspaceID[workspaceID]
  }

  private func beginTerminalLoading(for workspaceID: String) {
    let inserted = terminalLoadingWorkspaceIDs.insert(workspaceID).inserted
    if inserted {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  private func endTerminalLoading(for workspaceID: String) {
    if terminalLoadingWorkspaceIDs.remove(workspaceID) != nil {
      syncWorkspaceStore(for: workspaceID)
    }
  }

  /// Workspace IDs that have been opened and have canvas data ready to render.
  var cachedWorkspaceIDs: [String] {
    openedWorkspaceIDs.filter { canvasDocumentsByWorkspaceID[$0] != nil }.sorted()
  }

  func createTerminalTab(workspaceID: String? = nil, groupID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    beginTerminalLoading(for: targetWorkspaceID)
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

    if let document = canvasDocumentsByWorkspaceID[targetWorkspaceID],
       let surface = document.surfacesByID[surfaceID],
       surface.surfaceKind == .agent,
       let binding = AgentSurfaceBinding(binding: surface.binding)
    {
      enterAgent(
        agentID: binding.agentID,
        workspaceID: targetWorkspaceID,
        groupID: groupID,
        preferredSurfaceID: surfaceID
      )
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
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }
  }

  func closeSurface(_ surfaceID: String, workspaceID: String? = nil) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    Task {
      await closeSurface(surfaceID, for: targetWorkspaceID)
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
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
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

    beginTerminalLoading(for: targetWorkspaceID)
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
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: updateCanvasTiledLayoutSplitRatio(
          document.tiledLayout,
          splitID: splitID,
          ratio: ratio
        ),
        spatialLayout: document.spatialLayout
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
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }
  }

  func dropSurface(
    surfaceID: String,
    onGroupID targetGroupID: String,
    edge: CanvasDropEdge,
    workspaceID: String? = nil
  ) {
    guard let targetWorkspaceID = workspaceID ?? selectedWorkspaceID else {
      return
    }

    updateCanvasDocument(for: targetWorkspaceID) { document in
      moveSurfaceToEdge(
        in: document,
        surfaceID: surfaceID,
        targetGroupID: targetGroupID,
        edge: edge,
        workspaceID: targetWorkspaceID
      )
    }

    // Force reconnection so the new NSView attaches to the terminal process.
    if edge != .center {
      Task {
        await reconnectSurface(surfaceID, for: targetWorkspaceID)
      }
    }
  }

  func exportFeedbackBundle() {
    Task {
      await exportFeedbackBundleTask()
    }
  }

  private func reconnectSurface(_ surfaceID: String, for workspaceID: String) async {
    guard terminalConnectionBySurfaceID[surfaceID] != nil,
          let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surfaceRecord = document.surfacesByID[surfaceID],
          let terminalBinding = TerminalSurfaceBinding(binding: surfaceRecord.binding)
    else {
      return
    }

    // Disconnect the old connection
    try? await disconnectSurfaceConnection(
      for: workspaceID,
      terminalID: terminalBinding.terminalID,
      surfaceID: surfaceID
    )

    // Re-establish so the new view gets a fresh connection
    try? await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
  }

  private func bootstrap() async {
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

  private func reload() async {
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

  private func openWorkspace(_ workspaceID: String) async {
    await AppSignpost.withInterval(.workspace, "Open Workspace") {
      await loadTerminals(for: workspaceID, force: false)
      await loadStack(for: workspaceID, force: false)
      await loadAgents(for: workspaceID, force: false)
      enterVisibleAgentIfPresent(for: workspaceID)
      AppLog.info(.workspace, "Workspace content loaded", metadata: ["workspaceID": workspaceID])
    }
  }

  private func loadAuthState() async throws {
    do {
      let state = try await withBridgeRequest { client in
        try await client.authState()
      }
      self.authState = state

      guard state.authenticated else {
        self.organizations = []
        return
      }

      do {
        let orgs = try await withBridgeRequest { client in
          try await client.organizations()
        }
        self.organizations = orgs
      } catch {
        self.authState = BridgeAuthState(
          authenticated: false,
          userId: nil,
          email: nil,
          displayName: nil,
          activeOrgId: nil,
          activeOrgSlug: nil,
          gitProfile: state.gitProfile
        )
        self.organizations = []
        AppLog.notice(.bridge, "Bridge auth was invalidated while loading organizations")
      }
    } catch {
      self.organizations = []
      // Auth state is best-effort — don't block the app if it fails.
      AppLog.notice(.bridge, "Failed to load auth state")
    }
  }

  private func loadProviderAuthStatuses(force: Bool) async {
    for provider in BridgeAgentProvider.allCases {
      await loadProviderAuthStatus(for: provider, force: force)
    }
  }

  private func loadProviderAuthStatus(
    for provider: BridgeAgentProvider,
    force: Bool
  ) async {
    let currentStatus = providerAuthStatus(for: provider)
    if !force {
      switch currentStatus.state {
      case .checking, .authenticating, .authenticated, .unauthenticated:
        return
      case .notChecked, .error:
        break
      }
    }

    providerAuthStatusByProvider[provider] = .checking

    do {
      let status = try await withBridgeRequest { client in
        try await client.providerAuthStatus(for: provider)
      }
      providerAuthStatusByProvider[provider] = status
      AppLog.info(
        .bridge,
        "Loaded provider auth status",
        metadata: [
          "provider": provider.rawValue,
          "state": status.state.rawValue,
        ]
      )
    } catch {
      providerAuthStatusByProvider[provider] = .error(error.localizedDescription)
      AppLog.notice(
        .bridge,
        "Failed to load provider auth status",
        metadata: [
          "provider": provider.rawValue,
          "error": error.localizedDescription,
        ]
      )
    }
  }

  private func loginProviderAuth(for provider: BridgeAgentProvider) async {
    let currentStatus = providerAuthStatus(for: provider)
    switch currentStatus.state {
    case .checking, .authenticating:
      return
    case .notChecked, .authenticated, .unauthenticated, .error:
      break
    }

    providerAuthStatusByProvider[provider] = providerAuthenticatingStatus(for: provider)

    do {
      let status = try await withBridgeRequest { client in
        try await client.loginProvider(provider)
      }
      providerAuthStatusByProvider[provider] = status
      AppLog.notice(
        .bridge,
        "Completed provider authentication flow",
        metadata: [
          "provider": provider.rawValue,
          "state": status.state.rawValue,
        ]
      )
    } catch {
      providerAuthStatusByProvider[provider] = .error(error.localizedDescription)
      AppLog.notice(
        .bridge,
        "Provider authentication failed",
        metadata: [
          "provider": provider.rawValue,
          "error": error.localizedDescription,
        ]
      )
    }
  }

  private func providerAuthenticatingStatus(
    for provider: BridgeAgentProvider
  ) -> BridgeProviderAuthStatus {
    switch provider {
    case .claude:
      return .authenticating(output: ["Opening browser for Claude authentication..."])
    case .codex:
      return .authenticating(output: ["Starting Codex ChatGPT authentication..."])
    }
  }

  private func loadRepositories() async throws {
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

  private func openSelectedWorkspaceIfNeeded() async {
    guard let selectedWorkspaceID else {
      return
    }

    await openWorkspace(selectedWorkspaceID)
  }

  private func enterVisibleAgentIfPresent(for workspaceID: String) {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let activeGroupID = document.activeGroupID,
          let activeGroup = document.groupsByID[activeGroupID],
          let activeSurfaceID = activeGroup.activeSurfaceID,
          let surfaceRecord = document.surfacesByID[activeSurfaceID],
          surfaceRecord.surfaceKind == .agent,
          let binding = AgentSurfaceBinding(binding: surfaceRecord.binding)
    else {
      return
    }

    enterAgent(
      agentID: binding.agentID,
      workspaceID: workspaceID,
      groupID: activeGroupID,
      preferredSurfaceID: activeSurfaceID
    )
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
          let delay =
            self?.bridgeClient == nil
              ? bridgeDiscoveryRetryNanosecondsWhenDisconnected
              : bridgeDiscoveryRetryNanosecondsWhenConnected
          try await Task.sleep(nanoseconds: delay)
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
      bridgeSocket.subscribe(topics: ["agent"])
    case .agent(let event):
      applyAgentEvent(event)
    case .serviceStarted(let workspaceID, _),
      .serviceFailed(let workspaceID, _, _),
      .serviceStopped(let workspaceID, _):
      Task {
        await loadStack(for: workspaceID, force: true)
      }
    case .pong:
      break
    case .unknown:
      break
    }
  }

  private func applyAgentEvent(_ event: BridgeAgentSocketEvent) {
    if let agent = event.agent,
       let workspaceID = event.resolvedWorkspaceID
    {
      upsertAgent(agent, workspaceID: workspaceID)
    }

    guard let agentID = event.resolvedAgentID else {
      return
    }

    agentHandlesByID[agentID]?.apply(event)
  }

  private func upsertAgent(_ agent: BridgeAgentRecord, workspaceID: String) {
    var agents = agentsByWorkspaceID[workspaceID] ?? []

    if let index = agents.firstIndex(where: { $0.id == agent.id }) {
      agents[index] = agent
    } else {
      agents.append(agent)
    }

    agents.sort { left, right in
      if left.updatedAt == right.updatedAt {
        return left.id < right.id
      }

      return left.updatedAt > right.updatedAt
    }

    agentsByWorkspaceID[workspaceID] = agents
    agentHandlesByID[agent.id]?.syncAgentRecord(agent)
    normalizeSelectedAgent(for: workspaceID)
    syncCanvasDocument(for: workspaceID)
  }

  private func loadAgents(for workspaceID: String, force: Bool) async {
    if agentsByWorkspaceID[workspaceID] != nil && !force {
      return
    }

    do {
      let agents = try await AppSignpost.withInterval(.agent, "Load Agents") {
        try await withBridgeRequest { client in
          try await client.agents(for: workspaceID)
        }
      }

      agentsByWorkspaceID[workspaceID] = sortedAgents(agents)
      for agent in agents {
        agentHandlesByID[agent.id]?.syncAgentRecord(agent)
      }
      normalizeSelectedAgent(for: workspaceID)
      syncCanvasDocument(for: workspaceID)
      AppLog.info(
        .agent,
        "Loaded agents",
        metadata: [
          "workspaceID": workspaceID,
          "agentCount": String(agents.count),
        ]
      )
    } catch {
      reportError(
        error,
        category: .agent,
        message: "Failed to load agents",
        workspaceID: workspaceID
      )
    }
  }

  private func loadStack(for workspaceID: String, force: Bool) async {
    if stackSummaryByWorkspaceID[workspaceID] != nil && !force {
      return
    }

    do {
      let summary = try await AppSignpost.withInterval(.workspace, "Load Stack") {
        try await withBridgeRequest { client in
          try await client.stack(for: workspaceID)
        }
      }

      stackSummaryByWorkspaceID[workspaceID] = summary
      syncWorkspaceStore(for: workspaceID)
      AppLog.info(
        .workspace,
        "Loaded stack summary",
        metadata: [
          "workspaceID": workspaceID,
          "nodeCount": String(summary.nodes.count),
          "state": summary.state,
        ]
      )
    } catch {
      reportError(
        error,
        category: .workspace,
        message: "Failed to load stack summary",
        workspaceID: workspaceID
      )
    }
  }

  private func ensureAgentHandle(
    agentID: String,
    workspaceID: String
  ) -> AgentHandle {
    if let existing = agentHandlesByID[agentID] {
      if let agent = agent(agentID: agentID, workspaceID: workspaceID) {
        existing.syncAgentRecord(agent)
      }
      return existing
    }

    let handle = AgentHandle(
      agentID: agentID,
      workspaceID: workspaceID,
      agent: agent(agentID: agentID, workspaceID: workspaceID)
    )
    agentHandlesByID[agentID] = handle
    return handle
  }

  private func loadAgentHandle(
    agentID: String,
    workspaceID: String
  ) async {
    let handle = ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)
    await handle.load {
      try await AppSignpost.withInterval(.agent, "Load Agent Snapshot") {
        try await self.withBridgeRequest { client in
          try await client.agentSnapshot(agentID)
        }
      }
    }

    if let agent = handle.agent {
      upsertAgent(agent, workspaceID: agent.workspaceID)
    }

    if handle.state.phase == .failed, let errorMessage = handle.state.errorMessage {
      let failureMessage = "Failed to load agent"
      AppLog.error(
        .agent,
        failureMessage,
        metadata: [
          "workspaceID": workspaceID,
          "agentID": agentID,
          "error": errorMessage,
        ]
      )
      lastFailureSummary = "\(failureMessage): \(errorMessage)"
    }
  }

  private func createAgentSurface(
    for workspaceID: String,
    provider: BridgeAgentProvider,
    groupID: String?
  ) async {
    do {
      let agent = try await AppSignpost.withInterval(.agent, "Create Agent") {
        try await withBridgeRequest { client in
          try await client.startAgent(for: workspaceID, provider: provider)
        }
      }

      upsertAgent(agent, workspaceID: workspaceID)
      enterAgent(agentID: agent.id, workspaceID: workspaceID, groupID: groupID)
      AppLog.notice(
        .agent,
        "Created agent",
        metadata: [
          "workspaceID": workspaceID,
          "agentID": agent.id,
          "provider": provider.rawValue,
        ]
      )
    } catch {
      reportError(
        error,
        category: .agent,
        message: "Failed to create agent",
        workspaceID: workspaceID,
        metadata: ["provider": provider.rawValue]
      )
    }
  }

  private func enterAgent(
    agentID: String,
    workspaceID: String,
    groupID: String?,
    preferredSurfaceID: String? = nil
  ) {
    AppLog.info(
      .agent,
      "Entering agent",
      metadata: [
        "workspaceID": workspaceID,
        "agentID": agentID,
      ]
    )
    selectedAgentIDByWorkspaceID[workspaceID] = agentID

    updateCanvasDocument(for: workspaceID) { document in
      if let existingSurfaceID = preferredSurfaceID ?? document.surfacesByID.values.first(where: { record in
        record.surfaceKind == .agent &&
          AgentSurfaceBinding(binding: record.binding)?.agentID == agentID
      })?.id {
        guard let targetGroupID = groupID ?? groupIDContainingSurface(existingSurfaceID, in: document),
              let group = document.groupsByID[targetGroupID]
        else {
          return document
        }

        var groups = document.groupsByID
        groups[targetGroupID] = CanvasGroup(
          id: group.id,
          surfaceOrder: group.surfaceOrder,
          activeSurfaceID: existingSurfaceID
        )

        return WorkspaceCanvasDocument(
          activeGroupID: targetGroupID,
          groupsByID: groups,
          surfacesByID: document.surfacesByID,
          activeLayoutMode: document.activeLayoutMode,
          tiledLayout: document.tiledLayout,
          spatialLayout: document.spatialLayout
        )
      }

      let surfaceRecord = agentSurfaceRecord(for: workspaceID, agentID: agentID)
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
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }

    let _ = ensureAgentHandle(agentID: agentID, workspaceID: workspaceID)

    Task {
      await loadAgentHandle(agentID: agentID, workspaceID: workspaceID)
    }
  }

  private func refreshTerminals(for workspaceID: String, showLoading: Bool) async {
    if showLoading {
      beginTerminalLoading(for: workspaceID)
    }

    defer {
      if showLoading {
        endTerminalLoading(for: workspaceID)
      }
    }

    do {
      let envelope = try await AppSignpost.withInterval(.terminal, "Load Terminals") {
        try await withBridgeRequest { client in
          try await client.terminals(for: workspaceID)
        }
      }
      terminalEnvelopeByWorkspaceID[workspaceID] = envelope
      syncCanvasDocument(for: workspaceID)
      try await ensureSurfaceConnections(for: workspaceID)
      clearErrorIfVisible(for: workspaceID)
      AppLog.info(
        .terminal,
        "Loaded terminals",
        metadata: [
          "workspaceID": workspaceID,
          "terminalCount": String(envelope.terminals.count),
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func createTerminalTab(for workspaceID: String, groupID: String?) async {
    defer {
      endTerminalLoading(for: workspaceID)
    }

    do {
      let created = try await AppSignpost.withInterval(.terminal, "Create Terminal Tab") {
        try await withBridgeRequest { client in
          try await client.createTerminal(
            for: workspaceID,
            title: self.nextTerminalName(
              from: self.terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
            )
          )
        }
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
          activeLayoutMode: document.activeLayoutMode,
          tiledLayout: document.tiledLayout,
          spatialLayout: document.spatialLayout
        )
      }

      try await ensureSurfaceConnection(for: workspaceID, surfaceRecord: surfaceRecord)
      await refreshTerminals(for: workspaceID, showLoading: false)
      AppLog.notice(
        .terminal,
        "Created terminal tab",
        metadata: [
          "workspaceID": workspaceID,
          "terminalID": created.terminal.id,
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func closeSurface(_ surfaceID: String, for workspaceID: String) async {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surface = document.surfacesByID[surfaceID]
    else {
      return
    }

    switch surface.surfaceKind {
    case .agent:
      closeAgentSurface(surfaceID, for: workspaceID)
    case .terminal:
      await closeTerminalSurface(surfaceID, for: workspaceID)
    default:
      break
    }
  }

  private func closeAgentSurface(_ surfaceID: String, for workspaceID: String) {
    updateCanvasDocument(for: workspaceID) { document in
      var groups = document.groupsByID
      let surfacesByID = document.surfacesByID.filter { $0.key != surfaceID }

      for (groupID, group) in groups {
        let nextSurfaceOrder = group.surfaceOrder.filter { $0 != surfaceID }
        let nextActiveSurfaceID = nextCanvasActiveSurfaceIDAfterClosing(
          surfaceID,
          in: group.surfaceOrder,
          activeSurfaceID: group.activeSurfaceID
        )
        groups[groupID] = CanvasGroup(
          id: group.id,
          surfaceOrder: nextSurfaceOrder,
          activeSurfaceID: nextActiveSurfaceID
        )
      }

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: groups,
        surfacesByID: surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }
  }

  private func closeTerminalSurface(_ surfaceID: String, for workspaceID: String) async {
    guard let document = canvasDocumentsByWorkspaceID[workspaceID],
          let surface = document.surfacesByID[surfaceID],
          let terminalBinding = TerminalSurfaceBinding(binding: surface.binding)
    else {
      return
    }

    // Remove from local state immediately.
    terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    if let envelope = terminalEnvelopeByWorkspaceID[workspaceID] {
      terminalEnvelopeByWorkspaceID[workspaceID] = BridgeWorkspaceTerminalsEnvelope(
        workspace: envelope.workspace,
        runtime: envelope.runtime,
        terminals: envelope.terminals.filter { $0.id != terminalBinding.terminalID }
      )
    }
    updateCanvasDocument(for: workspaceID) { document in
      var groups = document.groupsByID
      let surfacesByID = document.surfacesByID.filter { $0.key != surfaceID }

      for (groupID, group) in groups {
        let nextSurfaceOrder = group.surfaceOrder.filter { $0 != surfaceID }
        let nextActiveSurfaceID = nextCanvasActiveSurfaceIDAfterClosing(
          surfaceID,
          in: group.surfaceOrder,
          activeSurfaceID: group.activeSurfaceID
        )
        groups[groupID] = CanvasGroup(
          id: group.id,
          surfaceOrder: nextSurfaceOrder,
          activeSurfaceID: nextActiveSurfaceID
        )
      }

      return WorkspaceCanvasDocument(
        activeGroupID: document.activeGroupID,
        groupsByID: groups,
        surfacesByID: surfacesByID,
        activeLayoutMode: document.activeLayoutMode,
        tiledLayout: document.tiledLayout,
        spatialLayout: document.spatialLayout
      )
    }

    // Close on the bridge so the tmux window is cleaned up.
    do {
      let _: Void = try await withBridgeRequest { client in
        try await client.closeTerminal(for: workspaceID, terminalID: terminalBinding.terminalID)
      }
      AppLog.notice(
        .terminal,
        "Closed terminal surface",
        metadata: [
          "workspaceID": workspaceID,
          "surfaceID": surfaceID,
          "terminalID": terminalBinding.terminalID,
        ]
      )
    } catch {
      AppLog.error(
        .terminal,
        "Bridge failed to close terminal",
        metadata: [
          "workspaceID": workspaceID,
          "surfaceID": surfaceID,
          "terminalID": terminalBinding.terminalID,
          "error": String(describing: error),
        ]
      )
    }
  }

  private func splitGroup(
    _ groupID: String,
    direction: CanvasTiledLayoutSplit.Direction,
    for workspaceID: String
  ) async {
    defer {
      endTerminalLoading(for: workspaceID)
    }

    do {
      let created = try await AppSignpost.withInterval(.terminal, "Split Group") {
        try await withBridgeRequest { client in
          try await client.createTerminal(
            for: workspaceID,
            title: self.nextTerminalName(
              from: self.terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []
            )
          )
        }
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
          activeLayoutMode: document.activeLayoutMode,
          tiledLayout: splitCanvasTiledLayout(
            document.tiledLayout,
            targetGroupID: groupID,
            newGroupID: newGroupID,
            direction: direction,
            splitID: createCanvasSplitID(for: workspaceID)
          ),
          spatialLayout: document.spatialLayout
        )
      }

      try await ensureSurfaceConnections(for: workspaceID)
      await refreshTerminals(for: workspaceID, showLoading: false)
      AppLog.notice(
        .terminal,
        "Split group with new terminal",
        metadata: [
          "workspaceID": workspaceID,
          "sourceGroupID": groupID,
          "terminalID": created.terminal.id,
        ]
      )
    } catch {
      handleTerminalError(error, workspaceID: workspaceID)
    }
  }

  private func handleTerminalError(_ error: Error, workspaceID: String) {
    reportError(
      error,
      category: .terminal,
      message: "Terminal runtime operation failed",
      workspaceID: workspaceID
    )
  }

  private func syncCanvasDocument(for workspaceID: String) {
    let baseDocument = canvasDocumentsByWorkspaceID[workspaceID] ?? defaultCanvasDocument(for: workspaceID)
    let envelope = terminalEnvelopeByWorkspaceID[workspaceID]
    let terminalSurfaceRecords: [CanvasSurfaceRecord] =
      if let envelope, envelope.runtime.launchError == nil {
        envelope.terminals.map { terminalSurfaceRecord(for: workspaceID, terminal: $0) }
      } else {
        []
      }
    let nextDocument = synchronizedCanvasDocument(
      baseDocument,
      workspaceID: workspaceID,
      terminalSurfaceRecords: terminalSurfaceRecords,
      liveAgentIDs: agentsByWorkspaceID[workspaceID].map { Set($0.map(\.id)) },
      surfaceOrderPreference: surfaceOrderPreference(for: workspaceID)
    )

    let staleSurfaceIDs = Set(baseDocument.surfacesByID.keys).subtracting(Set(nextDocument.surfacesByID.keys))
    for surfaceID in staleSurfaceIDs {
      terminalConnectionBySurfaceID.removeValue(forKey: surfaceID)
    }

    canvasDocumentsByWorkspaceID[workspaceID] = nextDocument
    persistCanvasDocuments()
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
    persistCanvasDocuments()
  }

  private func restorePersistedCanvasDocuments(validWorkspaceIDs: Set<String>) {
    if !didRestorePersistedCanvasDocuments {
      do {
        let persistedDocuments = try WorkspaceCanvasDocumentStore.read()
        canvasDocumentsByWorkspaceID = persistedDocuments.filter { validWorkspaceIDs.contains($0.key) }
        openedWorkspaceIDs.formUnion(canvasDocumentsByWorkspaceID.keys)
        didRestorePersistedCanvasDocuments = true

        if canvasDocumentsByWorkspaceID.count != persistedDocuments.count {
          persistCanvasDocuments()
        }
      } catch {
        didRestorePersistedCanvasDocuments = true
        AppLog.error(.workspace, "Failed to restore persisted canvas documents", error: error)
      }
      return
    }

    let filteredDocuments = canvasDocumentsByWorkspaceID.filter { validWorkspaceIDs.contains($0.key) }
    guard filteredDocuments.count != canvasDocumentsByWorkspaceID.count else {
      return
    }

    canvasDocumentsByWorkspaceID = filteredDocuments
    openedWorkspaceIDs.formIntersection(validWorkspaceIDs)
    persistCanvasDocuments()
  }

  private func persistCanvasDocuments() {
    do {
      try WorkspaceCanvasDocumentStore.write(canvasDocumentsByWorkspaceID)
    } catch {
      AppLog.error(.workspace, "Failed to persist canvas documents", error: error)
    }
  }

  private func resolveCanvasSurfaces(
    for workspaceID: String,
    document: WorkspaceCanvasDocument
  ) -> [String: CanvasSurface]? {
    guard let workspace = workspaceSummary(for: workspaceID) else {
      return nil
    }

    let envelope = terminalEnvelopeByWorkspaceID[workspaceID]
    let workingDirectory =
      envelope?.workspace.cwd ??
      envelope?.workspace.workspaceRoot ??
      workspace.path ??
      FileManager.default.homeDirectoryForCurrentUser.path

    let context = SurfaceResolutionContext(
      model: self,
      workspace: workspace,
      workspaceID: workspaceID,
      workingDirectory: workingDirectory,
      themeConfigPath: terminalThemeContext.themeConfigPath,
      terminalBackgroundHexColor: terminalThemeContext.backgroundHexColor,
      terminalDarkAppearance: terminalThemeContext.darkAppearance,
      backendLabel: envelope?.runtime.launchError == nil ? envelope?.runtime.backendLabel : nil,
      persistent: envelope?.runtime.launchError == nil ? envelope?.runtime.persistent : nil,
      agentsByID: Dictionary(
        uniqueKeysWithValues: (agentsByWorkspaceID[workspaceID] ?? []).map { ($0.id, $0) }
      ),
      terminalsByID: Dictionary(uniqueKeysWithValues: (envelope?.terminals ?? []).map { ($0.id, $0) }),
      connectionBySurfaceID: terminalConnectionBySurfaceID
    )

    let surfaces = document.surfacesByID.values.map { record -> (String, CanvasSurface) in
      let resolved =
        SurfaceRegistry.shared[record.surfaceKind]?.resolve(record: record, context: context) ??
        unresolvedCanvasSurface(record: record)

      return (
        record.id,
        CanvasSurface(
          id: record.id,
          title: resolved.tab.title,
          surfaceKind: record.surfaceKind,
          record: record,
          content: resolved.content,
          tabPresentation: resolved.tab,
          isClosable: resolved.isClosable
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

  private func ensureWorkspaceStore(for workspaceID: String) -> WorkspaceStore {
    if let existing = workspaceStoresByID[workspaceID] {
      existing.syncFromModel()
      return existing
    }

    let store = WorkspaceStore(workspaceID: workspaceID, model: self)
    workspaceStoresByID[workspaceID] = store
    return store
  }

  private func syncWorkspaceStore(for workspaceID: String) {
    workspaceStoresByID[workspaceID]?.syncFromModel()
  }

  private func syncAllWorkspaceStores() {
    for store in workspaceStoresByID.values {
      store.syncFromModel()
    }
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
      terminalEnvelope: terminalEnvelopeByWorkspaceID[workspaceID],
      stackSummary: stackSummaryByWorkspaceID[workspaceID]
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

  private func agentSurfaceRecord(
    for workspaceID: String,
    agentID: String
  ) -> CanvasSurfaceRecord {
    let binding = AgentSurfaceBinding(
      workspaceID: workspaceID,
      agentID: agentID
    )
    let agent = agent(agentID: agentID, workspaceID: workspaceID)
    return CanvasSurfaceRecord(
      id: agentSurfaceID(for: workspaceID, agentID: agentID),
      title: agent.map(resolvedAgentTitle) ?? "Agent",
      surfaceKind: .agent,
      binding: binding.surfaceBinding
    )
  }

  private func surfaceOrderPreference(for workspaceID: String) -> [String] {
    (terminalEnvelopeByWorkspaceID[workspaceID]?.terminals ?? []).map { terminal in
      terminalSurfaceID(for: workspaceID, terminalID: terminal.id)
    }
  }

  private func sortedAgents(_ agents: [BridgeAgentRecord]) -> [BridgeAgentRecord] {
    agents.sorted { left, right in
      if left.updatedAt == right.updatedAt {
        return left.id < right.id
      }

      return left.updatedAt > right.updatedAt
    }
  }

  private func normalizeSelectedAgent(for workspaceID: String) {
    let agents = agentsByWorkspaceID[workspaceID] ?? []
    let nextSelectedAgentID =
      if let current = selectedAgentIDByWorkspaceID[workspaceID],
         agents.contains(where: { $0.id == current }) {
        current
      } else {
        agents.first?.id
      }

    selectedAgentIDByWorkspaceID[workspaceID] = nextSelectedAgentID
  }

  private func workspaceForAgent(agentID: String) -> String? {
    for (workspaceID, agents) in agentsByWorkspaceID {
      if agents.contains(where: { $0.id == agentID }) {
        return workspaceID
      }
    }

    return agentHandlesByID[agentID]?.agent?.workspaceID
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

      let response = try await AppSignpost.withInterval(.terminal, "Attach Terminal Surface") {
        try await withBridgeRequest { client in
          try await client.connectTerminal(
            for: workspaceID,
            terminalID: terminalBinding.terminalID,
            clientID: surfaceRecord.id
          )
        }
      }

      if let launchError = response.connection.launchError {
        throw NSError(
          domain: "LifecycleApp.Terminal",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: launchError]
        )
      }

      terminalConnectionBySurfaceID[surfaceRecord.id] = response.connection
      AppLog.info(
        .terminal,
        "Attached terminal surface connection",
        metadata: [
          "workspaceID": workspaceID,
          "surfaceID": surfaceRecord.id,
          "terminalID": terminalBinding.terminalID,
          "connectionID": response.connection.connectionID,
        ]
      )
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
    AppLog.debug(
      .terminal,
      "Disconnected terminal surface connection",
      metadata: [
        "workspaceID": workspaceID,
        "surfaceID": surfaceID,
        "terminalID": terminalID,
        "connectionID": connection.connectionID,
      ]
    )
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
    try await AppSignpost.withInterval(.bridge, "Rediscover Bridge Client") {
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

      AppLog.notice(
        .bridge,
        "Resolved bridge client",
        metadata: [
          "url": discovery.url.absoluteString,
          "pid": discovery.pid.map(String.init) ?? "unknown",
          "resetConnections": shouldResetConnections ? "true" : "false",
        ]
      )
      return client
    }
  }

  private func rediscoverBridgeIfNeeded() async {
    do {
      let shouldStartIfNeeded = bridgeClient == nil
      guard let discovered = try await BridgeBootstrap.discoverBridge(
        startIfNeeded: shouldStartIfNeeded
      ) else {
        if bridgeClient == nil {
          beginBridgeRecovery()
        }
        return
      }

      let shouldReconnect =
        bridgeClient == nil ||
        bridgeURL != discovered.url ||
        bridgePID != discovered.pid
      guard shouldReconnect else {
        if isRecoveringBridge {
          endBridgeRecovery()
          clearError()
        }
        return
      }

      _ = try await rediscoverBridgeClient(startIfNeeded: false, resetTerminalConnections: true)
      try await loadRepositories()
      await openSelectedWorkspaceIfNeeded()
      connectSocket()
      endBridgeRecovery()
      clearError()
      AppLog.notice(.bridge, "Bridge rediscovered after registration or PID change")
    } catch {
      guard handleRecoverableBridgeFailure(
        error,
        message: "Bridge rediscovery is waiting for a healthy bridge"
      ) else {
        return
      }
    }
  }

  private func beginBridgeRecovery(_ error: Error? = nil) {
    isRecoveringBridge = true
    if let error {
      lastFailureSummary = error.localizedDescription
    }
  }

  private func endBridgeRecovery() {
    isRecoveringBridge = false
  }

  private func handleRecoverableBridgeFailure(_ error: Error, message: String) -> Bool {
    guard isBridgeConnectivityError(error) || error is BridgeBootstrapError else {
      return false
    }

    beginBridgeRecovery(error)
    clearError()
    AppLog.notice(.bridge, message, metadata: ["error": error.localizedDescription])
    return true
  }

  private func clearError() {
    errorMessage = nil
  }

  private func clearErrorIfVisible(for workspaceID: String) {
    if selectedWorkspaceID == workspaceID {
      clearError()
    }
  }

  private func reportError(
    _ error: Error,
    category: AppLogCategory,
    message: String,
    workspaceID: String? = nil,
    metadata: [String: String] = [:]
  ) {
    var mergedMetadata = metadata
    if let workspaceID {
      mergedMetadata["workspaceID"] = workspaceID
    }

    AppLog.error(category, message, error: error, metadata: mergedMetadata)
    lastFailureSummary = "\(message): \(error.localizedDescription)"

    guard workspaceID == nil || selectedWorkspaceID == workspaceID else {
      return
    }

    errorMessage = error.localizedDescription
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

  private func exportFeedbackBundleTask() async {
    let interval = AppSignpost.begin(.feedback, "Export Feedback Bundle")

    do {
      let destinationDirectory = try FeedbackExporter.chooseDestinationDirectory()
      let snapshot = await feedbackExportSnapshot()
      let bundleURL = try FeedbackExporter.export(snapshot: snapshot, into: destinationDirectory)
      AppLog.notice(.feedback, "Exported feedback bundle", metadata: ["path": bundleURL.path])
      NSWorkspace.shared.activateFileViewerSelecting([bundleURL])
    } catch FeedbackExporterError.userCancelled {
      AppLog.debug(.feedback, "Feedback export cancelled")
    } catch {
      reportError(error, category: .feedback, message: "Failed to export feedback bundle")
    }

    AppSignpost.end(interval)
  }

  private func feedbackExportSnapshot() async -> FeedbackExportSnapshot {
    let exportedAt = Date()
    let bridge = await FeedbackExporter.captureBridgeDiagnostics(
      bridgeURL: bridgeURL,
      bridgePID: bridgePID
    )
    let logs = await AppLog.snapshot(limit: 400)

    return FeedbackExportSnapshot(
      exportedAt: exportedAt,
      build: AppBuildInfo.current(),
      environment: FeedbackExporter.filteredEnvironment(from: ProcessInfo.processInfo.environment),
      bridge: bridge,
      state: feedbackAppState(),
      logs: logs
    )
  }

  private func feedbackAppState() -> FeedbackAppState {
    let repositorySummaries = repositories.map { repository in
      FeedbackAppState.RepositorySummary(
        id: repository.id,
        path: repository.path,
        workspaceIDs: repository.workspaces.map(\.id)
      )
    }

    let workspaceCount = repositories.reduce(into: 0) { partialResult, repository in
      partialResult += repository.workspaces.count
    }

    return FeedbackAppState(
      selectedRepositoryID: selectedRepositoryID,
      selectedWorkspaceID: selectedWorkspaceID,
      openedWorkspaceIDs: openedWorkspaceIDs.sorted(),
      repositoryCount: repositories.count,
      workspaceCount: workspaceCount,
      terminalSurfaceCount: canvasDocumentsByWorkspaceID.values.reduce(into: 0) { count, document in
        count += document.surfacesByID.values.filter { $0.surfaceKind == .terminal }.count
      },
      terminalConnectionCount: terminalConnectionBySurfaceID.count,
      agentCount: agentsByWorkspaceID.values.reduce(0) { $0 + $1.count },
      activeAgentHandleCount: agentHandlesByID.values.reduce(into: 0) { count, handle in
        if handle.state.snapshot != nil {
          count += 1
        }
      },
      bridgeSocketState: bridgeSocketStateLabel,
      errorMessage: errorMessage,
      lastFailureSummary: lastFailureSummary,
      repositories: repositorySummaries
    )
  }

  private var bridgeSocketStateLabel: String {
    switch bridgeSocket.state {
    case .disconnected:
      return "disconnected"
    case .connecting:
      return "connecting"
    case .connected:
      return "connected"
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
