import AppKit
import Combine
import Foundation
import LifecycleTerminalHost
import LifecyclePresentation
import SwiftUI

let defaultAppSidebarWidth: CGFloat = 256
let minimumAppSidebarWidth: CGFloat = 220
let maximumAppSidebarWidth: CGFloat = 360
let minimumWorkspaceShellContentWidth: CGFloat = 920
let appSidebarDividerThickness: CGFloat = 1
let appSidebarDividerHitThickness: CGFloat = 8
let defaultWorkspaceExtensionSidebarWidth: CGFloat = 320
let minimumWorkspaceExtensionSidebarWidth: CGFloat = 260
let maximumWorkspaceExtensionSidebarWidth: CGFloat = 420
let minimumWorkspaceCanvasWidth: CGFloat = 480
let workspaceExtensionSidebarDividerThickness: CGFloat = 1
let workspaceExtensionSidebarDividerHitThickness: CGFloat = 8
let bridgeDiscoveryRetryNanosecondsWhenDisconnected: UInt64 = 500_000_000
let bridgeDiscoveryRetryNanosecondsWhenConnected: UInt64 = 1_500_000_000

enum WorkspaceCreationHost: String, CaseIterable, Identifiable {
  case local
  case remote
  case cloud

  var id: String { rawValue }

  var label: String {
    switch self {
    case .local:
      "Local"
    case .remote:
      "Remote"
    case .cloud:
      "Cloud"
    }
  }

  var detail: String {
    switch self {
    case .local:
      "Runs on this Mac."
    case .remote:
      "Runs on a remote host."
    case .cloud:
      "Runs in Lifecycle cloud."
    }
  }

  var isAvailableInDesktopMac: Bool {
    switch self {
    case .local:
      true
    case .remote, .cloud:
      false
    }
  }
}

func clampedWorkspaceExtensionSidebarWidth(_ width: CGFloat, availableWidth: CGFloat) -> CGFloat {
  lcClampedFixedPaneWidth(
    width,
    totalWidth: availableWidth,
    minimumFixedPaneWidth: minimumWorkspaceExtensionSidebarWidth,
    maximumFixedPaneWidth: maximumWorkspaceExtensionSidebarWidth,
    minimumFlexiblePaneWidth: minimumWorkspaceCanvasWidth,
    dividerThickness: workspaceExtensionSidebarDividerThickness
  )
}

func clampedAppSidebarWidth(_ width: CGFloat, availableWidth: CGFloat) -> CGFloat {
  lcClampedFixedPaneWidth(
    width,
    totalWidth: availableWidth,
    minimumFixedPaneWidth: minimumAppSidebarWidth,
    maximumFixedPaneWidth: maximumAppSidebarWidth,
    minimumFlexiblePaneWidth: minimumWorkspaceShellContentWidth,
    dividerThickness: appSidebarDividerThickness
  )
}

func workspaceCanvasDocumentContainsAgentSurface(_ document: WorkspaceCanvasDocument?) -> Bool {
  guard let document else {
    return false
  }

  return document.surfacesByID.values.contains { $0.surfaceKind == .agent }
}

func shouldAutoCreateInitialTerminal(
  isPendingInitialTerminal: Bool,
  canvasDocument: WorkspaceCanvasDocument?,
  terminalEnvelope: BridgeWorkspaceTerminalsEnvelope?
) -> Bool {
  guard isPendingInitialTerminal else {
    return false
  }

  guard canvasDocument?.surfacesByID.isEmpty ?? true else {
    return false
  }

  guard let terminalEnvelope else {
    return false
  }

  guard terminalEnvelope.runtime.launchError == nil else {
    return false
  }

  guard terminalEnvelope.runtime.supportsCreate else {
    return false
  }

  return terminalEnvelope.terminals.isEmpty
}

