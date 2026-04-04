import SwiftUI
import UniformTypeIdentifiers

private let sidebarBackground = Color(red: 0.09, green: 0.08, blue: 0.07)
private let panelBackground = Color(red: 0.11, green: 0.09, blue: 0.08)
private let chromeBackground = Color(red: 0.08, green: 0.07, blue: 0.06)
private let primaryTextColor = Color(red: 0.95, green: 0.93, blue: 0.90)
private let mutedColor = Color(red: 0.63, green: 0.60, blue: 0.56)
private let highlightColor = Color(red: 0.23, green: 0.21, blue: 0.19)
private let surfaceTabDragType = UTType.plainText
private let splitDividerThickness: CGFloat = 10
private let minimumGroupLength: CGFloat = 240

struct ContentView: View {
  @StateObject private var model = AppModel()

  var body: some View {
    HStack(spacing: 0) {
      SidebarView(model: model)
        .frame(width: 280)
        .background(sidebarBackground)

      Divider()

      WorkspaceRouteView(model: model)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(chromeBackground)
    }
    .frame(minWidth: 1280, minHeight: 820)
    .background(chromeBackground)
    .task {
      model.start()
    }
  }
}

private struct SidebarView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .center, spacing: 12) {
        VStack(alignment: .leading, spacing: 2) {
          Text("Lifecycle Native")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(primaryTextColor)
          Text("Repos and workspaces from the bridge")
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(mutedColor)
        }

        Spacer()

        Button("Refresh") {
          model.refresh()
        }
        .buttonStyle(.bordered)
      }
      .padding(20)

      if let bridgeURL = model.bridgeURL {
        Text(bridgeURL.absoluteString)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(mutedColor)
          .padding(.horizontal, 20)
          .padding(.bottom, 16)
      }

      ScrollView {
        VStack(alignment: .leading, spacing: 18) {
          ForEach(model.repositories) { repository in
            VStack(alignment: .leading, spacing: 8) {
              Text(repository.name)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(primaryTextColor)

              ForEach(repository.workspaces) { workspace in
                Button {
                  model.select(repository: repository, workspace: workspace)
                } label: {
                  HStack(spacing: 10) {
                    Circle()
                      .fill(model.activityByWorkspaceID[workspace.id]?.busy == true ? Color.green : Color.gray.opacity(0.5))
                      .frame(width: 8, height: 8)

                    VStack(alignment: .leading, spacing: 2) {
                      Text(workspace.name)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(primaryTextColor)
                      Text("\(workspace.host) • \(workspace.status)")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(mutedColor)
                    }

                    Spacer()
                  }
                  .padding(.horizontal, 12)
                  .padding(.vertical, 10)
                  .frame(maxWidth: .infinity)
                  .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                  .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                      .fill(model.selectedWorkspaceID == workspace.id ? highlightColor : Color.clear)
                  )
                }
                .buttonStyle(.plain)
              }
            }
            .padding(.horizontal, 16)
          }
        }
        .padding(.bottom, 20)
      }

      if let errorMessage = model.errorMessage {
        Text(errorMessage)
          .font(.system(size: 11, weight: .medium, design: .monospaced))
          .foregroundStyle(Color.red.opacity(0.9))
          .padding(16)
      }
    }
  }
}

private struct WorkspaceRouteView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    if model.isLoading && model.repositories.isEmpty {
      ProgressView("Loading bridge…")
        .tint(primaryTextColor)
        .foregroundStyle(primaryTextColor)
    } else if let workspace = model.selectedWorkspace {
      HStack(spacing: 0) {
        WorkspaceCanvasContainerView(model: model, workspace: workspace)
          .frame(maxWidth: .infinity, maxHeight: .infinity)

        Divider()

        WorkspaceInspectorView(model: model, workspace: workspace)
          .frame(width: 320)
          .background(panelBackground)
      }
    } else {
      VStack(spacing: 16) {
        Text("Select a workspace")
          .font(.system(size: 24, weight: .semibold))
          .foregroundStyle(primaryTextColor)
        Text("The sidebar is backed by `GET /repos` from the new bridge.")
          .font(.system(size: 13, weight: .medium, design: .monospaced))
          .foregroundStyle(mutedColor)
      }
    }
  }
}

