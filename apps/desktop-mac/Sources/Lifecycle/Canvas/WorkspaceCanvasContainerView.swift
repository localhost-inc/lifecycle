import SwiftUI

struct WorkspaceCanvasContainerView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary
  let dimmingSettings: WorkspacePaneDimmingSettings

  var body: some View {
    Group {
      if let canvasState = model.canvasState(for: workspace.id) {
        WorkspaceCanvasView(
          model: model,
          workspaceID: workspace.id,
          canvasState: canvasState,
          isActiveWorkspace: workspace.id == model.selectedWorkspaceID,
          dimmingSettings: dimmingSettings
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else if model.terminalLoadingWorkspaceIDs.contains(workspace.id) && model.terminalEnvelope(for: workspace.id) == nil {
        ProgressView("Resolving terminals…")
          .tint(theme.primaryTextColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let terminals = model.terminalEnvelope(for: workspace.id),
                let launchError = terminals.runtime.launchError
      {
        VStack(alignment: .leading, spacing: 12) {
          Text("Terminal runtime unavailable")
            .font(.lc(size: 20, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
          Text(launchError)
            .font(.lc(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.errorColor.opacity(0.95))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding(32)
      } else {
        VStack(spacing: 16) {
          Image(systemName: "terminal")
            .font(.lc(size: 32, weight: .light))
            .foregroundStyle(theme.mutedColor.opacity(0.5))

          VStack(spacing: 6) {
            Text("No open tabs")
              .font(.lc(size: 15, weight: .medium))
              .foregroundStyle(theme.primaryTextColor.opacity(0.85))

            Text("Start in a terminal. Press \(Text("⌘T").fontWeight(.semibold)) to open one.")
              .font(.lc(size: 12))
              .foregroundStyle(theme.mutedColor)
              .multilineTextAlignment(.center)
          }

          TerminalCreationMenuButton(style: .prominent) { kind in
            model.createTerminalTab(kind: kind, workspaceID: workspace.id)
          }
          .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }
}