func canvasDocumentAddingSurface(
  _ surfaceRecord: CanvasSurfaceRecord,
  to document: WorkspaceCanvasDocument,
  workspaceID: String,
  groupID: String? = nil
) -> WorkspaceCanvasDocument {
  if document.activeLayoutMode == .spatial, groupID == nil {
    let anchorGroupID =
      document.activeGroupID.flatMap { document.groupsByID[$0] != nil ? $0 : nil }
      ?? canvasGroupIDs(in: document.tiledLayout).first(where: { document.groupsByID[$0] != nil })
      ?? document.groupsByID.keys.sorted().first
      ?? defaultCanvasGroupID(for: workspaceID)
    let newGroupID = createCanvasGroupID(for: workspaceID)

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
        targetGroupID: anchorGroupID,
        newGroupID: newGroupID,
        direction: .row,
        splitID: createCanvasSplitID(for: workspaceID)
      ),
      spatialLayout: canvasSpatialLayoutPlacingGroup(
        document.spatialLayout,
        groupID: newGroupID,
        adjacentTo: anchorGroupID,
        direction: .row,
        placeBefore: false
      )
    )
  }

  let targetGroupID =
    groupID
    ?? document.activeGroupID
    ?? canvasGroupIDs(in: document.layout).first
    ?? defaultCanvasGroupID(for: workspaceID)
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

  let nextSpatialLayout =
    if document.activeLayoutMode == .spatial {
      canvasSpatialLayoutBringingGroupToFront(document.spatialLayout, groupID: targetGroupID)
    } else {
      document.spatialLayout
    }

  return WorkspaceCanvasDocument(
    activeGroupID: targetGroupID,
    groupsByID: groups,
    surfacesByID: surfacesByID,
    activeLayoutMode: document.activeLayoutMode,
    tiledLayout: document.tiledLayout,
    spatialLayout: nextSpatialLayout
  )
}

enum StackServicePhase: String, Equatable, Sendable {
  case stopping
}

enum StackServiceLifecycleEvent: Equatable {
  case starting(service: String)
  case started(service: String)
  case failed(service: String, error: String)
  case stopping(service: String)
  case stopped(service: String)
}

struct StackServiceLifecycleUpdate: Equatable {
  let summary: BridgeWorkspaceStackSummary?
  let phases: [String: StackServicePhase]
  let shouldReload: Bool
}

func stackServiceLifecycleEvent(
  from event: BridgeSocket.Event
) -> (workspaceID: String, lifecycle: StackServiceLifecycleEvent)? {
  switch event {
  case .serviceStarting(let workspaceID, let service):
    return (workspaceID, .starting(service: service))
  case .serviceStarted(let workspaceID, let service):
    return (workspaceID, .started(service: service))
  case .serviceFailed(let workspaceID, let service, let error):
    return (workspaceID, .failed(service: service, error: error))
  case .serviceStopping(let workspaceID, let service):
    return (workspaceID, .stopping(service: service))
  case .serviceStopped(let workspaceID, let service):
    return (workspaceID, .stopped(service: service))
  default:
    return nil
  }
}

func applyStackServiceLifecycleEvent(
  _ lifecycle: StackServiceLifecycleEvent,
  summary: BridgeWorkspaceStackSummary?,
  phases: [String: StackServicePhase]
) -> StackServiceLifecycleUpdate {
  var nextPhases = phases
  var nextSummary = summary
  var shouldReload = false

  switch lifecycle {
  case .starting(let service):
    nextPhases.removeValue(forKey: service)
    nextSummary = updatedStackSummary(summary, service: service) { node in
      stackNode(node, status: "starting", statusReason: nil)
    }
  case .started(let service):
    nextPhases.removeValue(forKey: service)
    nextSummary = updatedStackSummary(summary, service: service) { node in
      stackNode(node, status: "ready", statusReason: nil)
    }
    shouldReload = true
  case .failed(let service, let error):
    nextPhases.removeValue(forKey: service)
    nextSummary = updatedStackSummary(summary, service: service) { node in
      stackNode(node, status: "failed", statusReason: error)
    }
    shouldReload = true
  case .stopping(let service):
    nextPhases[service] = .stopping
  case .stopped(let service):
    nextPhases.removeValue(forKey: service)
    nextSummary = updatedStackSummary(summary, service: service) { node in
      stackNode(node, status: "stopped", statusReason: nil)
    }
    shouldReload = true
  }

  return StackServiceLifecycleUpdate(
    summary: nextSummary,
    phases: nextPhases,
    shouldReload: shouldReload
  )
}

