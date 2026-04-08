import LifecyclePresentation
import SwiftUI

@MainActor
final class WorkspaceStore: ObservableObject {
  let workspaceID: String

  @Published private(set) var repository: BridgeRepository?
  @Published private(set) var canvasState: CanvasState?
  @Published private(set) var extensionSidebarState: WorkspaceExtensionSidebarState?
  @Published private(set) var terminalEnvelope: BridgeWorkspaceTerminalsEnvelope?
  @Published private(set) var agents: [BridgeAgentRecord] = []
  @Published private(set) var isTerminalLoading = false
  @Published private(set) var draggingSurfaceID: String?

  private unowned let model: AppModel

  init(workspaceID: String, model: AppModel) {
    self.workspaceID = workspaceID
    self.model = model
    self.repository = nil
    self.canvasState = nil
    self.extensionSidebarState = nil
    self.terminalEnvelope = nil
    self.draggingSurfaceID = nil
    syncFromModel()
  }

  func syncFromModel() {
    repository = model.repository(for: workspaceID)
    canvasState = model.canvasState(for: workspaceID)
    extensionSidebarState = model.extensionSidebarState(for: workspaceID)
    terminalEnvelope = model.terminalEnvelope(for: workspaceID)
    agents = model.agentsByWorkspaceID[workspaceID] ?? []
    isTerminalLoading = model.terminalLoadingWorkspaceIDs.contains(workspaceID)
    draggingSurfaceID = model.draggingSurfaceID
  }

  func extensionSidebarWidth(availableWidth: CGFloat? = nil) -> CGFloat {
    model.extensionSidebarWidth(for: workspaceID, availableWidth: availableWidth)
  }

  func setExtensionSidebarWidth(_ width: CGFloat, availableWidth: CGFloat? = nil) {
    model.setExtensionSidebarWidth(width, workspaceID: workspaceID, availableWidth: availableWidth)
  }

  func selectExtension(_ kind: WorkspaceExtensionKind) {
    model.selectExtension(kind, workspaceID: workspaceID)
  }

  func createTerminalTab(groupID: String? = nil) {
    model.createTerminalTab(workspaceID: workspaceID, groupID: groupID)
  }

  func createAgentSurface(provider: BridgeAgentProvider, groupID: String? = nil) {
    model.createAgentSurface(provider: provider, workspaceID: workspaceID, groupID: groupID)
  }

  func openAgentSurface(agentID: String, groupID: String? = nil) {
    model.openAgentSurface(agentID: agentID, workspaceID: workspaceID, groupID: groupID)
  }

  func selectSurface(_ surfaceID: String, groupID: String? = nil) {
    model.selectSurface(surfaceID, workspaceID: workspaceID, groupID: groupID)
  }

  func closeSurface(_ surfaceID: String) {
    model.closeSurface(surfaceID, workspaceID: workspaceID)
  }

  func selectGroup(_ groupID: String) {
    model.selectGroup(groupID, workspaceID: workspaceID)
  }

  func splitGroup(_ groupID: String, direction: CanvasTiledLayoutSplit.Direction) {
    model.splitGroup(groupID, direction: direction, workspaceID: workspaceID)
  }

  func setSplitRatio(_ splitID: String, ratio: Double) {
    model.setSplitRatio(splitID, ratio: ratio, workspaceID: workspaceID)
  }

  func reorderSurface(surfaceID: String, onto targetSurfaceID: String, groupID: String? = nil) {
    model.reorderSurface(
      surfaceID: surfaceID,
      onto: targetSurfaceID,
      workspaceID: workspaceID,
      groupID: groupID
    )
  }

  func dropSurface(surfaceID: String, onGroupID groupID: String, edge: CanvasDropEdge) {
    model.dropSurface(surfaceID: surfaceID, onGroupID: groupID, edge: edge, workspaceID: workspaceID)
  }

  func setDraggingSurfaceID(_ surfaceID: String?) {
    model.setDraggingSurfaceID(surfaceID)
  }
}
