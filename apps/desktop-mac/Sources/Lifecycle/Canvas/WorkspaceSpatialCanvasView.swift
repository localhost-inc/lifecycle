import AppKit
import SwiftUI
import LifecyclePresentation

private let canvasSpatialMinimumScale: CGFloat = 0.45
private let canvasSpatialMaximumScale: CGFloat = 1.6
private let canvasSpatialGridSpacing: CGFloat = 28
private let canvasSpatialViewportPadding: CGFloat = 120
private let canvasSpatialDragStripHeight: CGFloat = 40
private let canvasSpatialResizeHandleSize: CGFloat = 24
private let canvasSpatialMinimumDragStripHitHeight: CGFloat = 48
private let canvasSpatialMinimumResizeHandleHitSize: CGFloat = 36
private let canvasSpatialSurfaceChromeGap: CGFloat = 8
private let canvasSpatialScrollZoomSensitivity: CGFloat = 0.0075
private let canvasSpatialStepZoomMultiplier: CGFloat = 1.12

private enum CanvasSpatialResizeCorner {
  case topLeading
  case topTrailing
  case bottomLeading
  case bottomTrailing
}

private enum CanvasSpatialResizeCursorDirection {
  case leadingDiagonal
  case trailingDiagonal
}

enum CanvasSpatialGrabCursorMode: Equatable {
  case none
  case open
  case closed
}

struct CanvasSpatialViewportState {
  var scale: CGFloat
  var translation: CGSize

  static let identity = CanvasSpatialViewportState(
    scale: 1,
    translation: .zero
  )

  func scaling(to nextScale: CGFloat, around anchor: CGPoint) -> CanvasSpatialViewportState {
    guard scale > 0 else {
      return CanvasSpatialViewportState(scale: nextScale, translation: translation)
    }

    let worldAnchor = CGPoint(
      x: (anchor.x - translation.width) / scale,
      y: (anchor.y - translation.height) / scale
    )

    return CanvasSpatialViewportState(
      scale: nextScale,
      translation: CGSize(
        width: anchor.x - (worldAnchor.x * nextScale),
        height: anchor.y - (worldAnchor.y * nextScale)
      )
    )
  }
}

private struct CanvasSpatialGroupItem: Identifiable {
  let id: String
  let group: CanvasGroup
  let surfaces: [CanvasSurface]
  let frame: CanvasSpatialFrame
  let isActive: Bool

  var activeSurface: CanvasSurface? {
    if let activeSurfaceID = group.activeSurfaceID {
      return surfaces.first(where: { $0.id == activeSurfaceID }) ?? surfaces.first
    }

    return surfaces.first
  }
}

@MainActor
private let canvasSpatialLeadingDiagonalResizeCursor = canvasSpatialMakeResizeCursor(
  systemName: "arrow.up.left.and.arrow.down.right"
)
@MainActor
private let canvasSpatialTrailingDiagonalResizeCursor = canvasSpatialMakeResizeCursor(
  systemName: "arrow.up.right.and.arrow.down.left"
)

@MainActor
private func canvasSpatialResizeCursor(for corner: CanvasSpatialResizeCorner) -> NSCursor {
  switch canvasSpatialResizeCursorDirection(for: corner) {
  case .leadingDiagonal:
    return canvasSpatialLeadingDiagonalResizeCursor
  case .trailingDiagonal:
    return canvasSpatialTrailingDiagonalResizeCursor
  }
}

private func canvasSpatialResizeCursorDirection(for corner: CanvasSpatialResizeCorner) -> CanvasSpatialResizeCursorDirection {
  switch corner {
  case .topLeading, .bottomTrailing:
    return .leadingDiagonal
  case .topTrailing, .bottomLeading:
    return .trailingDiagonal
  }
}

@MainActor
private func canvasSpatialMakeResizeCursor(systemName: String) -> NSCursor {
  let cursorSize = NSSize(width: 18, height: 18)
  let image = NSImage(size: cursorSize)

  image.lockFocus()
  defer {
    image.unlockFocus()
  }

  let symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 13, weight: .bold)
  let symbolImage =
    NSImage(systemSymbolName: systemName, accessibilityDescription: nil)?
    .withSymbolConfiguration(symbolConfiguration)

  if let symbolImage {
    symbolImage.draw(
      in: CGRect(origin: .zero, size: cursorSize),
      from: .zero,
      operation: .sourceOver,
      fraction: 1
    )
  }

  return NSCursor(
    image: image,
    hotSpot: CGPoint(x: cursorSize.width * 0.5, y: cursorSize.height * 0.5)
  )
}

private func clampedCanvasSpatialScale(_ scale: CGFloat) -> CGFloat {
  min(max(scale, canvasSpatialMinimumScale), canvasSpatialMaximumScale)
}

func canvasSpatialViewportZooming(
  _ viewport: CanvasSpatialViewportState,
  by multiplier: CGFloat,
  around anchor: CGPoint
) -> CanvasSpatialViewportState {
  let nextScale = clampedCanvasSpatialScale(viewport.scale * multiplier)
  return viewport.scaling(to: nextScale, around: anchor)
}

func canvasSpatialViewportPanning(
  _ viewport: CanvasSpatialViewportState,
  by delta: CGSize
) -> CanvasSpatialViewportState {
  CanvasSpatialViewportState(
    scale: viewport.scale,
    translation: CGSize(
      width: viewport.translation.width + delta.width,
      height: viewport.translation.height + delta.height
    )
  )
}

