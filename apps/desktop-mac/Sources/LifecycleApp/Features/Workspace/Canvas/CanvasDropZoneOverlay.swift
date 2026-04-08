import SwiftUI
import LifecyclePresentation
import UniformTypeIdentifiers

/// Overlay that shows drop zones (left/right/top/bottom/center) on a group
/// when a tab drag is in progress. Each zone highlights on hover and triggers
/// `model.dropSurface` on drop.
struct CanvasDropZoneOverlay: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let groupID: String

  @State private var activeEdge: CanvasDropEdge?

  private let edgeZoneRatio: CGFloat = 0.3

  var body: some View {
    GeometryReader { geometry in
      let w = geometry.size.width
      let h = geometry.size.height
      let edgeW = w * edgeZoneRatio
      let edgeH = h * edgeZoneRatio

      ZStack {
        // Left
        dropZone(edge: .left)
          .frame(width: edgeW, height: h)
          .position(x: edgeW / 2, y: h / 2)

        // Right
        dropZone(edge: .right)
          .frame(width: edgeW, height: h)
          .position(x: w - edgeW / 2, y: h / 2)

        // Top
        dropZone(edge: .top)
          .frame(width: w - edgeW * 2, height: edgeH)
          .position(x: w / 2, y: edgeH / 2)

        // Bottom
        dropZone(edge: .bottom)
          .frame(width: w - edgeW * 2, height: edgeH)
          .position(x: w / 2, y: h - edgeH / 2)

        // Center
        dropZone(edge: .center)
          .frame(width: w - edgeW * 2, height: h - edgeH * 2)
          .position(x: w / 2, y: h / 2)
      }

      // Visual highlight overlay
      if let activeEdge {
        edgeHighlight(edge: activeEdge, size: geometry.size)
          .allowsHitTesting(false)
      }
    }
  }

  private func dropZone(edge: CanvasDropEdge) -> some View {
    Color.clear
      .contentShape(Rectangle())
      .onDrop(
        of: [UTType.plainText],
        isTargeted: edgeTargetBinding(for: edge)
      ) { providers in
        handleDrop(providers: providers, edge: edge)
      }
  }

  @ViewBuilder
  private func edgeHighlight(edge: CanvasDropEdge, size: CGSize) -> some View {
    let color = theme.accentColor.opacity(0.15)
    let borderColor = theme.accentColor.opacity(0.5)

    switch edge {
    case .left:
      HStack(spacing: 0) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(color)
          .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(borderColor, lineWidth: 2))
          .padding(4)
          .frame(width: size.width / 2)
        Spacer()
      }
    case .right:
      HStack(spacing: 0) {
        Spacer()
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(color)
          .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(borderColor, lineWidth: 2))
          .padding(4)
          .frame(width: size.width / 2)
      }
    case .top:
      VStack(spacing: 0) {
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(color)
          .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(borderColor, lineWidth: 2))
          .padding(4)
          .frame(height: size.height / 2)
        Spacer()
      }
    case .bottom:
      VStack(spacing: 0) {
        Spacer()
        RoundedRectangle(cornerRadius: 6, style: .continuous)
          .fill(color)
          .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(borderColor, lineWidth: 2))
          .padding(4)
          .frame(height: size.height / 2)
      }
    case .center:
      RoundedRectangle(cornerRadius: 6, style: .continuous)
        .fill(color)
        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(borderColor, lineWidth: 2))
        .padding(4)
    }
  }

  private func edgeTargetBinding(for edge: CanvasDropEdge) -> Binding<Bool> {
    Binding(
      get: { activeEdge == edge },
      set: { targeted in
        if targeted {
          activeEdge = edge
        } else if activeEdge == edge {
          activeEdge = nil
        }
      }
    )
  }

  private func handleDrop(providers: [NSItemProvider], edge: CanvasDropEdge) -> Bool {
    guard let provider = providers.first(where: {
      $0.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
    }) else {
      activeEdge = nil
      return false
    }

    provider.loadObject(ofClass: NSString.self) { object, _ in
      guard let surfaceID = object as? String else {
        Task { @MainActor in
          activeEdge = nil
          model.draggingSurfaceID = nil
        }
        return
      }

      Task { @MainActor in
        model.dropSurface(
          surfaceID: surfaceID,
          onGroupID: groupID,
          edge: edge,
          workspaceID: workspaceID
        )
        activeEdge = nil
        model.draggingSurfaceID = nil
      }
    }

    return true
  }
}