private struct WorkspaceCanvasContainerView: View {
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    VStack(spacing: 0) {
      HStack {
        VStack(alignment: .leading, spacing: 4) {
          Text(workspace.name)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(primaryTextColor)
          Text("workspace route • canvas-owned layout • group-backed terminal surfaces")
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(mutedColor)
        }

        Spacer()
      }
      .padding(.horizontal, 24)
      .padding(.vertical, 18)
      .background(chromeBackground)

      if model.terminalLoadingWorkspaceIDs.contains(workspace.id) && model.selectedTerminalEnvelope == nil {
        ProgressView("Resolving terminals…")
          .tint(primaryTextColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      } else if let terminals = model.selectedTerminalEnvelope,
                let launchError = terminals.runtime.launchError
      {
        VStack(alignment: .leading, spacing: 12) {
          Text("Terminal runtime unavailable")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(primaryTextColor)
          Text(launchError)
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(Color.red.opacity(0.95))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .padding(32)
      } else if let canvasState = model.canvasState() {
        WorkspaceCanvasView(
          model: model,
          workspaceID: workspace.id,
          canvasState: canvasState
        )
          .padding(18)
      } else {
        VStack(spacing: 10) {
          Text("No terminals yet")
            .font(.system(size: 18, weight: .semibold))
            .foregroundStyle(primaryTextColor)
          Text("This PoC mounts terminal surfaces from the bridge terminal runtime.")
            .font(.system(size: 12, weight: .medium, design: .monospaced))
            .foregroundStyle(mutedColor)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
  }
}

private struct WorkspaceCanvasView: View {
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState

  var body: some View {
    Group {
      switch canvasState.layout {
      case let .tiled(tiledLayout):
        CanvasTiledLayoutNodeView(
          model: model,
          workspaceID: workspaceID,
          canvasState: canvasState,
          layoutNode: tiledLayout,
          activeGroupID: canvasState.activeGroupID
        )
      case .spatial:
        Text("Spatial canvas mode is not implemented yet")
          .foregroundStyle(mutedColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
      .background(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .fill(panelBackground)
      )
      .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
  }
}

private struct CanvasTiledLayoutNodeView: View {
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState
  let layoutNode: CanvasTiledLayoutNode
  let activeGroupID: String?

  var body: some View {
    switch layoutNode {
    case let .group(groupID):
      if let group = canvasState.group(withID: groupID) {
        WorkspaceGroupView(
          model: model,
          workspaceID: workspaceID,
          group: group,
          surfaces: canvasState.orderedSurfaces(in: group),
          isActive: group.id == activeGroupID
        )
      } else {
        Text("Group is missing from canvas state")
          .foregroundStyle(Color.red.opacity(0.92))
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    case let .split(split):
      CanvasTiledSplitView(
        model: model,
        workspaceID: workspaceID,
        canvasState: canvasState,
        split: split,
        activeGroupID: activeGroupID
      )
    }
  }
}

private struct CanvasTiledSplitView: View {
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState
  let split: CanvasTiledLayoutSplit
  let activeGroupID: String?

  @State private var dragStartRatio: Double?

  var body: some View {
    GeometryReader { geometry in
      let isRow = split.direction == .row
      let totalLength = isRow ? geometry.size.width : geometry.size.height
      let availableLength = max(totalLength - splitDividerThickness, 1)
      let ratio = clampedSplitRatio(split.ratio, availableLength: availableLength)
      let firstLength = max(availableLength * ratio, 0)
      let secondLength = max(availableLength - firstLength, 0)

      Group {
        if isRow {
          HStack(spacing: 0) {
            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.first,
              activeGroupID: activeGroupID
            )
            .frame(width: firstLength)

            splitDivider(availableLength: availableLength)
              .frame(width: splitDividerThickness)

            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.second,
              activeGroupID: activeGroupID
            )
            .frame(width: secondLength)
          }
        } else {
          VStack(spacing: 0) {
            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.first,
              activeGroupID: activeGroupID
            )
            .frame(height: firstLength)

            splitDivider(availableLength: availableLength)
              .frame(height: splitDividerThickness)

            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.second,
              activeGroupID: activeGroupID
            )
            .frame(height: secondLength)
          }
        }
      }
    }
  }

  private func splitDivider(availableLength: CGFloat) -> some View {
    ZStack {
      Color.clear
      Rectangle()
        .fill(Color.white.opacity(0.08))
        .frame(
          width: split.direction == .row ? 1 : nil,
          height: split.direction == .column ? 1 : nil
        )
    }
    .contentShape(Rectangle())
    .gesture(
      DragGesture(minimumDistance: 0)
        .onChanged { value in
          if dragStartRatio == nil {
            dragStartRatio = clampedSplitRatio(split.ratio, availableLength: availableLength)
          }

          guard let dragStartRatio else {
            return
          }

          let delta = split.direction == .row ? value.translation.width : value.translation.height
          let nextRatio = (CGFloat(dragStartRatio) * availableLength + delta) / availableLength
          model.setSplitRatio(
            split.id,
            ratio: clampedSplitRatio(Double(nextRatio), availableLength: availableLength),
            workspaceID: workspaceID
          )
        }
        .onEnded { _ in
          dragStartRatio = nil
        }
    )
  }
}

private func clampedSplitRatio(_ ratio: Double, availableLength: CGFloat) -> Double {
  guard availableLength > 0 else {
    return 0.5
  }

  let rawMinimumRatio = Double(minimumGroupLength / availableLength)
  if rawMinimumRatio >= 0.5 {
    return 0.5
  }

  let minimumRatio = max(rawMinimumRatio, 0.15)
  let maximumRatio = 1 - minimumRatio
  return min(max(ratio, minimumRatio), maximumRatio)
}

private struct GroupControlButton: View {
  let systemImage: String
  let helpText: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(primaryTextColor)
        .frame(width: 28, height: 28)
        .background(
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(highlightColor)
        )
    }
    .buttonStyle(.plain)
    .help(helpText)
  }
}

private struct WorkspaceGroupView: View {
  @ObservedObject var model: AppModel
  let workspaceID: String
  let group: CanvasGroup
  let surfaces: [CanvasSurface]
  let isActive: Bool

  @State private var showsPopover = false
  @State private var draggedSurfaceID: String?
  @State private var hoveredSurfaceID: String?

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 10) {
        HStack(spacing: 12) {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
              ForEach(surfaces) { surface in
                surfaceTab(surface)
              }
            }
          }

          if !surfaces.isEmpty {
            Button {
              model.createTerminalTab(workspaceID: workspaceID, groupID: group.id)
            } label: {
              Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(primaryTextColor)
                .frame(width: 28, height: 28)
                .background(
                  Circle()
                    .fill(highlightColor)
                )
            }
            .buttonStyle(.plain)
            .help("Create terminal")

            GroupControlButton(
              systemImage: "rectangle.split.2x1",
              helpText: "Split Right"
            ) {
              model.splitGroup(group.id, direction: .row, workspaceID: workspaceID)
            }

            GroupControlButton(
              systemImage: "rectangle.split.1x2",
              helpText: "Split Down"
            ) {
              model.splitGroup(group.id, direction: .column, workspaceID: workspaceID)
            }
          }

          Spacer()

          if model.terminalLoadingWorkspaceIDs.contains(workspaceID) {
            ProgressView()
              .controlSize(.small)
              .tint(primaryTextColor)
          }

          Button("Popover Probe") {
            showsPopover.toggle()
          }
          .buttonStyle(.borderedProminent)
          .popover(isPresented: $showsPopover, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 10) {
              Text("Popover Layer Check")
                .font(.system(size: 16, weight: .semibold))
              Text("If this renders over the Ghostty surface, the native Swift/AppKit layering problem is gone.")
                .font(.system(size: 12, weight: .medium, design: .monospaced))
                .fixedSize(horizontal: false, vertical: true)
              Text(Date.now.formatted(date: .abbreviated, time: .standard))
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .foregroundStyle(mutedColor)
            }
            .padding(16)
            .frame(width: 320)
          }
        }

        if let runtimeError = model.selectedTerminalEnvelope?.runtime.launchError {
          Text(runtimeError)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(Color.red.opacity(0.92))
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
      .padding(.horizontal, 18)
      .padding(.vertical, 14)
      .background(chromeBackground)

      Divider()

      if let surface = activeSurface {
        surface.content.body(isFocused: isActive)
      } else {
        Text("Group is empty")
          .foregroundStyle(mutedColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .background(
      RoundedRectangle(cornerRadius: 18, style: .continuous)
        .strokeBorder(isActive ? Color.orange.opacity(0.75) : Color.white.opacity(0.06))
    )
    .contentShape(Rectangle())
    .onTapGesture {
      model.selectGroup(group.id, workspaceID: workspaceID)
    }
  }

  private var activeSurface: CanvasSurface? {
    if let activeSurfaceID = group.activeSurfaceID {
      return surfaces.first(where: { $0.id == activeSurfaceID }) ?? surfaces.first
    }

    return surfaces.first
  }

  @ViewBuilder
  private func surfaceTab(_ surface: CanvasSurface) -> some View {
    let isSelected = surface.id == group.activeSurfaceID
    let tab = surface.tabPresentation

    let tabView = HStack(spacing: 8) {
      Button {
        model.selectSurface(surface.id, workspaceID: workspaceID, groupID: group.id)
      } label: {
        VStack(alignment: .leading, spacing: 2) {
          Text(tab.title)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(primaryTextColor)
          if let subtitle = tab.subtitle {
            Text(subtitle)
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .foregroundStyle(mutedColor)
          }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
      }
      .buttonStyle(.plain)

      if surface.isClosable {
        Button {
          model.closeSurface(surface.id, workspaceID: workspaceID)
        } label: {
          Image(systemName: "xmark")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(mutedColor)
            .frame(width: 14, height: 14)
        }
        .buttonStyle(.plain)
        .help("Close tab")
      }
    }
    .padding(.trailing, surface.isClosable ? 8 : 0)
    .background(
      Capsule(style: .continuous)
        .fill(isSelected ? highlightColor : chromeBackground.opacity(0.55))
    )
    .overlay(
      Capsule(style: .continuous)
        .strokeBorder(
          hoveredSurfaceID == surface.id && draggedSurfaceID != surface.id ?
            Color.orange.opacity(0.95) :
            (isSelected ? mutedColor.opacity(0.35) : Color.white.opacity(0.05)),
          lineWidth: hoveredSurfaceID == surface.id && draggedSurfaceID != surface.id ? 2 : 1
        )
    )
    .scaleEffect(
      hoveredSurfaceID == surface.id && draggedSurfaceID != surface.id ? 1.02 : 1
    )

    if surfaces.count > 1 {
      tabView
        .contentShape(Capsule(style: .continuous))
        .onDrag {
          draggedSurfaceID = surface.id
          return NSItemProvider(object: surface.id as NSString)
        }
        .onDrop(
          of: [surfaceTabDragType],
          isTargeted: hoverBinding(for: surface.id)
        ) { providers in
          handleSurfaceTabDrop(providers: providers, onto: surface.id)
        }
        .help("Drag to reorder tabs")
    } else {
      tabView
    }
  }

  private func hoverBinding(for surfaceID: String) -> Binding<Bool> {
    Binding(
      get: {
        hoveredSurfaceID == surfaceID
      },
      set: { isTargeted in
        if isTargeted {
          hoveredSurfaceID = surfaceID
        } else if hoveredSurfaceID == surfaceID {
          hoveredSurfaceID = nil
        }
      }
    )
  }

  private func handleSurfaceTabDrop(
    providers: [NSItemProvider],
    onto targetSurfaceID: String
  ) -> Bool {
    guard let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(surfaceTabDragType.identifier)
    }) else {
      hoveredSurfaceID = nil
      draggedSurfaceID = nil
      return false
    }

    provider.loadObject(ofClass: NSString.self) { object, _ in
      guard let sourceSurfaceID = object as? String else {
        Task { @MainActor in
          hoveredSurfaceID = nil
          draggedSurfaceID = nil
        }
        return
      }

      Task { @MainActor in
        model.reorderSurface(
          surfaceID: sourceSurfaceID,
          onto: targetSurfaceID,
          workspaceID: workspaceID,
          groupID: group.id
        )
        hoveredSurfaceID = nil
        draggedSurfaceID = nil
      }
    }

    return true
  }
}

