import SwiftUI

struct WorkspaceHeaderView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    HStack(spacing: 12) {
      HStack(spacing: 8) {
        if let repository = model.selectedRepository {
          Label(repository.name, systemImage: "folder")
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(theme.mutedColor)
        }

        Image(systemName: "chevron.right")
          .font(.system(size: 10, weight: .semibold))
          .foregroundStyle(theme.mutedColor.opacity(0.8))

        Label(workspace.name, systemImage: workspace.ref == nil ? "folder.badge.gearshape" : "point.topleft.down.curvedto.point.bottomright.up")
          .font(.system(size: 13, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
      }

      Spacer()
    }
    .frame(maxWidth: .infinity, minHeight: 32, alignment: .leading)
  }
}