private func updatedStackSummary(
  _ summary: BridgeWorkspaceStackSummary?,
  service: String,
  transform: (BridgeStackNode) -> BridgeStackNode
) -> BridgeWorkspaceStackSummary? {
  guard let summary else {
    return nil
  }

  return BridgeWorkspaceStackSummary(
    workspaceID: summary.workspaceID,
    state: summary.state,
    errors: summary.errors,
    nodes: summary.nodes.map { node in
      guard node.name == service, node.isManagedNode else {
        return node
      }

      return transform(node)
    }
  )
}

private func stackNode(
  _ node: BridgeStackNode,
  status: String?,
  statusReason: String?
) -> BridgeStackNode {
  BridgeStackNode(
    workspaceID: node.workspaceID,
    name: node.name,
    kind: node.kind,
    dependsOn: node.dependsOn,
    status: status,
    statusReason: statusReason,
    assignedPort: node.assignedPort,
    previewURL: node.previewURL,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    runOn: node.runOn,
    command: node.command,
    writeFilesCount: node.writeFilesCount
  )
}

func nextTerminalCreationTitle(
  from terminals: [BridgeTerminalRecord],
  kind: BridgeTerminalKind?
) -> String? {
  guard let kind else {
    return nil
  }

  switch kind {
  case .claude, .codex, .opencode, .custom:
    return nextProfileTerminalTitle(from: terminals, kind: kind)
  case .shell:
    return nextShellTerminalTitle(from: terminals)
  }
}