private struct WorkspaceInspectorView: View {
  @ObservedObject var model: AppModel
  let workspace: BridgeWorkspaceSummary

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        inspectorSection(title: "Workspace") {
          inspectorRow(label: "ID", value: workspace.id)
          inspectorRow(label: "Host", value: workspace.host)
          inspectorRow(label: "Status", value: workspace.status)
          inspectorRow(label: "Ref", value: workspace.ref ?? "n/a")
          inspectorRow(label: "Path", value: workspace.path ?? "n/a")
        }

        if let scope = model.selectedTerminalEnvelope?.workspace {
          inspectorSection(title: "Scope") {
            inspectorRow(label: "Binding", value: scope.binding)
            inspectorRow(label: "Repo", value: scope.repoName ?? "n/a")
            inspectorRow(label: "CWD", value: scope.cwd ?? "n/a")
            inspectorRow(label: "Resolution", value: scope.resolutionNote ?? scope.resolutionError ?? "n/a")
          }
        }

        if let runtime = model.selectedTerminalEnvelope?.runtime {
          inspectorSection(title: "Terminal Runtime") {
            inspectorRow(label: "Backend", value: runtime.backendLabel)
            inspectorRow(label: "Persistent", value: runtime.persistent ? "yes" : "no")
            inspectorRow(label: "Runtime ID", value: runtime.runtimeID ?? "n/a")
            inspectorRow(label: "Launch Error", value: runtime.launchError ?? "none")
          }
        }