func canvasSpatialDragStripHitHeight(forScale scale: CGFloat) -> CGFloat {
  max(canvasSpatialDragStripHeight * scale, canvasSpatialMinimumDragStripHitHeight)
}

func canvasSpatialSurfaceChromeReservedHeight(forScale scale: CGFloat, hasSurface: Bool) -> CGFloat {
  guard hasSurface else {
    return 0
  }

  return canvasSpatialDragStripHitHeight(forScale: scale) + canvasSpatialSurfaceChromeGap
}

func canvasSpatialResizeHandleHitSize(forScale scale: CGFloat) -> CGFloat {
  max(canvasSpatialResizeHandleSize * scale, canvasSpatialMinimumResizeHandleHitSize)
}

func canvasSpatialSurfaceChromeVisible(isHovering: Bool, isActive: Bool) -> Bool {
  isHovering || isActive
}

func canvasSpatialGrabCursorMode(isHovering: Bool, isActive: Bool) -> CanvasSpatialGrabCursorMode {
  if isActive {
    return .closed
  }

  if isHovering {
    return .open
  }

  return .none
}

func canvasSpatialDraftOffset(
  from persistedFrame: CanvasSpatialFrame,
  to displayFrame: CanvasSpatialFrame,
  scale: CGFloat
) -> CGSize {
  CGSize(
    width: (displayFrame.x - persistedFrame.x) * scale,
    height: (displayFrame.y - persistedFrame.y) * scale
  )
}

func canvasSpatialShouldHandleScrollAsZoom(modifiers: NSEvent.ModifierFlags) -> Bool {
  modifiers.contains(.command)
}

func canvasSpatialZoomMultiplier(forScrollDelta delta: CGFloat) -> CGFloat {
  exp(delta * canvasSpatialScrollZoomSensitivity)
}

private func canvasSpatialNormalizedScrollZoomDelta(for event: NSEvent) -> CGFloat {
  let rawDelta = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.scrollingDeltaY * 10
  return event.isDirectionInvertedFromDevice ? -rawDelta : rawDelta
}

private func canvasSpatialNormalizedScrollPanDelta(for event: NSEvent) -> CGSize {
  let scale: CGFloat = event.hasPreciseScrollingDeltas ? 1 : 10
  return CGSize(
    width: -(event.scrollingDeltaX * scale),
    height: -(event.scrollingDeltaY * scale)
  )
}

private func canvasSpatialBounds(for frames: [CanvasSpatialFrame]) -> CGRect? {
  guard let first = frames.first else {
    return nil
  }

  return frames.dropFirst().reduce(
    CGRect(x: first.x, y: first.y, width: first.width, height: first.height)
  ) { partialResult, frame in
    partialResult.union(
      CGRect(x: frame.x, y: frame.y, width: frame.width, height: frame.height)
    )
  }
}

private func initialCanvasSpatialViewport(
  for layout: CanvasSpatialLayout,
  in availableSize: CGSize
) -> CanvasSpatialViewportState {
  guard let bounds = canvasSpatialBounds(for: Array(layout.framesByGroupID.values)),
        availableSize.width > 0,
        availableSize.height > 0
  else {
    return .identity
  }

  let fitWidth = max(availableSize.width - (canvasSpatialViewportPadding * 2), 320)
  let fitHeight = max(availableSize.height - (canvasSpatialViewportPadding * 2), 240)
  let fitScale = min(fitWidth / bounds.width, fitHeight / bounds.height)
  let scale = clampedCanvasSpatialScale(min(fitScale, 1))

  return CanvasSpatialViewportState(
    scale: scale,
    translation: CGSize(
      width: (availableSize.width * 0.5) - (bounds.midX * scale),
      height: (availableSize.height * 0.5) - (bounds.midY * scale)
    )
  )
}

private func centeredCanvasSpatialViewport(
  from viewport: CanvasSpatialViewportState,
  on frame: CanvasSpatialFrame,
  in availableSize: CGSize
) -> CanvasSpatialViewportState {
  CanvasSpatialViewportState(
    scale: viewport.scale,
    translation: CGSize(
      width: (availableSize.width * 0.5) - (CGFloat(frame.x + (frame.width * 0.5)) * viewport.scale),
      height: (availableSize.height * 0.5) - (CGFloat(frame.y + (frame.height * 0.5)) * viewport.scale)
    )
  )
}

private func normalizedCanvasSpatialRemainder(_ value: CGFloat, step: CGFloat) -> CGFloat {
  guard step > 0 else {
    return 0
  }

  let remainder = value.truncatingRemainder(dividingBy: step)
  return remainder >= 0 ? remainder : remainder + step
}