func nextShellTerminalTitle(from terminals: [BridgeTerminalRecord]) -> String {
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

func nextProfileTerminalTitle(
  from terminals: [BridgeTerminalRecord],
  kind: BridgeTerminalKind
) -> String {
  let baseTitle = kind.displayTitle
  let existingNames = Set(terminals.map(\.title))

  if !existingNames.contains(baseTitle) {
    return baseTitle
  }

  var nextIndex = 2
  while true {
    let candidate = "\(baseTitle) \(nextIndex)"
    if !existingNames.contains(candidate) {
      return candidate
    }
    nextIndex += 1
  }
}

func repositoryName(from repositoryPath: String) -> String {
  let trimmedPath = repositoryPath.trimmingCharacters(in: .whitespacesAndNewlines)
  let lastComponent = URL(fileURLWithPath: trimmedPath).lastPathComponent
  return lastComponent.isEmpty ? "repository" : lastComponent
}

func preferredRootWorkspaceName(branchName: String?, repositoryName: String) -> String {
  let trimmedBranchName = branchName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  guard !trimmedBranchName.isEmpty, trimmedBranchName != "HEAD" else {
    return repositoryName
  }

  return trimmedBranchName
}

func preferredRepositoryWorkspace(_ repository: BridgeRepository) -> BridgeWorkspaceSummary? {
  repository.workspaces.first(where: { isRootWorkspaceSummary($0, in: repository) }) ?? repository.workspaces.first
}

func isRootWorkspaceSummary(
  _ workspace: BridgeWorkspaceSummary,
  in repository: BridgeRepository
) -> Bool {
  workspace.path == repository.path
}

func slugifyName(_ value: String, fallback: String = "item") -> String {
  var slug = value
    .trimmingCharacters(in: .whitespacesAndNewlines)
    .lowercased()
    .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
    .replacingOccurrences(of: "^-+|-+$", with: "", options: .regularExpression)

  if slug.isEmpty {
    slug = fallback
  }

  return slug
}

func slugifyWorkspaceName(_ value: String) -> String {
  slugifyName(value, fallback: "workspace")
}

func shortWorkspaceID(_ workspaceID: String) -> String {
  let prefix = workspaceID
    .filter { $0.isLetter || $0.isNumber }
    .prefix(8)

  return prefix.isEmpty ? "workspace" : String(prefix)
}

func workspaceBranchName(workspaceName: String, workspaceID: String) -> String {
  "lifecycle/\(slugifyWorkspaceName(workspaceName))-\(shortWorkspaceID(workspaceID))"
}

@MainActor
func unresolvedCanvasSurface(record: CanvasSurfaceRecord) -> ResolvedSurface {
  let tab = SurfaceTabPresentation(
    label: record.title,
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

func unresolvedCanvasSurfaceIcon(for kind: SurfaceKind) -> String {
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
        .font(.lc(size: 24, weight: .regular))
        .foregroundStyle(theme.mutedColor.opacity(0.7))

      Text(record.title)
        .font(.lc(size: 16, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)

      Text("Resolving \(record.surfaceKind.rawValue) surface...")
        .font(.lc(size: 12, weight: .medium, design: .monospaced))
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
  let customAgentActionsEnabled = false
  @Published var bridgeURL: URL?
  @Published var bridgeClient: BridgeClient?
  @Published var authState: BridgeAuthState?
  @Published var providerAuthStatusByProvider: [BridgeAgentProvider: BridgeProviderAuthStatus] = [:]
  @Published var organizations: [BridgeOrganization] = []
  @Published var repositories: [BridgeRepository] = []
  @Published var terminalEnvelopeByWorkspaceID: [String: BridgeWorkspaceTerminalsEnvelope] = [:]
  @Published var stackSummaryByWorkspaceID: [String: BridgeWorkspaceStackSummary] = [:]
  @Published var stackServicePhasesByWorkspaceID: [String: [String: StackServicePhase]] = [:]
  @Published var stackLoadingWorkspaceIDs = Set<String>()
  @Published var terminalConnectionBySurfaceID: [String: BridgeTerminalConnection] = [:]
  @Published var agentsByWorkspaceID: [String: [BridgeAgentRecord]] = [:]
  @Published var canvasDocumentsByWorkspaceID: [String: WorkspaceCanvasDocument] = [:]
  @Published var activeExtensionKindByWorkspaceID: [String: WorkspaceExtensionKind] = [:]
  @Published var collapsedExtensionKindsByWorkspaceID: [String: Set<WorkspaceExtensionKind>] = [:]
  @Published var appSidebarWidthValue: CGFloat = defaultAppSidebarWidth
  @Published var expandedAppSidebarRepositoryIDs = Set<String>()
  @Published var extensionSidebarWidthByWorkspaceID: [String: CGFloat] = [:]
  @Published var selectedAgentIDByWorkspaceID: [String: String] = [:]
  @Published var terminalThemeContext: AppTerminalThemeContext = .fallback
  @Published var selectedRepositoryID: String?
  @Published var selectedWorkspaceID: String?
  @Published var isLoading = false
  @Published var isRecoveringBridge = false
  @Published var errorMessage: String?
  @Published var lastFailureSummary: String?
  @Published var terminalLoadingWorkspaceIDs = Set<String>()
  @Published var draggingSurfaceID: String?
  @Published var openedWorkspaceIDs = Set<String>()
  @Published var closedSurfaceSnapshots: [ClosedSurfaceSnapshot] = []
  @Published var closedSurfaceIDsByWorkspaceID: [String: Set<String>] = [:]

  var bridgePID: Int?
  var bridgeMonitorTask: Task<Void, Never>?
  let bridgeSocket = BridgeSocket()
  var didStart = false
  var didRestorePersistedCanvasDocuments = false
  var didRestorePersistedAppSidebarLayoutState = false
  var didRestorePersistedExtensionSidebarLayoutState = false
  var agentHandlesByID: [String: AgentHandle] = [:]
  var pendingInitialTerminalWorkspaceIDs = Set<String>()
  var workspaceStoresByID: [String: WorkspaceStore] = [:]

  static let lastWorkspaceIDKey = "lifecycle.lastWorkspaceID"
  static let lastRepositoryIDKey = "lifecycle.lastRepositoryID"

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

  func registerSurfaces() {
    SurfaceRegistry.shared.register(TerminalSurfaceDefinition())
  }

  func registerExtensions() {
    WorkspaceExtensionRegistry.shared.register(StackExtensionDefinition())
    WorkspaceExtensionRegistry.shared.register(SessionsExtensionDefinition())
    WorkspaceExtensionRegistry.shared.register(DebugExtensionDefinition())
  }








  func setTerminalThemeContext(_ context: AppTerminalThemeContext) {
    guard terminalThemeContext != context else {
      return
    }

    terminalThemeContext = context
    syncAllWorkspaceStores()
  }








  func workspaceStore(for workspaceID: String) -> WorkspaceStore {
    ensureWorkspaceStore(for: workspaceID)
  }






















}
