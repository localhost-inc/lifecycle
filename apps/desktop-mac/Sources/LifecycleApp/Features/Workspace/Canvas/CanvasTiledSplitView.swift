import SwiftUI
import LifecyclePresentation

private let splitDividerThickness: CGFloat = 10
private let minimumGroupLength: CGFloat = 240

struct CanvasTiledSplitView: View {
  @Environment(\.appTheme) private var theme
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
        .fill(theme.borderColor)
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
