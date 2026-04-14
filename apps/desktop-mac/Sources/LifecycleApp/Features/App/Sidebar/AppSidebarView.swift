import AppKit
import SwiftUI

/// Global application sidebar: organization context, repositories, workspaces, and user footer.
struct AppSidebarView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let onOpenSettings: () -> Void

  @State private var expandedRepositoryIDs = Set<String>()

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Color.clear.frame(height: 40)
        .contentShape(Rectangle())
        .onTapGesture(count: 2) {
          NSApp.mainWindow?.zoom(nil)
        }

      AppSidebarOrganizationHeaderView(model: model)
        .padding(.bottom, 4)

      theme.borderColor.opacity(0.3)
        .frame(height: 1)
        .padding(.horizontal, 12)
        .padding(.bottom, 8)

      HStack(alignment: .center) {
        Text("Repositories")
          .font(.lc(size: 12, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
        Spacer()
        Button {
          model.addRepository()
        } label: {
          Image(systemName: "plus")
            .font(.lc(size: 11, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .contentShape(Rectangle())
        .help("Add Repository")
      }
      .padding(.leading, 16)
      .padding(.trailing, 12)
      .padding(.bottom, 6)

      ScrollView {
        VStack(alignment: .leading, spacing: 2) {
          ForEach(model.repositories) { repository in
            AppSidebarRepositorySection(
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
          .font(.lc(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(theme.errorColor.opacity(0.9))
          .lineLimit(2)
          .padding(.horizontal, 16)
          .padding(.bottom, 8)
      }

      AppSidebarBottomBar(model: model, onOpenSettings: onOpenSettings)
    }
    .onAppear {
      if let selectedID = model.selectedRepositoryID {
        expandedRepositoryIDs.insert(selectedID)
      }
    }
    .onChange(of: model.selectedRepositoryID) { nextID in
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

private struct AppSidebarRepositorySection: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let repository: BridgeRepository
  let isExpanded: Bool
  let onToggleExpanded: () -> Void

  @State private var isHovering = false
  @State private var isPresentingRemoveConfirmation = false
  @State private var isPresentingCreateWorkspacePopover = false
  @State private var draftWorkspaceName = ""
  @State private var selectedWorkspaceHost: WorkspaceCreationHost = .local

  private var isSelected: Bool {
    repository.id == model.selectedRepositoryID
  }

  private var showsActions: Bool {
    isHovering || isPresentingCreateWorkspacePopover
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ZStack(alignment: .trailing) {
        Button {
          onToggleExpanded()
        } label: {
          HStack(spacing: 6) {
            Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
              .font(.lc(size: 9, weight: .semibold))
              .foregroundStyle(theme.sidebarMutedForegroundColor)
              .frame(width: 12)

            Text(repository.name)
              .font(.lc(size: 13, weight: .medium))
              .foregroundStyle(isSelected ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
              .lineLimit(1)
              .truncationMode(.tail)

            Spacer()
          }
          .padding(.horizontal, 8)
          .padding(.trailing, showsActions ? 56 : 8)
          .padding(.vertical, 6)
          .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .frame(maxWidth: .infinity, alignment: .leading)

        HStack(spacing: 4) {
          Button {
            draftWorkspaceName = ""
            selectedWorkspaceHost = .local
            isPresentingCreateWorkspacePopover = true
          } label: {
            Image(systemName: "plus")
              .font(.lc(size: 11, weight: .medium))
              .foregroundStyle(theme.sidebarMutedForegroundColor)
              .frame(width: 24, height: 24)
          }
          .buttonStyle(.plain)
          .lcPointerCursor()
          .help("New Workspace")
          .popover(
            isPresented: $isPresentingCreateWorkspacePopover,
            attachmentAnchor: .rect(.bounds),
            arrowEdge: .trailing
          ) {
            AppSidebarCreateWorkspacePopover(
              repositoryName: repository.name,
              workspaceName: $draftWorkspaceName,
              selectedHost: $selectedWorkspaceHost,
              onCancel: {
                draftWorkspaceName = ""
                selectedWorkspaceHost = .local
                isPresentingCreateWorkspacePopover = false
              },
              onCreate: { workspaceName, host in
                draftWorkspaceName = ""
                selectedWorkspaceHost = .local
                isPresentingCreateWorkspacePopover = false
                model.createWorkspace(for: repository.id, name: workspaceName, host: host)
              }
            )
          }

          Button {
            isPresentingRemoveConfirmation = true
          } label: {
            Image(systemName: "archivebox")
              .font(.lc(size: 11, weight: .medium))
              .foregroundStyle(theme.sidebarMutedForegroundColor)
              .frame(width: 24, height: 24)
          }
          .buttonStyle(.plain)
          .lcPointerCursor()
          .help("Remove Repository")
        }
        .opacity(showsActions ? 1 : 0)
        .allowsHitTesting(showsActions)
        .padding(.trailing, 8)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 8, style: .continuous)
          .fill(isHovering ? theme.sidebarHoverColor : Color.clear)
      )
      .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      .onHover { hovering in
        isHovering = hovering
      }
      .confirmationDialog(
        "Remove \(repository.name)?",
        isPresented: $isPresentingRemoveConfirmation,
        titleVisibility: .visible
      ) {
        Button("Remove Repository", role: .destructive) {
          model.removeRepository(repository.id)
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("This removes the repository from Lifecycle. Files on disk are not deleted.")
      }

      if isExpanded && !repository.workspaces.isEmpty {
        VStack(alignment: .leading, spacing: 1) {
          ForEach(repository.workspaces) { workspace in
            AppSidebarWorkspaceRow(
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
}

private struct AppSidebarCreateWorkspacePopover: View {
  @Environment(\.appTheme) private var theme

  let repositoryName: String
  @Binding var workspaceName: String
  @Binding var selectedHost: WorkspaceCreationHost
  let onCancel: () -> Void
  let onCreate: (_ workspaceName: String, _ host: WorkspaceCreationHost) -> Void

  @FocusState private var isWorkspaceNameFocused: Bool

  private var trimmedWorkspaceName: String {
    workspaceName.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      VStack(alignment: .leading, spacing: 4) {
        Text("New Workspace")
          .font(.lc(size: 14, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        Text("Create a named workspace in \(repositoryName).")
          .font(.lc(size: 11, weight: .medium))
          .foregroundStyle(theme.mutedColor)
      }

      VStack(alignment: .leading, spacing: 6) {
        Text("Name")
          .font(.lc(size: 11, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)

        TextField("Workspace name", text: $workspaceName)
          .textFieldStyle(.roundedBorder)
          .focused($isWorkspaceNameFocused)
          .onSubmit {
            submit()
          }
      }

      AppSidebarWorkspaceHostPicker(selection: $selectedHost)

      Text("Remote and cloud are coming soon.")
        .font(.lc(size: 10, weight: .medium))
        .foregroundStyle(theme.mutedColor)

      HStack(spacing: 8) {
        Spacer()

        Button("Cancel", role: .cancel) {
          onCancel()
        }
        .keyboardShortcut(.cancelAction)

        Button("Create Workspace") {
          submit()
        }
        .keyboardShortcut(.defaultAction)
        .disabled(trimmedWorkspaceName.isEmpty || !selectedHost.isAvailableInDesktopMac)
      }
    }
    .padding(16)
    .frame(width: 320)
    .background(theme.panelBackground)
    .controlSize(.small)
    .onAppear {
      DispatchQueue.main.async {
        isWorkspaceNameFocused = true
      }
    }
  }

  private func submit() {
    guard !trimmedWorkspaceName.isEmpty, selectedHost.isAvailableInDesktopMac else {
      return
    }

    onCreate(trimmedWorkspaceName, selectedHost)
  }
}

private struct AppSidebarWorkspaceHostPicker: View {
  @Environment(\.appTheme) private var theme

  @Binding var selection: WorkspaceCreationHost

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Host")
        .font(.lc(size: 11, weight: .medium))
        .foregroundStyle(theme.sidebarMutedForegroundColor)

      AppSidebarHostSegmentedControl(selection: $selection)
        .frame(height: 24)
        .lcPointerCursor()
    }
  }
}

private struct AppSidebarHostSegmentedControl: NSViewRepresentable {
  @Binding var selection: WorkspaceCreationHost

  func makeCoordinator() -> Coordinator {
    Coordinator(selection: $selection)
  }

  func makeNSView(context: Context) -> NSSegmentedControl {
    let control = NSSegmentedControl(
      labels: WorkspaceCreationHost.allCases.map(\.label),
      trackingMode: .selectOne,
      target: context.coordinator,
      action: #selector(Coordinator.selectionDidChange(_:))
    )
    control.segmentStyle = .rounded
    control.controlSize = .small
    control.segmentDistribution = .fillEqually
    return control
  }

  func updateNSView(_ control: NSSegmentedControl, context: Context) {
    for (index, host) in WorkspaceCreationHost.allCases.enumerated() {
      control.setEnabled(host.isAvailableInDesktopMac, forSegment: index)
      control.setToolTip(hostTooltip(for: host), forSegment: index)
    }

    control.selectedSegment = WorkspaceCreationHost.allCases.firstIndex(of: selection) ?? 0
    context.coordinator.selection = $selection
  }

  private func hostTooltip(for host: WorkspaceCreationHost) -> String {
    if host.isAvailableInDesktopMac {
      return host.detail
    }

    return "\(host.label) is not available in desktop-mac yet."
  }

  final class Coordinator: NSObject {
    var selection: Binding<WorkspaceCreationHost>

    init(selection: Binding<WorkspaceCreationHost>) {
      self.selection = selection
    }

    @objc func selectionDidChange(_ sender: NSSegmentedControl) {
      let index = sender.selectedSegment
      guard index >= 0, index < WorkspaceCreationHost.allCases.count else {
        sender.selectedSegment = WorkspaceCreationHost.allCases.firstIndex(of: selection.wrappedValue) ?? 0
        return
      }

      let host = WorkspaceCreationHost.allCases[index]
      guard host.isAvailableInDesktopMac else {
        sender.selectedSegment = WorkspaceCreationHost.allCases.firstIndex(of: selection.wrappedValue) ?? 0
        return
      }

      selection.wrappedValue = host
    }
  }
}

private struct AppSidebarWorkspaceRow: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let repository: BridgeRepository
  let workspace: BridgeWorkspaceSummary
  let isActive: Bool

  @State private var isHovering = false

  private var canArchive: Bool {
    !isRootWorkspaceSummary(workspace, in: repository)
  }

  private var showsArchiveAction: Bool {
    canArchive && isHovering
  }

  var body: some View {
    ZStack(alignment: .trailing) {
      Button {
        model.select(repository: repository, workspace: workspace)
      } label: {
        HStack(spacing: 6) {
          Image(systemName: workspace.ref == nil ? "folder.badge.gearshape" : "arrow.triangle.branch")
            .font(.lc(size: 10, weight: .medium))
            .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
            .frame(width: 16)

          Text(workspace.name)
            .font(.lc(size: 12, weight: .semibold))
            .foregroundStyle(isActive ? theme.sidebarForegroundColor : theme.sidebarMutedForegroundColor)
            .lineLimit(1)
            .truncationMode(.tail)

          Spacer()
        }
        .padding(.leading, 20)
        .padding(.trailing, showsArchiveAction ? 36 : 8)
        .padding(.vertical, 5)
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .frame(maxWidth: .infinity, alignment: .leading)

      if canArchive {
        Button {
          presentArchiveWorkspaceAlert()
        } label: {
          Image(systemName: "archivebox")
            .font(.lc(size: 11, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
            .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .help("Archive Workspace")
        .opacity(showsArchiveAction ? 1 : 0)
        .allowsHitTesting(showsArchiveAction)
        .padding(.trailing, 8)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 8, style: .continuous)
        .fill(isActive ? theme.sidebarSelectedColor : (isHovering ? theme.sidebarHoverColor : Color.clear))
    )
    .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    .onHover { hovering in
      isHovering = hovering
    }
  }

  private var archiveConfirmationMessage: String {
    if workspace.host == "local" {
      return "This archives the workspace in Lifecycle and removes its local worktree. Repository files stay in place."
    }

    return "This archives the workspace in Lifecycle. Repository files stay in place."
  }

  private func presentArchiveWorkspaceAlert() {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "Archive \(workspace.name)?"
    alert.informativeText = archiveConfirmationMessage
    alert.addButton(withTitle: "Archive Workspace")
    alert.addButton(withTitle: "Cancel")

    let archiveWorkspace = {
      model.archiveWorkspace(workspace.id, repositoryPath: repository.path)
    }

    if let window = NSApp.keyWindow ?? NSApp.mainWindow {
      alert.beginSheetModal(for: window) { response in
        guard response == .alertFirstButtonReturn else {
          return
        }
        archiveWorkspace()
      }
      return
    }

    if alert.runModal() == .alertFirstButtonReturn {
      archiveWorkspace()
    }
  }
}

private struct AppSidebarBottomBar: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let onOpenSettings: () -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      theme.borderColor.opacity(0.3)
        .frame(height: 1)
        .padding(.horizontal, 12)

      HStack(alignment: .center, spacing: 12) {
        AppSidebarUserFooterView(model: model)
          .frame(maxWidth: .infinity, alignment: .leading)

        Button {
          onOpenSettings()
        } label: {
          Image(systemName: "gearshape")
            .font(.lc(size: 13, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
            .frame(width: 28, height: 28)
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .contentShape(Rectangle())
        .help("Settings")
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
    }
  }
}
