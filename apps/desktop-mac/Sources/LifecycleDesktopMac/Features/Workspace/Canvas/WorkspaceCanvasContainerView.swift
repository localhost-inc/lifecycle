import SwiftUI

struct WorkspaceCanvasContainerView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    Group {
      if model.terminalLoadingWorkspaceIDs.contains(workspace.id) && model.terminalEnvelope(for: workspace.id) == nil {
        ProgressView("Resolving terminals…")
          .tint(theme.primaryTextColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let terminals = model.terminalEnvelope(for: workspace.id),
                let launchError = terminals.runtime.launchError
      {
        VStack(alignment: .leading, spacing: 12) {
          Text("Terminal runtime unavailable")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
          Text(launchError)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.errorColor.opacity(0.95))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding(32)
      } else if let canvasState = model.canvasState(for: workspace.id) {
        WorkspaceCanvasView(
          model: model,
          workspaceID: workspace.id,
          canvasState: canvasState
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      } else {
        VStack(spacing: 10) {
          Text("No terminals yet")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(theme.primaryTextColor)
          Text("This PoC mounts terminal surfaces from the bridge terminal runtime.")
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }
}
