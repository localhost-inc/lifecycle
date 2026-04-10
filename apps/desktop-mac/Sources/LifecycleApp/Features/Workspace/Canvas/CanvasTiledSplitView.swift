import SwiftUI
import LifecyclePresentation

private let splitDividerHitThickness: CGFloat = 10
private let splitDividerVisualThickness: CGFloat = 1
private let minimumGroupLength: CGFloat = 240

struct CanvasTiledSplitLayoutMetrics: Equatable {
  let ratio: Double
  let firstLength: CGFloat
  let secondLength: CGFloat
  let dividerOffset: CGFloat
}

func canvasTiledSplitLayoutMetrics(
  ratio: Double,
  totalLength: CGFloat,
  dividerThickness: CGFloat = splitDividerHitThickness
) -> CanvasTiledSplitLayoutMetrics {
  let availableLength = max(totalLength, 1)
  let clampedRatio = clampedSplitRatio(ratio, availableLength: availableLength)
  let firstLength = max(availableLength * clampedRatio, 0)
  let secondLength = max(availableLength - firstLength, 0)
  let dividerOffset = canvasTiledSplitDividerOffset(
    totalLength: availableLength,
    firstLength: firstLength,
    dividerThickness: dividerThickness
  )

  return CanvasTiledSplitLayoutMetrics(
    ratio: clampedRatio,
    firstLength: firstLength,
    secondLength: secondLength,
    dividerOffset: dividerOffset
  )
}

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
      let layoutLength = max(totalLength, 1)
      let metrics = canvasTiledSplitLayoutMetrics(ratio: split.ratio, totalLength: layoutLength)

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
            .frame(width: metrics.firstLength)

            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.second,
              activeGroupID: activeGroupID
            )
            .frame(width: metrics.secondLength)
          }
          .overlay(alignment: .leading) {
            splitDivider(availableLength: layoutLength)
              .frame(width: splitDividerHitThickness)
              .offset(x: metrics.dividerOffset)
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
            .frame(height: metrics.firstLength)

            CanvasTiledLayoutNodeView(
              model: model,
              workspaceID: workspaceID,
              canvasState: canvasState,
              layoutNode: split.second,
              activeGroupID: activeGroupID
            )
            .frame(height: metrics.secondLength)
          }
          .overlay(alignment: .top) {
            splitDivider(availableLength: layoutLength)
              .frame(height: splitDividerHitThickness)
              .offset(y: metrics.dividerOffset)
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
          width: split.direction == .row ? splitDividerVisualThickness : nil,
          height: split.direction == .column ? splitDividerVisualThickness : nil
        )
    }
    .contentShape(Rectangle())
    .lcResizeCursor(horizontal: split.direction == .row)
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

func canvasTiledSplitDividerOffset(
  totalLength: CGFloat,
  firstLength: CGFloat,
  dividerThickness: CGFloat = splitDividerHitThickness
) -> CGFloat {
  let offset = firstLength - (dividerThickness / 2)
  return min(max(offset, 0), max(totalLength - dividerThickness, 0))
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
