import AppKit
import SwiftUI
import LifecyclePresentation
import UniformTypeIdentifiers

private let canvasDropZoneInset: CGFloat = 8
private let canvasDropZonePreferredEdgeFraction: CGFloat = 0.24
private let canvasDropZoneMinimumCenterLength: CGFloat = 120
private let canvasDropZoneMinimumEdgeLength: CGFloat = 56
private let canvasDropZoneMaximumEdgeLength: CGFloat = 148
private let canvasDropZoneCornerRadius: CGFloat = 10
private let canvasDropZonePasteboardTypes: [NSPasteboard.PasteboardType] = [
  .string,
  NSPasteboard.PasteboardType(UTType.plainText.identifier),
]

struct CanvasDropZoneDescriptor: Equatable, Identifiable {
  let edge: CanvasDropEdge
  let frame: CGRect

  var id: CanvasDropEdge { edge }
}

func canvasDropEdge(
  at location: CGPoint,
  in descriptors: [CanvasDropZoneDescriptor]
) -> CanvasDropEdge? {
  descriptors.first(where: { $0.frame.contains(location) })?.edge
}

func enabledCanvasDropEdges(
  groupsByID: [String: CanvasGroup],
  targetGroupID: String,
  draggingSurfaceID: String?
) -> Set<CanvasDropEdge> {
  guard let draggingSurfaceID,
        let targetGroup = groupsByID[targetGroupID]
  else {
    return []
  }

  let sourceGroupID = groupsByID.first { _, group in
    group.surfaceOrder.contains(draggingSurfaceID)
  }?.key

  guard let sourceGroupID else {
    return []
  }

  var enabledEdges: Set<CanvasDropEdge> = [.left, .right, .top, .bottom, .center]

  if sourceGroupID == targetGroupID {
    enabledEdges.remove(.center)

    if targetGroup.surfaceOrder.count <= 1 {
      enabledEdges.subtract([.left, .right, .top, .bottom])
    }
  }

  return enabledEdges
}

func canvasDropZoneEdgeLength(
  totalLength: CGFloat,
  minimumCenterLength: CGFloat = canvasDropZoneMinimumCenterLength,
  preferredEdgeFraction: CGFloat = canvasDropZonePreferredEdgeFraction,
  minimumEdgeLength: CGFloat = canvasDropZoneMinimumEdgeLength,
  maximumEdgeLength: CGFloat = canvasDropZoneMaximumEdgeLength
) -> CGFloat {
  guard totalLength > 0 else {
    return 0
  }

  let allowedMaximum = max((totalLength - minimumCenterLength) / 2, 0)
  let clampedMaximum = min(maximumEdgeLength, allowedMaximum)
  guard clampedMaximum > 0 else {
    return 0
  }

  return min(max(totalLength * preferredEdgeFraction, minimumEdgeLength), clampedMaximum)
}

func canvasDropZoneDescriptors(
  size: CGSize,
  enabledEdges: Set<CanvasDropEdge>,
  inset: CGFloat = canvasDropZoneInset
) -> [CanvasDropZoneDescriptor] {
  guard size.width > 0, size.height > 0, !enabledEdges.isEmpty else {
    return []
  }

  let usableWidth = max(size.width - inset * 2, 0)
  let usableHeight = max(size.height - inset * 2, 0)
  let edgeWidth = canvasDropZoneEdgeLength(totalLength: usableWidth)
  let edgeHeight = canvasDropZoneEdgeLength(totalLength: usableHeight)
  let centerWidth = max(usableWidth - edgeWidth * 2, 0)
  let centerHeight = max(usableHeight - edgeHeight * 2, 0)

  let framesByEdge: [(CanvasDropEdge, CGRect)] = [
    (
      .left,
      CGRect(x: inset, y: inset, width: edgeWidth, height: usableHeight)
    ),
    (
      .right,
      CGRect(x: inset + usableWidth - edgeWidth, y: inset, width: edgeWidth, height: usableHeight)
    ),
    (
      .top,
      CGRect(x: inset + edgeWidth, y: inset, width: centerWidth, height: edgeHeight)
    ),
    (
      .bottom,
      CGRect(x: inset + edgeWidth, y: inset + usableHeight - edgeHeight, width: centerWidth, height: edgeHeight)
    ),
    (
      .center,
      CGRect(x: inset + edgeWidth, y: inset + edgeHeight, width: centerWidth, height: centerHeight)
    ),
  ]

  return framesByEdge.compactMap { edge, frame in
    guard enabledEdges.contains(edge), frame.width > 0, frame.height > 0 else {
      return nil
    }

    return CanvasDropZoneDescriptor(edge: edge, frame: frame)
  }
}