        if let activity = model.selectedWorkspaceActivity {
          inspectorSection(title: "Activity") {
            inspectorRow(label: "Busy", value: activity.busy ? "yes" : "no")
            inspectorRow(label: "Last Active", value: activity.activityAt.map { "\($0)" } ?? "n/a")
          }
        }

        if let terminals = model.selectedTerminalEnvelope?.terminals, !terminals.isEmpty {
          inspectorSection(title: "Terminals") {
            inspectorRow(label: "Count", value: "\(terminals.count)")

            ForEach(terminals) { terminal in
              inspectorRow(
                label: terminal.id,
                value: "\(terminal.title) • \(terminal.kind)\(terminal.busy ? " • busy" : "")"
              )
            }
          }
        }

        inspectorSection(title: "Architecture") {
          inspectorRow(label: "Sidebar", value: "repos + workspaces")
          inspectorRow(label: "Route", value: "center canvas + right inspector")
          inspectorRow(label: "Canvas", value: "canvas > group > surface")
          inspectorRow(label: "Layout", value: "tiled split groups")
          inspectorRow(label: "Terminal", value: "native Ghostty NSView")
          inspectorRow(label: "Tabs", value: "group chrome over bridge-owned terminal surfaces")
        }
      }
      .padding(20)
    }
  }

  private func inspectorSection<Content: View>(
    title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(title)
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(primaryTextColor)
      content()
    }
    .padding(16)
    .background(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(highlightColor)
    )
  }

  private func inspectorRow(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(label.uppercased())
        .font(.system(size: 10, weight: .bold, design: .monospaced))
        .foregroundStyle(mutedColor)
      Text(value)
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .foregroundStyle(primaryTextColor)
        .textSelection(.enabled)
        .fixedSize(horizontal: false, vertical: true)
    }
  }
}
