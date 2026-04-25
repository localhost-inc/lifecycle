import SwiftUI
import LifecyclePresentation
import UniformTypeIdentifiers

private let surfaceTabDragType = UTType.plainText

private struct SelectedTabFramePreferenceKey: PreferenceKey {
  static let defaultValue: CGRect? = nil

  static func reduce(value: inout CGRect?, nextValue: () -> CGRect?) {
    if let nextValue = nextValue() {
      value = nextValue
    }
  }
}

private struct GroupControlButton: View {
  @Environment(\.appTheme) private var theme
  let systemImage: String
  let helpText: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(theme.mutedColor)
        .frame(width: 28, height: 28)
        .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .help(helpText)
  }
}

struct WorkspaceGroupRenderedSurface: Identifiable {
  let id: String
  let renderState: SurfaceRenderState
  let surface: CanvasSurface
}

func workspacePaneOpacity(
  isActive: Bool,
  isHovering: Bool,
  settings: WorkspacePaneDimmingSettings
) -> CGFloat {
  guard settings.isEnabled else {
    return 1
  }

  return isActive || isHovering ? 1 : CGFloat(clampedInactivePaneOpacity(settings.inactiveOpacity))
}

func renderedSurfaces(
  for surfaces: [CanvasSurface],
  activeSurfaceID: String?,
  groupIsActive: Bool,
  presentationScale: CGFloat = 1
) -> [WorkspaceGroupRenderedSurface] {
  guard let selectedSurface =
    surfaces.first(where: { $0.id == activeSurfaceID }) ?? surfaces.first
  else {
    return []
  }

  return [
    WorkspaceGroupRenderedSurface(
      id: selectedSurface.id,
      renderState: SurfaceRenderState(
        isFocused: groupIsActive,
        isVisible: true,
        presentationScale: presentationScale
      ),
      surface: selectedSurface
    )
  ]
}