struct WorkspaceSpatialCanvasView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let canvasState: CanvasState
  let isActiveWorkspace: Bool
  let dimmingSettings: WorkspacePaneDimmingSettings

  @State private var viewport = CanvasSpatialViewportState.identity
  @State private var panStartTranslation: CGSize?
  @State private var isPanning = false
  @GestureState private var isPanGestureActive = false

  private var spatialGroups: [CanvasSpatialGroupItem] {
    canvasState.spatialLayout.framesByGroupID.compactMap { groupID, frame in
      guard let group = canvasState.groupsByID[groupID] else {
        return nil
      }

      return CanvasSpatialGroupItem(
        id: groupID,
        group: group,
        surfaces: canvasState.orderedSurfaces(in: group),
        frame: frame,
        isActive: canvasState.activeGroupID == groupID
      )
    }
    .sorted { left, right in
      if left.frame.zIndex == right.frame.zIndex {
        return left.id < right.id
      }

      return left.frame.zIndex < right.frame.zIndex
    }
  }

  private var selectedGroup: CanvasSpatialGroupItem? {
    spatialGroups.first(where: { $0.id == canvasState.activeGroupID }) ?? spatialGroups.last
  }

  private var canCreateTerminals: Bool {
    guard let runtime = model.terminalEnvelope(for: workspaceID)?.runtime else {
      return false
    }

    return runtime.launchError == nil && runtime.supportsCreate
  }

  private func groupScreenFrame(for item: CanvasSpatialGroupItem) -> CGRect {
    let surfaceChromeReservedHeight = canvasSpatialSurfaceChromeReservedHeight(
      forScale: viewport.scale,
      hasSurface: item.activeSurface != nil
    )

    return CGRect(
      x: item.frame.x * viewport.scale + viewport.translation.width,
      y: item.frame.y * viewport.scale + viewport.translation.height - surfaceChromeReservedHeight,
      width: item.frame.width * viewport.scale,
      height: item.frame.height * viewport.scale + surfaceChromeReservedHeight
    )
  }

  private func groupSurfaceScreenFrame(for item: CanvasSpatialGroupItem) -> CGRect {
    CGRect(
      x: item.frame.x * viewport.scale + viewport.translation.width,
      y: item.frame.y * viewport.scale + viewport.translation.height,
      width: item.frame.width * viewport.scale,
      height: item.frame.height * viewport.scale
    )
  }

  var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .topLeading) {
        CanvasSpatialGridBackground(viewport: viewport)
          .contentShape(Rectangle())
          .gesture(backgroundPanGesture)
          .modifier(CanvasSpatialGrabCursorModifier(isActive: isPanning || isPanGestureActive))

        ForEach(spatialGroups) { item in
          let surfaceChromeReservedHeight = canvasSpatialSurfaceChromeReservedHeight(
            forScale: viewport.scale,
            hasSurface: item.activeSurface != nil
          )

          CanvasSpatialGroupWindow(
            model: model,
            workspaceID: workspaceID,
            item: item,
            scale: viewport.scale,
            dimmingSettings: dimmingSettings
          )
          .frame(
            width: item.frame.width * viewport.scale,
            height: item.frame.height * viewport.scale + surfaceChromeReservedHeight,
            alignment: .topLeading
          )
          .offset(
            x: item.frame.x * viewport.scale + viewport.translation.width,
            y: item.frame.y * viewport.scale + viewport.translation.height - surfaceChromeReservedHeight
          )
          .zIndex(item.frame.zIndex + (item.isActive ? 1_000 : 0))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(theme.shellBackground)
      .contentShape(Rectangle())
      .clipped()
      .overlay {
        if isActiveWorkspace {
          CanvasSpatialInputMonitor(
            excludedRects: spatialGroups.map(groupScreenFrame),
            terminalScrollRects: spatialGroups.compactMap { group in
              group.activeSurface?.surfaceKind == .terminal ? groupSurfaceScreenFrame(for: group) : nil
            },
            onScrollPan: { delta in
              viewport = canvasSpatialViewportPanning(viewport, by: delta)
            },
            onScrollZoom: { location, delta in
              viewport = canvasSpatialViewportZooming(
                viewport,
                by: canvasSpatialZoomMultiplier(forScrollDelta: delta),
                around: location
              )
            },
            onMagnify: { location, magnification in
              viewport = canvasSpatialViewportZooming(
                viewport,
                by: 1 + magnification,
                around: location
              )
            }
          )
          .allowsHitTesting(false)
        }
      }
      .overlay(alignment: .topLeading) {
        CanvasSpatialCreateBar(
          canCreateTerminals: canCreateTerminals,
          createTerminal: {
            model.createTerminalTab(workspaceID: workspaceID)
          }
        )
        .padding(16)
      }
      .overlay(alignment: .topTrailing) {
        if let selectedGroup, let selectedSurface = selectedGroup.activeSurface {
          CanvasSpatialActionsBar(
            group: selectedGroup.group,
            surfaces: selectedGroup.surfaces,
            activeSurface: selectedSurface,
            selectSurface: { surfaceID in
              model.selectSurface(surfaceID, workspaceID: workspaceID, groupID: selectedGroup.id)
            },
            centerSelection: {
              viewport = centeredCanvasSpatialViewport(
                from: viewport,
                on: selectedGroup.frame,
                in: geometry.size
              )
            }
          )
          .padding(16)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        CanvasSpatialHUD(
          scale: viewport.scale,
          zoomOut: {
            viewport = canvasSpatialViewportZooming(
              viewport,
              by: 1 / canvasSpatialStepZoomMultiplier,
              around: CGPoint(x: geometry.size.width * 0.5, y: geometry.size.height * 0.5)
            )
          },
          zoomIn: {
            viewport = canvasSpatialViewportZooming(
              viewport,
              by: canvasSpatialStepZoomMultiplier,
              around: CGPoint(x: geometry.size.width * 0.5, y: geometry.size.height * 0.5)
            )
          },
          fitAll: {
            viewport = initialCanvasSpatialViewport(
              for: canvasState.spatialLayout,
              in: geometry.size
            )
          }
        )
        .padding(16)
      }
      .onAppear {
        viewport = initialCanvasSpatialViewport(for: canvasState.spatialLayout, in: geometry.size)
      }
    }
  }

  private var backgroundPanGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .updating($isPanGestureActive) { _, state, _ in
        state = true
      }
      .onChanged { value in
        if panStartTranslation == nil {
          panStartTranslation = viewport.translation
          isPanning = true
        }

        guard let panStartTranslation else {
          return
        }

        viewport.translation = CGSize(
          width: panStartTranslation.width + value.translation.width,
          height: panStartTranslation.height + value.translation.height
        )
      }
      .onEnded { _ in
        panStartTranslation = nil
        isPanning = false
      }
  }
}

