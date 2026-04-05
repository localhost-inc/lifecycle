import SwiftUI

struct WorkspaceSidebarView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let onOpenSettings: () -> Void

  @State private var expandedRepositoryIDs = Set<String>()

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Traffic light spacer
      Color.clear.frame(height: 40)

      // Section header
      HStack(alignment: .center) {
        Text("Repositories")
          .font(.system(size: 12, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
        Spacer()
        Button {
          model.refresh()
        } label: {
          Image(systemName: "arrow.clockwise")
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .help("Refresh")
      }
      .padding(.leading, 16)
      .padding(.trailing, 12)
      .padding(.bottom, 6)

      // Repository + workspace list
      ScrollView {
        VStack(alignment: .leading, spacing: 2) {
          ForEach(model.repositories) { repository in
            SidebarRepositorySection(
              model: model,
              repository: repository,
              isExpanded: expandedRepositoryIDs.contains(repository.id),
              onToggleExpanded: { toggleExpanded(repository.id) }
            )
          }
        }
        .padding(.horizontal, 8)
        .padding(.bottom, 16)
      }
      .scrollIndicators(.automatic)

      if let errorMessage = model.errorMessage {
        Text(errorMessage)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.errorColor.opacity(0.9))
          .lineLimit(2)
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
      }

      // Bottom bar
      SidebarBottomBar(onOpenSettings: onOpenSettings)
    }
    .onAppear {
      // Auto-expand the selected repo
      if let selectedID = model.selectedRepositoryID {
        expandedRepositoryIDs.insert(selectedID)
      }
    }
    .onChange(of: model.selectedRepositoryID) { nextID in
      // Auto-expand when selecting into a collapsed repo
      if let nextID {
        expandedRepositoryIDs.insert(nextID)
      }
    }
  }

  private func toggleExpanded(_ repositoryID: String) {
    if expandedRepositoryIDs.contains(repositoryID) {
      expandedRepositoryIDs.remove(repositoryID)
    } else {
      expandedRepositoryIDs.insert(repositoryID)
    }
  }
}

// MARK: - Repository Section

private struct SidebarRepositorySection: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let repository: BridgeRepository
  let isExpanded: Bool
  let onToggleExpanded: () -> Void

  private var isSelected: Bool {
    repository.id == model.selectedRepositoryID
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      // Repository row
      Button {
        onToggleExpanded()
      } label: {
        HStack(spacing: 6) {
          Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
            .frame(width: 12)

          Text(repository.name)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(isSelected ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
            .lineLimit(1)
            .truncationMode(.tail)

          Spacer()

          if hasRepositoryActivity {
            Circle()
              .fill(theme.activityBusyColor)
              .frame(width: 6, height: 6)
          }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      }
      .buttonStyle(.plain)

      // Workspaces — shown when expanded
      if isExpanded && !repository.workspaces.isEmpty {
        VStack(alignment: .leading, spacing: 1) {
          ForEach(repository.workspaces) { workspace in
            SidebarWorkspaceRow(
              model: model,
              repository: repository,
              workspace: workspace,
              isActive: workspace.id == model.selectedWorkspaceID
            )
          }
        }
        .padding(.bottom, 4)
      }
    }
  }

  private var hasRepositoryActivity: Bool {
    repository.workspaces.contains { workspace in
      model.activityByWorkspaceID[workspace.id]?.busy == true
    }
  }
}

// MARK: - Workspace Row

private struct SidebarWorkspaceRow: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let repository: BridgeRepository
  let workspace: BridgeWorkspaceSummary
  let isActive: Bool

  @State private var isHovering = false

  var body: some View {
    Button {
      model.select(repository: repository, workspace: workspace)
    } label: {
      HStack(spacing: 6) {
        Image(systemName: workspace.ref == nil ? "folder.badge.gearshape" : "arrow.triangle.branch")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
          .frame(width: 16)

        Text(workspace.name)
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
          .lineLimit(1)
          .truncationMode(.tail)

        Spacer()

        if isBusy {
          Circle()
            .fill(theme.activityBusyColor)
            .frame(width: 5, height: 5)
        }
      }
      .padding(.leading, 20)
      .padding(.trailing, 8)
      .padding(.vertical, 5)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(isActive ? theme.sidebarSelectedColor : (isHovering ? theme.sidebarHoverColor : Color.clear))
      )
      .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .onHover { hovering in
      isHovering = hovering
    }
  }

  private var isBusy: Bool {
    model.activityByWorkspaceID[workspace.id]?.busy == true
  }
}

// MARK: - Bottom Bar

private struct SidebarBottomBar: View {
  @Environment(\.appTheme) private var theme
  let onOpenSettings: () -> Void

  var body: some View {
    HStack(alignment: .center) {
      Text("lifecycle")
        .font(.system(size: 12, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.sidebarMutedForegroundColor.opacity(0.6))

      Spacer()

      Button {
        onOpenSettings()
      } label: {
        Image(systemName: "gearshape")
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
      }
      .buttonStyle(.plain)
      .contentShape(Rectangle())
      .help("Settings")
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }
}