/// Overlay that shows drop zones on a hovered group during a tab drag.
/// The drag session is tracked by an AppKit destination view so hover is driven
/// by the actual pointer location inside the group instead of SwiftUI guessing.
struct CanvasDropZoneOverlay: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let groupID: String

  @State private var activeEdge: CanvasDropEdge?
  @State private var isHoveringGroup = false

  var body: some View {
    GeometryReader { geometry in
      let descriptors = canvasDropZoneDescriptors(
        size: geometry.size,
        enabledEdges: enabledEdges
      )
      let showDropZones = isHoveringGroup || activeEdge != nil

      ZStack {
        if showDropZones {
          ForEach(descriptors) { descriptor in
            dropZoneChrome(
              descriptor: descriptor,
              isActive: descriptor.edge == activeEdge
            )
          }
        }

        CanvasDropZoneTrackingView(
          descriptors: descriptors,
          isHoveringGroup: $isHoveringGroup,
          activeEdge: $activeEdge
        ) { surfaceID, edge in
          handleDrop(surfaceID: surfaceID, edge: edge)
        }
      }
    }
  }

  private var enabledEdges: Set<CanvasDropEdge> {
    guard let canvasState = model.canvasState(for: workspaceID) else {
      return []
    }

    return enabledCanvasDropEdges(
      groupsByID: canvasState.groupsByID,
      targetGroupID: groupID,
      draggingSurfaceID: model.draggingSurfaceID
    )
  }

  private func dropZoneChrome(
    descriptor: CanvasDropZoneDescriptor,
    isActive: Bool
  ) -> some View {
    let fillColor =
      isActive
        ? theme.dropTargetColor.opacity(0.18)
        : theme.dropTargetColor.opacity(0.06)
    let borderColor =
      isActive
        ? theme.dropTargetColor.opacity(0.85)
        : theme.dropTargetColor.opacity(0.24)
    let lineWidth: CGFloat = isActive ? 2 : 1

    return RoundedRectangle(cornerRadius: canvasDropZoneCornerRadius, style: .continuous)
      .fill(fillColor)
      .overlay(
        RoundedRectangle(cornerRadius: canvasDropZoneCornerRadius, style: .continuous)
          .strokeBorder(borderColor, lineWidth: lineWidth)
      )
      .frame(width: descriptor.frame.width, height: descriptor.frame.height)
      .position(x: descriptor.frame.midX, y: descriptor.frame.midY)
  }

  private func handleDrop(surfaceID: String, edge: CanvasDropEdge) -> Bool {
    model.dropSurface(
      surfaceID: surfaceID,
      onGroupID: groupID,
      edge: edge,
      workspaceID: workspaceID
    )
    activeEdge = nil
    isHoveringGroup = false
    model.draggingSurfaceID = nil
    return true
  }
}

private struct CanvasDropZoneTrackingView: NSViewRepresentable {
  let descriptors: [CanvasDropZoneDescriptor]
  @Binding var isHoveringGroup: Bool
  @Binding var activeEdge: CanvasDropEdge?
  let onDrop: (String, CanvasDropEdge) -> Bool

  func makeNSView(context: Context) -> CanvasDropZoneTrackingNSView {
    let view = CanvasDropZoneTrackingNSView()
    view.descriptors = descriptors
    view.updateDropState = updateDropState
    view.handleDrop = onDrop
    return view
  }

  func updateNSView(_ nsView: CanvasDropZoneTrackingNSView, context: Context) {
    nsView.descriptors = descriptors
    nsView.updateDropState = updateDropState
    nsView.handleDrop = onDrop
  }

  private func updateDropState(isHoveringGroup: Bool, activeEdge: CanvasDropEdge?) {
    self.isHoveringGroup = isHoveringGroup
    self.activeEdge = activeEdge
  }
}

private final class CanvasDropZoneTrackingNSView: NSView {
  var descriptors: [CanvasDropZoneDescriptor] = []
  var updateDropState: (Bool, CanvasDropEdge?) -> Void = { _, _ in }
  var handleDrop: (String, CanvasDropEdge) -> Bool = { _, _ in false }

  override var isFlipped: Bool { true }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    registerForDraggedTypes(canvasDropZonePasteboardTypes)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
    updatedDragOperation(for: sender)
  }

  override func draggingUpdated(_ sender: any NSDraggingInfo) -> NSDragOperation {
    updatedDragOperation(for: sender)
  }

  override func draggingExited(_ sender: (any NSDraggingInfo)?) {
    updateDropState(false, nil)
  }

  override func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
    defer {
      updateDropState(false, nil)
    }

    guard let surfaceID = draggedSurfaceID(from: sender.draggingPasteboard),
          let edge = resolvedEdge(for: sender)
    else {
      return false
    }

    return handleDrop(surfaceID, edge)
  }

  private func updatedDragOperation(for sender: any NSDraggingInfo) -> NSDragOperation {
    guard draggedSurfaceID(from: sender.draggingPasteboard) != nil else {
      updateDropState(false, nil)
      return []
    }

    let edge = resolvedEdge(for: sender)
    updateDropState(true, edge)
    return edge == nil ? [] : .move
  }

  private func resolvedEdge(for sender: any NSDraggingInfo) -> CanvasDropEdge? {
    let location = convert(sender.draggingLocation, from: nil)
    return canvasDropEdge(at: location, in: descriptors)
  }

  private func draggedSurfaceID(from pasteboard: NSPasteboard) -> String? {
    for type in canvasDropZonePasteboardTypes {
      if let surfaceID = pasteboard.string(forType: type), !surfaceID.isEmpty {
        return surfaceID
      }
    }

    return nil
  }
}