private struct CanvasSpatialFloatingBar<Content: View>: View {
  @Environment(\.appTheme) private var theme
  let content: Content

  init(@ViewBuilder content: () -> Content) {
    self.content = content()
  }

  var body: some View {
    HStack(spacing: 8) {
      content
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 9)
    .background(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .fill(theme.surfaceBackground.opacity(0.98))
    )
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .strokeBorder(theme.borderColor.opacity(0.9), lineWidth: 1)
    )
    .shadow(
      color: theme.cardShadowColor.opacity(0.32),
      radius: 18,
      x: 0,
      y: 8
    )
  }
}

private struct CanvasSpatialCreateBar: View {
  @Environment(\.appTheme) private var theme

  let canCreateTerminals: Bool
  let createTerminal: () -> Void

  var body: some View {
    CanvasSpatialFloatingBar {
      Button(action: createTerminal) {
        HStack(spacing: 8) {
          Image(systemName: "plus")
            .font(.lc(size: 11, weight: .semibold))
          Text("New Terminal")
            .font(.lc(size: 12, weight: .semibold))
        }
        .foregroundStyle(canCreateTerminals ? theme.primaryTextColor : theme.mutedColor)
      }
      .buttonStyle(.plain)
      .disabled(!canCreateTerminals)
      .lcPointerCursor()
    }
  }
}

private struct CanvasSpatialActionsBar: View {
  @Environment(\.appTheme) private var theme

  let group: CanvasGroup
  let surfaces: [CanvasSurface]
  let activeSurface: CanvasSurface
  let selectSurface: (String) -> Void
  let centerSelection: () -> Void

  var body: some View {
    CanvasSpatialFloatingBar {
      if surfaces.count > 1 {
        Menu {
          ForEach(surfaces) { surface in
            Button {
              selectSurface(surface.id)
            } label: {
              HStack(spacing: 8) {
                AppIconView(
                  name: surface.tabPresentation.icon,
                  size: 13,
                  color: theme.primaryTextColor,
                  weight: .medium
                )
                Text(surface.tabPresentation.label)
              }
            }
          }
        } label: {
          HStack(spacing: 8) {
            AppIconView(
              name: activeSurface.tabPresentation.icon,
              size: 13,
              color: theme.primaryTextColor,
              weight: .medium
            )
            Text(activeSurface.tabPresentation.label)
              .font(.lc(size: 12, weight: .semibold))
              .lineLimit(1)
            Text("\(surfaces.count)")
              .font(.lc(size: 10, weight: .bold, design: .monospaced))
              .foregroundStyle(theme.mutedColor)
              .padding(.horizontal, 6)
              .padding(.vertical, 3)
              .background(theme.shellBackground.opacity(0.7), in: Capsule())
          }
          .foregroundStyle(theme.primaryTextColor)
          .frame(maxWidth: 220, alignment: .leading)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .lcPointerCursor()
      } else {
        HStack(spacing: 8) {
          AppIconView(
            name: activeSurface.tabPresentation.icon,
            size: 13,
            color: theme.primaryTextColor,
            weight: .medium
          )
          Text(activeSurface.tabPresentation.label)
            .font(.lc(size: 12, weight: .semibold))
            .lineLimit(1)
        }
        .foregroundStyle(theme.primaryTextColor)
        .frame(maxWidth: 220, alignment: .leading)
      }

      Rectangle()
        .fill(theme.borderColor.opacity(0.8))
        .frame(width: 1, height: 18)

      CanvasSpatialToolbarButton(systemImage: "scope", helpText: "Center selection", action: centerSelection)
    }
  }
}

private struct CanvasSpatialToolbarButton: View {
  @Environment(\.appTheme) private var theme

  let systemImage: String
  let helpText: String
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.lc(size: 11, weight: .semibold))
        .foregroundStyle(theme.primaryTextColor)
        .frame(width: 28, height: 28)
        .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .help(helpText)
  }
}

private struct CanvasSpatialHUD: View {
  @Environment(\.appTheme) private var theme

  let scale: CGFloat
  let zoomOut: () -> Void
  let zoomIn: () -> Void
  let fitAll: () -> Void