struct WorkspaceGroupView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let group: CanvasGroup
  let surfaces: [CanvasSurface]
  let isActive: Bool
  let dimmingSettings: WorkspacePaneDimmingSettings

  @State private var draggedSurfaceID: String?
  @State private var isHoveringPane = false
  @State private var hoveredSurfaceID: String?
  @State private var selectedTabFrame: CGRect?

  var body: some View {
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        HStack(spacing: 10) {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
              ForEach(surfaces) { surface in
                surfaceTab(surface)
              }

              if !surfaces.isEmpty {
                TerminalCreationMenuButton(style: .iconOnly) {
                  model.createTerminalTab(workspaceID: workspaceID, groupID: group.id)
                }
                .padding(.horizontal, 10)
              }
            }
          }
          .frame(height: theme.sizing.workspaceTabRailHeight)

          if !surfaces.isEmpty {
            Rectangle()
              .fill(theme.borderColor.opacity(0.85))
              .frame(width: 1, height: 18)
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

          Spacer(minLength: 0)
        }
        .padding(.leading, 0)
        .padding(.trailing, 8)
        .padding(.top, 0)
        .padding(.bottom, 0)
        .frame(height: theme.sizing.workspaceTabRailHeight)
        .background(theme.shellBackground)
        .coordinateSpace(name: "workspaceGroupRail")

        if let runtimeError = model.selectedTerminalEnvelope?.runtime.launchError {
          Text(runtimeError)
            .font(.lc(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.errorColor.opacity(0.92))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.bottom, 10)
            .padding(.top, 2)
            .background(theme.shellBackground)
        }
      }
      .overlay(alignment: .bottomLeading) {
        railDivider
      }
      .onPreferenceChange(SelectedTabFramePreferenceKey.self) { selectedTabFrame = $0 }

      if !renderedSurfaceStates.isEmpty {
        let isDragging = model.draggingSurfaceID != nil

        GeometryReader { geometry in
          ZStack {
            ForEach(renderedSurfaceStates) { renderedSurface in
              renderedSurface.surface.content.body(renderState: renderedSurface.renderState)
                .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
                .clipped()
                .allowsHitTesting(renderedSurface.renderState.isVisible && !isDragging)
                .opacity(renderedSurface.renderState.isVisible ? 1 : 0)
                .zIndex(renderedSurface.renderState.isVisible ? 1 : 0)
            }

            if isDragging {
              CanvasDropZoneOverlay(
                model: model,
                workspaceID: workspaceID,
                groupID: group.id
              )
              .zIndex(10)
            }
          }
          .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
          .clipped()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .clipped()
      } else {
        Text("Group is empty")
          .foregroundStyle(theme.mutedColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(
      Rectangle()
        .fill(theme.surfaceBackground)
    )
    .clipShape(Rectangle())
    .contentShape(Rectangle())
    .opacity(
      workspacePaneOpacity(
        isActive: isActive,
        isHovering: isHoveringPane,
        settings: dimmingSettings
      )
    )
    .animation(.easeOut(duration: 0.14), value: isActive)
    .animation(.easeOut(duration: 0.14), value: isHoveringPane)
    .onHover { hovering in
      isHoveringPane = hovering
    }
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

  private var renderedSurfaceStates: [WorkspaceGroupRenderedSurface] {
    renderedSurfaces(
      for: surfaces,
      activeSurfaceID: activeSurface?.id,
      groupIsActive: isActive
    )
  }

  @ViewBuilder
  private var railDivider: some View {
    GeometryReader { geometry in
      let totalWidth = geometry.size.width

      if let selectedTabFrame {
        let minX = max(0, min(selectedTabFrame.minX, totalWidth))
        let maxX = max(minX, min(selectedTabFrame.maxX, totalWidth))
        let leftWidth = minX
        let rightWidth = max(0, totalWidth - maxX)

        ZStack(alignment: .leading) {
          if leftWidth > 0 {
            Rectangle()
              .fill(theme.borderColor)
              .frame(width: leftWidth, height: 1)
          }

          if rightWidth > 0 {
            Rectangle()
              .fill(theme.borderColor)
              .frame(width: rightWidth, height: 1)
              .offset(x: maxX)
          }
        }
      } else {
        Rectangle()
          .fill(theme.borderColor)
          .frame(height: 1)
      }
    }
    .frame(height: 1)
    .allowsHitTesting(false)
  }

  @ViewBuilder
  private func surfaceTab(_ surface: CanvasSurface) -> some View {
    let isSelected = surface.id == group.activeSurfaceID
    let isDropTarget = hoveredSurfaceID == surface.id && draggedSurfaceID != surface.id
    let tab = surface.tabPresentation

    let tabView = WorkspaceRailTabView(
      label: tab.label,
      icon: tab.icon,
      isBusy: tab.isBusy,
      isSelected: isSelected,
      trailingContentInset: surface.isClosable ? 40 : 14
    ) {
      model.selectSurface(surface.id, workspaceID: workspaceID, groupID: group.id)
    } trailingAccessory: {
      if surface.isClosable {
        WorkspaceTabCloseButton(isSelected: isSelected) {
          model.closeSurface(surface.id, workspaceID: workspaceID)
        }
        .help("Close tab")
        .padding(.trailing, 8)
      }
    }
    .overlay {
      if isDropTarget {
        Rectangle()
          .stroke(theme.dropTargetColor.opacity(0.95), lineWidth: 2)
      }
    }
    .zIndex(isSelected ? 1 : 0)
    .background {
      GeometryReader { geometry in
        Color.clear.preference(
          key: SelectedTabFramePreferenceKey.self,
          value: isSelected ? geometry.frame(in: .named("workspaceGroupRail")) : nil
        )
      }
    }

    let draggableTab = tabView
      .contentShape(Rectangle())
      .onDrag {
        draggedSurfaceID = surface.id
        model.draggingSurfaceID = surface.id
        return NSItemProvider(object: surface.id as NSString)
      }

    if surfaces.count > 1 {
      draggableTab
        .onDrop(
          of: [surfaceTabDragType],
          isTargeted: hoverBinding(for: surface.id)
        ) { providers in
          handleSurfaceTabDrop(providers: providers, onto: surface.id)
        }
    } else {
      draggableTab
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
      model.draggingSurfaceID = nil
      return false
    }

    provider.loadObject(ofClass: NSString.self) { object, _ in
      guard let sourceSurfaceID = object as? String else {
        Task { @MainActor in
          hoveredSurfaceID = nil
          draggedSurfaceID = nil
          model.draggingSurfaceID = nil
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
        model.draggingSurfaceID = nil
      }
    }

    return true
  }
}

private struct WorkspaceTabCloseButton: View {
  @Environment(\.appTheme) private var theme

  let isSelected: Bool
  let action: () -> Void

  @State private var isHovering = false

  var body: some View {
    Button(action: action) {
      Image(systemName: "xmark")
        .font(.lc(size: 9, weight: .bold))
        .foregroundStyle(iconColor)
        .frame(width: 14, height: 14)
        .padding(5)
        .background(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(isHovering ? theme.mutedColor.opacity(0.10) : .clear)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .strokeBorder(isHovering ? theme.borderColor.opacity(0.55) : .clear, lineWidth: 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .onHover { hovering in
      isHovering = hovering
    }
  }

  private var iconColor: Color {
    if isHovering {
      return isSelected ? theme.primaryTextColor : theme.mutedColor
    }

    return isSelected ? theme.mutedColor : theme.mutedColor.opacity(0.78)
  }
}