  var body: some View {
    CanvasSpatialFloatingBar {
      Button(action: zoomOut) {
        Image(systemName: "minus")
          .font(.lc(size: 10, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
          .frame(width: 18, height: 18)
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .help("Zoom out")

      Text("\(Int((scale * 100).rounded()))%")
        .font(.lc(size: 11, weight: .semibold, design: .monospaced))
        .foregroundStyle(theme.primaryTextColor.opacity(0.88))

      Button(action: zoomIn) {
        Image(systemName: "plus")
          .font(.lc(size: 10, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
          .frame(width: 18, height: 18)
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
      .help("Zoom in")

      Rectangle()
        .fill(theme.borderColor.opacity(0.8))
        .frame(width: 1, height: 18)

      Button(action: fitAll) {
        Text("Fit")
          .font(.lc(size: 11, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
          .padding(.horizontal, 8)
          .padding(.vertical, 4)
      }
      .buttonStyle(.plain)
      .lcPointerCursor()
    }
  }
}

private struct CanvasSpatialInputMonitor: NSViewRepresentable {
  let excludedRects: [CGRect]
  let terminalScrollRects: [CGRect]
  let onScrollPan: (CGSize) -> Void
  let onScrollZoom: (CGPoint, CGFloat) -> Void
  let onMagnify: (CGPoint, CGFloat) -> Void

  func makeNSView(context: Context) -> CanvasSpatialInputNSView {
    let view = CanvasSpatialInputNSView()
    view.excludedRects = excludedRects
    view.terminalScrollRects = terminalScrollRects
    view.onScrollPan = onScrollPan
    view.onScrollZoom = onScrollZoom
    view.onMagnify = onMagnify
    return view
  }

  func updateNSView(_ nsView: CanvasSpatialInputNSView, context: Context) {
    nsView.excludedRects = excludedRects
    nsView.terminalScrollRects = terminalScrollRects
    nsView.onScrollPan = onScrollPan
    nsView.onScrollZoom = onScrollZoom
    nsView.onMagnify = onMagnify
  }

  static func dismantleNSView(_ nsView: CanvasSpatialInputNSView, coordinator: ()) {
    nsView.invalidate()
  }
}

private final class CanvasSpatialInputNSView: NSView {
  var excludedRects: [CGRect] = []
  var terminalScrollRects: [CGRect] = []
  var onScrollPan: (CGSize) -> Void = { _ in }
  var onScrollZoom: (CGPoint, CGFloat) -> Void = { _, _ in }
  var onMagnify: (CGPoint, CGFloat) -> Void = { _, _ in }

  private var localMonitor: Any?

  override var isFlipped: Bool { true }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    installLocalMonitorIfNeeded()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  deinit {
    invalidate()
  }

  override func hitTest(_ point: NSPoint) -> NSView? {
    nil
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()
    if window == nil {
      invalidate()
    } else {
      installLocalMonitorIfNeeded()
    }
  }

  func invalidate() {
    if let localMonitor {
      NSEvent.removeMonitor(localMonitor)
      self.localMonitor = nil
    }
  }

  private func installLocalMonitorIfNeeded() {
    guard localMonitor == nil else {
      return
    }

    localMonitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .magnify]) { [weak self] event in
      self?.handle(event) ?? event
    }
  }

  private func handle(_ event: NSEvent) -> NSEvent? {
    guard window != nil else {
      return event
    }

    let location = convert(event.locationInWindow, from: nil)
    guard bounds.contains(location) else {
      return event
    }

    switch event.type {
    case .scrollWheel:
      if terminalScrollRects.contains(where: { $0.contains(location) }) {
        return event
      }

      if canvasSpatialShouldHandleScrollAsZoom(modifiers: event.modifierFlags) {
        let delta = canvasSpatialNormalizedScrollZoomDelta(for: event)
        guard delta != 0 else {
          return nil
        }

        onScrollZoom(location, delta)
        return nil
      }

      if excludedRects.contains(where: { $0.contains(location) }) {
        return event
      }

      let delta = canvasSpatialNormalizedScrollPanDelta(for: event)
      guard delta != .zero else {
        return nil
      }

      onScrollPan(delta)
      return nil
    case .magnify:
      guard event.magnification != 0 else {
        return nil
      }

      onMagnify(location, event.magnification)
      return nil
    default:
      return event
    }
  }
}

private struct CanvasSpatialGridBackground: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.colorScheme) private var colorScheme
  let viewport: CanvasSpatialViewportState

  var body: some View {
    Canvas { context, size in
      let minorSpacing = max(canvasSpatialGridSpacing * viewport.scale, 12)
      let majorSpacing = minorSpacing * 4
      let minorOriginX = normalizedCanvasSpatialRemainder(viewport.translation.width, step: minorSpacing)
      let minorOriginY = normalizedCanvasSpatialRemainder(viewport.translation.height, step: minorSpacing)
      let majorOriginX = normalizedCanvasSpatialRemainder(viewport.translation.width, step: majorSpacing)
      let majorOriginY = normalizedCanvasSpatialRemainder(viewport.translation.height, step: majorSpacing)

      let minorDotDiameter =
        if colorScheme == .light {
          min(max(1.35, viewport.scale * 1.45), 2.2)
        } else {
          min(max(1.1, viewport.scale * 1.28), 1.9)
        }
      let majorDotDiameter = minorDotDiameter + (colorScheme == .light ? 1.2 : 0.9)
      let minorColor = theme.mutedColor.opacity(colorScheme == .light ? 0.18 : 0.22)
      let majorColor = theme.mutedColor.opacity(colorScheme == .light ? 0.32 : 0.38)

      for x in stride(from: majorOriginX, through: size.width + majorSpacing, by: majorSpacing) {
        for y in stride(from: majorOriginY, through: size.height + majorSpacing, by: majorSpacing) {
          context.fill(
            Path(
              ellipseIn: CGRect(
                x: x - (majorDotDiameter * 0.5),
                y: y - (majorDotDiameter * 0.5),
                width: majorDotDiameter,
                height: majorDotDiameter
              )
            ),
            with: .color(majorColor)
          )
        }
      }

      for x in stride(from: minorOriginX, through: size.width + minorSpacing, by: minorSpacing) {
        for y in stride(from: minorOriginY, through: size.height + minorSpacing, by: minorSpacing) {
          let isMajorX = abs((x - majorOriginX).truncatingRemainder(dividingBy: majorSpacing)) < 0.5
          let isMajorY = abs((y - majorOriginY).truncatingRemainder(dividingBy: majorSpacing)) < 0.5
          if isMajorX && isMajorY {
            continue
          }

          context.fill(
            Path(
              ellipseIn: CGRect(
                x: x - (minorDotDiameter * 0.5),
                y: y - (minorDotDiameter * 0.5),
                width: minorDotDiameter,
                height: minorDotDiameter
              )
            ),
            with: .color(minorColor)
          )
        }
      }
    }
    .background(
      theme.shellBackground.overlay(
        theme.surfaceBackground.opacity(colorScheme == .light ? 0.18 : 0.08)
      )
    )
  }
}

private struct CanvasSpatialGroupWindow: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let item: CanvasSpatialGroupItem
  let scale: CGFloat
  let dimmingSettings: WorkspacePaneDimmingSettings

  @State private var draftFrame: CanvasSpatialFrame?
  @State private var interactionStartFrame: CanvasSpatialFrame?
  @State private var isDraggingGroup = false
  @State private var isHoveringWindow = false
  @GestureState private var isDragGestureActive = false

  private var displayFrame: CanvasSpatialFrame {
    draftFrame ?? item.frame
  }

  private var activeSurface: CanvasSurface? {
    item.activeSurface
  }

  private var usesNativeTerminalPresentationScale: Bool {
    activeSurface?.surfaceKind == .terminal
  }

  private var isInteracting: Bool {
    interactionStartFrame != nil
  }

  private var liveDraftOffset: CGSize {
    canvasSpatialDraftOffset(
      from: item.frame,
      to: displayFrame,
      scale: scale
    )
  }

  private var displayCornerRadius: CGFloat {
    usesNativeTerminalPresentationScale ? max(10, 20 * scale) : 20
  }

  private var surfaceChromeReservedHeight: CGFloat {
    canvasSpatialSurfaceChromeReservedHeight(
      forScale: scale,
      hasSurface: activeSurface != nil
    )
  }

  var body: some View {
    VStack(spacing: 0) {
      surfaceChrome

      ZStack(alignment: .topLeading) {
        surfaceCard

        resizeHandles
      }
      .frame(
        width: displayFrame.width * scale,
        height: displayFrame.height * scale,
        alignment: .topLeading
      )
      .overlay {
        RoundedRectangle(cornerRadius: displayCornerRadius, style: .continuous)
          .strokeBorder(
            item.isActive ? theme.accentColor.opacity(0.55) : theme.borderColor.opacity(0.82),
            lineWidth: item.isActive ? 2 : 1
          )
      }
      .shadow(
        color: theme.cardShadowColor.opacity(isInteracting ? 0 : item.isActive ? 0.95 : 0.58),
        radius: isInteracting ? 0 : item.isActive ? 28 : 18,
        x: 0,
        y: isInteracting ? 0 : item.isActive ? 12 : 8
      )
    }
    .frame(
      width: displayFrame.width * scale,
      height: displayFrame.height * scale + surfaceChromeReservedHeight,
      alignment: .topLeading
    )
    .offset(x: liveDraftOffset.width, y: liveDraftOffset.height)
    .opacity(
      workspacePaneOpacity(
        isActive: item.isActive,
        isHovering: isHoveringWindow,
        settings: dimmingSettings
      )
    )
    .animation(.easeOut(duration: 0.14), value: item.isActive)
    .animation(.easeOut(duration: 0.14), value: isHoveringWindow)
    .onHover { hovering in
      isHoveringWindow = hovering
    }
  }

  @ViewBuilder
  private var surfaceCard: some View {
    if usesNativeTerminalPresentationScale {
      CanvasSpatialSurfaceCard(
        model: model,
        workspaceID: workspaceID,
        item: item,
        presentationScale: scale
      )
      .frame(
        width: displayFrame.width * scale,
        height: displayFrame.height * scale
      )
      .clipShape(RoundedRectangle(cornerRadius: displayCornerRadius, style: .continuous))
    } else {
      CanvasSpatialSurfaceCard(
        model: model,
        workspaceID: workspaceID,
        item: item,
        presentationScale: 1
      )
      .frame(width: displayFrame.width, height: displayFrame.height)
      .clipShape(RoundedRectangle(cornerRadius: displayCornerRadius, style: .continuous))
      .scaleEffect(scale, anchor: .topLeading)
    }
  }

  @ViewBuilder
  private var resizeHandles: some View {
    GeometryReader { geometry in
      Group {
        resizeHandle(.topLeading, in: geometry.size)
        resizeHandle(.topTrailing, in: geometry.size)
        resizeHandle(.bottomLeading, in: geometry.size)
        resizeHandle(.bottomTrailing, in: geometry.size)
      }
    }
  }

  @ViewBuilder
  private var surfaceChrome: some View {
    if let activeSurface {
      HStack(spacing: 12) {
        HStack(spacing: 12) {
          CanvasSpatialSurfaceTitle(
            activeSurface: activeSurface,
            stackCount: item.surfaces.count
          )

          Spacer(minLength: 0)
        }
        .frame(
          maxWidth: .infinity,
          minHeight: canvasSpatialDragStripHitHeight(forScale: scale),
          alignment: .leading
        )
        .contentShape(Rectangle())
        .gesture(moveGesture)
        .modifier(CanvasSpatialGrabCursorModifier(isActive: isDraggingGroup || isDragGestureActive))

        if activeSurface.isClosable {
          CanvasSpatialSurfaceCloseButton(
            isVisible: canvasSpatialSurfaceChromeVisible(
              isHovering: isHoveringWindow,
              isActive: item.isActive
            ),
            action: {
              model.closeSurface(activeSurface.id, workspaceID: workspaceID)
            }
          )
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, canvasSpatialSurfaceChromeGap)
      .frame(height: surfaceChromeReservedHeight, alignment: .bottomLeading)
      .zIndex(2)
    }
  }

  private var moveGesture: some Gesture {
    DragGesture(minimumDistance: 0)
      .updating($isDragGestureActive) { _, state, _ in
        state = true
      }
      .onChanged { value in
        if !isDraggingGroup {
          isDraggingGroup = true
        }

        let start = beginSpatialInteractionIfNeeded()
        draftFrame = CanvasSpatialFrame(
          x: start.x + Double(value.translation.width / scale),
          y: start.y + Double(value.translation.height / scale),
          width: start.width,
          height: start.height,
          zIndex: start.zIndex
        )
      }
      .onEnded { _ in
        isDraggingGroup = false
        endSpatialInteraction()
      }
  }

  @ViewBuilder
  private func resizeHandle(_ corner: CanvasSpatialResizeCorner, in size: CGSize) -> some View {
    let handleSize = canvasSpatialResizeHandleHitSize(forScale: scale)
    let x =
      switch corner {
      case .topLeading, .bottomLeading:
        0.0
      case .topTrailing, .bottomTrailing:
        max(size.width - handleSize, 0)
      }
    let y =
      switch corner {
      case .topLeading, .topTrailing:
        0.0
      case .bottomLeading, .bottomTrailing:
        max(size.height - handleSize, 0)
      }

    Rectangle()
      .fill(.clear)
      .frame(width: handleSize, height: handleSize)
      .contentShape(Rectangle())
      .offset(x: x, y: y)
      .gesture(resizeGesture(for: corner))
      .modifier(CanvasSpatialResizeCursorModifier(corner: corner))
  }

  private func resizeGesture(for corner: CanvasSpatialResizeCorner) -> some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { value in
        let start = beginSpatialInteractionIfNeeded()
        let deltaX = Double(value.translation.width / scale)
        let deltaY = Double(value.translation.height / scale)
        let proposedWidth: Double
        let proposedHeight: Double
        let nextX: Double
        let nextY: Double

        switch corner {
        case .topLeading:
          proposedWidth = start.width - deltaX
          proposedHeight = start.height - deltaY
          let width = max(proposedWidth, minimumCanvasSpatialGroupWidth)
          let height = max(proposedHeight, minimumCanvasSpatialGroupHeight)
          nextX = start.x + (start.width - width)
          nextY = start.y + (start.height - height)
          draftFrame = CanvasSpatialFrame(
            x: nextX,
            y: nextY,
            width: width,
            height: height,
            zIndex: start.zIndex
          )
        case .topTrailing:
          proposedWidth = start.width + deltaX
          proposedHeight = start.height - deltaY
          let width = max(proposedWidth, minimumCanvasSpatialGroupWidth)
          let height = max(proposedHeight, minimumCanvasSpatialGroupHeight)
          nextX = start.x
          nextY = start.y + (start.height - height)
          draftFrame = CanvasSpatialFrame(
            x: nextX,
            y: nextY,
            width: width,
            height: height,
            zIndex: start.zIndex
          )
        case .bottomLeading:
          proposedWidth = start.width - deltaX
          proposedHeight = start.height + deltaY
          let width = max(proposedWidth, minimumCanvasSpatialGroupWidth)
          let height = max(proposedHeight, minimumCanvasSpatialGroupHeight)
          nextX = start.x + (start.width - width)
          nextY = start.y
          draftFrame = CanvasSpatialFrame(
            x: nextX,
            y: nextY,
            width: width,
            height: height,
            zIndex: start.zIndex
          )
        case .bottomTrailing:
          proposedWidth = start.width + deltaX
          proposedHeight = start.height + deltaY
          draftFrame = CanvasSpatialFrame(
            x: start.x,
            y: start.y,
            width: max(proposedWidth, minimumCanvasSpatialGroupWidth),
            height: max(proposedHeight, minimumCanvasSpatialGroupHeight),
            zIndex: start.zIndex
          )
        }
      }
      .onEnded { _ in
        endSpatialInteraction()
      }
  }

  private func beginSpatialInteractionIfNeeded() -> CanvasSpatialFrame {
    if interactionStartFrame == nil {
      interactionStartFrame = item.frame
      draftFrame = item.frame
      if let activeSurface = item.activeSurface {
        model.selectSurface(activeSurface.id, workspaceID: workspaceID, groupID: item.id)
      } else {
        model.selectGroup(item.id, workspaceID: workspaceID)
      }
    }

    return interactionStartFrame ?? item.frame
  }

  private func endSpatialInteraction() {
    defer {
      interactionStartFrame = nil
      draftFrame = nil
      isDraggingGroup = false
    }

    guard let draftFrame else {
      return
    }

    model.setSpatialGroupFrame(item.id, frame: draftFrame, workspaceID: workspaceID)
  }
}

private struct CanvasSpatialGrabCursorModifier: ViewModifier {
  let isActive: Bool

  @State private var isHovering = false
  @State private var mode: CanvasSpatialGrabCursorMode = .none

  private func cursor(for mode: CanvasSpatialGrabCursorMode) -> NSCursor {
    switch mode {
    case .none:
      return .arrow
    case .open:
      return .closedHand
    case .closed:
      return .openHand
    }
  }

  func body(content: Content) -> some View {
    content
      .onHover { hovering in
        isHovering = hovering
        apply(mode: canvasSpatialGrabCursorMode(isHovering: hovering, isActive: isActive))
      }
      .onChange(of: isActive) { _ in
        apply(mode: canvasSpatialGrabCursorMode(isHovering: isHovering, isActive: isActive))
      }
      .onDisappear {
        if mode != .none {
          mode = .none
          NSCursor.pop()
        }
      }
  }

  private func apply(mode nextMode: CanvasSpatialGrabCursorMode) {
    guard nextMode != mode else {
      return
    }

    if mode != .none {
      NSCursor.pop()
    }

    mode = nextMode

    if nextMode != .none {
      cursor(for: nextMode).push()
    }
  }
}

private struct CanvasSpatialResizeCursorModifier: ViewModifier {
  let corner: CanvasSpatialResizeCorner
  @State private var isHovering = false

  func body(content: Content) -> some View {
    content
      .onHover { hovering in
        if hovering, !isHovering {
          isHovering = true
          canvasSpatialResizeCursor(for: corner).push()
        } else if !hovering, isHovering {
          isHovering = false
          NSCursor.pop()
        }
      }
      .onDisappear {
        if isHovering {
          isHovering = false
          NSCursor.pop()
        }
      }
  }
}

private struct CanvasSpatialSurfaceCard: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel
  let workspaceID: String
  let item: CanvasSpatialGroupItem
  let presentationScale: CGFloat

  private var renderedSurfaceStates: [WorkspaceGroupRenderedSurface] {
    renderedSurfaces(
      for: item.surfaces,
      activeSurfaceID: item.activeSurface?.id,
      groupIsActive: item.isActive,
      presentationScale: presentationScale
    )
  }

  var body: some View {
    ZStack(alignment: .topLeading) {
      Rectangle()
        .fill(theme.surfaceBackground)

      if !renderedSurfaceStates.isEmpty {
        ForEach(renderedSurfaceStates) { renderedSurface in
          renderedSurface.surface.content.body(renderState: renderedSurface.renderState)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .allowsHitTesting(renderedSurface.renderState.isVisible)
            .opacity(renderedSurface.renderState.isVisible ? 1 : 0)
            .zIndex(renderedSurface.renderState.isVisible ? 1 : 0)
        }
      } else {
        Text("Terminal unavailable")
          .font(.lc(size: 12, weight: .medium))
          .foregroundStyle(theme.mutedColor)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .onTapGesture {
      if let activeSurface = item.activeSurface {
        model.selectSurface(activeSurface.id, workspaceID: workspaceID, groupID: item.id)
      } else {
        model.selectGroup(item.id, workspaceID: workspaceID)
      }
    }
  }
}

private struct CanvasSpatialSurfaceCloseButton: View {
  @Environment(\.appTheme) private var theme

  let isVisible: Bool
  let action: () -> Void

  @State private var isHovering = false

  var body: some View {
    Button(action: action) {
      HStack(spacing: 5) {
        Image(systemName: "xmark")
          .font(.lc(size: 9, weight: .semibold))
        Text("Close")
          .font(.lc(size: 11, weight: .medium))
      }
      .foregroundStyle(
        isHovering
          ? theme.primaryTextColor
          : theme.mutedColor.opacity(isVisible ? 0.94 : 0.7)
      )
      .padding(.horizontal, 6)
      .padding(.vertical, 4)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .opacity(isVisible ? 1 : 0)
    .offset(y: isVisible ? 0 : -2)
    .allowsHitTesting(isVisible)
    .onHover { hovering in
      isHovering = hovering
    }
    .animation(.easeOut(duration: 0.14), value: isVisible)
    .animation(.easeOut(duration: 0.14), value: isHovering)
    .lcPointerCursor()
    .help("Close surface")
  }
}

private struct CanvasSpatialSurfaceTitle: View {
  @Environment(\.appTheme) private var theme

  let activeSurface: CanvasSurface
  let stackCount: Int

  var body: some View {
    HStack(spacing: 8) {
      AppIconView(
        name: activeSurface.tabPresentation.icon,
        size: 12,
        color: theme.primaryTextColor,
        weight: .medium
      )

      Text(activeSurface.tabPresentation.label)
        .font(.lc(size: 11, weight: .semibold))
        .lineLimit(1)

      if stackCount > 1 {
        Text("\(stackCount)")
          .font(.lc(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(theme.mutedColor.opacity(0.9))
      }
    }
    .foregroundStyle(itemColor)
  }

  private var itemColor: Color {
    theme.primaryTextColor.opacity(0.92)
  }
}
