import AppKit
import SwiftUI

enum LCSplitFixedPaneEdge {
  case leading
  case trailing
}

func lcFixedPaneWidthBounds(
  totalWidth: CGFloat,
  minimumFixedPaneWidth: CGFloat,
  maximumFixedPaneWidth: CGFloat,
  minimumFlexiblePaneWidth: CGFloat,
  dividerThickness: CGFloat
) -> ClosedRange<CGFloat> {
  let roundedTotalWidth = totalWidth.rounded()

  guard roundedTotalWidth.isFinite, roundedTotalWidth > 0 else {
    return minimumFixedPaneWidth ... maximumFixedPaneWidth
  }

  let absoluteUpperBound = max(roundedTotalWidth - dividerThickness, 0)
  let flexibleAwareUpperBound = max(
    roundedTotalWidth - dividerThickness - minimumFlexiblePaneWidth,
    minimumFixedPaneWidth
  )
  let upperBound = min(
    maximumFixedPaneWidth,
    absoluteUpperBound,
    flexibleAwareUpperBound
  )
  let lowerBound = min(minimumFixedPaneWidth, upperBound)
  return lowerBound ... upperBound
}

func lcClampedFixedPaneWidth(
  _ width: CGFloat,
  totalWidth: CGFloat,
  minimumFixedPaneWidth: CGFloat,
  maximumFixedPaneWidth: CGFloat,
  minimumFlexiblePaneWidth: CGFloat,
  dividerThickness: CGFloat
) -> CGFloat {
  let bounds = lcFixedPaneWidthBounds(
    totalWidth: totalWidth,
    minimumFixedPaneWidth: minimumFixedPaneWidth,
    maximumFixedPaneWidth: maximumFixedPaneWidth,
    minimumFlexiblePaneWidth: minimumFlexiblePaneWidth,
    dividerThickness: dividerThickness
  )
  return min(max(width.rounded(), bounds.lowerBound), bounds.upperBound)
}

func lcSplitDividerPosition(
  totalWidth: CGFloat,
  fixedPaneWidth: CGFloat,
  fixedPaneEdge: LCSplitFixedPaneEdge,
  dividerThickness: CGFloat
) -> CGFloat {
  let roundedTotalWidth = totalWidth.rounded()
  let roundedFixedPaneWidth = fixedPaneWidth.rounded()

  switch fixedPaneEdge {
  case .leading:
    return roundedFixedPaneWidth
  case .trailing:
    return max(roundedTotalWidth - dividerThickness - roundedFixedPaneWidth, 0)
  }
}

func lcFixedPaneWidth(
  totalWidth: CGFloat,
  dividerPosition: CGFloat,
  fixedPaneEdge: LCSplitFixedPaneEdge,
  dividerThickness: CGFloat
) -> CGFloat {
  let roundedTotalWidth = totalWidth.rounded()
  let roundedDividerPosition = dividerPosition.rounded()

  switch fixedPaneEdge {
  case .leading:
    return max(roundedDividerPosition, 0)
  case .trailing:
    return max(roundedTotalWidth - dividerThickness - roundedDividerPosition, 0)
  }
}

struct LCResizableSplitView<Leading: View, Trailing: View>: NSViewRepresentable {
  let fixedPaneWidth: CGFloat
  let fixedPaneEdge: LCSplitFixedPaneEdge
  let minimumFixedPaneWidth: CGFloat
  let maximumFixedPaneWidth: CGFloat
  let minimumFlexiblePaneWidth: CGFloat
  let dividerThickness: CGFloat
  let dividerHitThickness: CGFloat
  let onFixedPaneWidthChange: (CGFloat) -> Void
  let leading: Leading
  let trailing: Trailing

  init(
    fixedPaneWidth: CGFloat,
    fixedPaneEdge: LCSplitFixedPaneEdge,
    minimumFixedPaneWidth: CGFloat,
    maximumFixedPaneWidth: CGFloat,
    minimumFlexiblePaneWidth: CGFloat,
    dividerThickness: CGFloat = 6,
    dividerHitThickness: CGFloat = 8,
    onFixedPaneWidthChange: @escaping (CGFloat) -> Void,
    @ViewBuilder leading: () -> Leading,
    @ViewBuilder trailing: () -> Trailing
  ) {
    self.fixedPaneWidth = fixedPaneWidth
    self.fixedPaneEdge = fixedPaneEdge
    self.minimumFixedPaneWidth = minimumFixedPaneWidth
    self.maximumFixedPaneWidth = maximumFixedPaneWidth
    self.minimumFlexiblePaneWidth = minimumFlexiblePaneWidth
    self.dividerThickness = dividerThickness
    self.dividerHitThickness = dividerHitThickness
    self.onFixedPaneWidthChange = onFixedPaneWidthChange
    self.leading = leading()
    self.trailing = trailing()
  }

  func makeNSView(context: Context) -> LCResizableSplitContainerView<Leading, Trailing> {
    LCResizableSplitContainerView(
      leading: leading,
      trailing: trailing,
      configuration: context.coordinator.configuration(
        fixedPaneWidth: fixedPaneWidth,
        fixedPaneEdge: fixedPaneEdge,
        minimumFixedPaneWidth: minimumFixedPaneWidth,
        maximumFixedPaneWidth: maximumFixedPaneWidth,
        minimumFlexiblePaneWidth: minimumFlexiblePaneWidth,
        dividerThickness: dividerThickness,
        dividerHitThickness: dividerHitThickness
      ),
      onFixedPaneWidthChange: onFixedPaneWidthChange
    )
  }

  func updateNSView(_ nsView: LCResizableSplitContainerView<Leading, Trailing>, context: Context) {
    nsView.update(
      leading: leading,
      trailing: trailing,
      configuration: context.coordinator.configuration(
        fixedPaneWidth: fixedPaneWidth,
        fixedPaneEdge: fixedPaneEdge,
        minimumFixedPaneWidth: minimumFixedPaneWidth,
        maximumFixedPaneWidth: maximumFixedPaneWidth,
        minimumFlexiblePaneWidth: minimumFlexiblePaneWidth,
        dividerThickness: dividerThickness,
        dividerHitThickness: dividerHitThickness
      ),
      onFixedPaneWidthChange: onFixedPaneWidthChange
    )
  }

  func makeCoordinator() -> Coordinator {
    Coordinator()
  }

  final class Coordinator {
    func configuration(
      fixedPaneWidth: CGFloat,
      fixedPaneEdge: LCSplitFixedPaneEdge,
      minimumFixedPaneWidth: CGFloat,
      maximumFixedPaneWidth: CGFloat,
      minimumFlexiblePaneWidth: CGFloat,
      dividerThickness: CGFloat,
      dividerHitThickness: CGFloat
    ) -> LCResizableSplitContainerConfiguration {
      LCResizableSplitContainerConfiguration(
        fixedPaneWidth: fixedPaneWidth,
        fixedPaneEdge: fixedPaneEdge,
        minimumFixedPaneWidth: minimumFixedPaneWidth,
        maximumFixedPaneWidth: maximumFixedPaneWidth,
        minimumFlexiblePaneWidth: minimumFlexiblePaneWidth,
        dividerThickness: dividerThickness,
        dividerHitThickness: dividerHitThickness
      )
    }
  }
}

struct LCResizableSplitContainerConfiguration: Equatable {
  let fixedPaneWidth: CGFloat
  let fixedPaneEdge: LCSplitFixedPaneEdge
  let minimumFixedPaneWidth: CGFloat
  let maximumFixedPaneWidth: CGFloat
  let minimumFlexiblePaneWidth: CGFloat
  let dividerThickness: CGFloat
  let dividerHitThickness: CGFloat
}

private final class LCInvisibleDividerSplitView: NSSplitView {
  var customDividerThickness: CGFloat = 6
  var customDividerHitThickness: CGFloat = 8
  var onDividerDragEnded: (() -> Void)?
  private(set) var isDraggingDivider = false

  override var dividerThickness: CGFloat {
    customDividerThickness
  }

  override func drawDivider(in rect: NSRect) {}

  override func hitTest(_ point: NSPoint) -> NSView? {
    if dividerHitRect(forDividerAt: 0).contains(point) {
      return self
    }

    return super.hitTest(point)
  }

  override func resetCursorRects() {
    super.resetCursorRects()

    guard arrangedSubviews.count > 1 else {
      return
    }

    addCursorRect(dividerHitRect(forDividerAt: 0), cursor: .resizeLeftRight)
  }

  override func mouseDown(with event: NSEvent) {
    let beganOnDivider = isPointOnDivider(convert(event.locationInWindow, from: nil))
    if beganOnDivider {
      isDraggingDivider = true
    }

    super.mouseDown(with: event)

    if beganOnDivider {
      isDraggingDivider = false
      onDividerDragEnded?()
    }
  }

  private func isPointOnDivider(_ point: NSPoint) -> Bool {
    dividerHitRect(forDividerAt: 0).contains(point)
  }

  func dividerHitRect(forDividerAt dividerIndex: Int) -> NSRect {
    guard arrangedSubviews.count > 1 else {
      return .zero
    }

    let targetFrame = arrangedSubviews[dividerIndex].frame
    let drawnDividerRect =
      if isVertical {
        NSRect(x: targetFrame.maxX, y: 0, width: dividerThickness, height: bounds.height)
      } else {
        NSRect(x: 0, y: targetFrame.maxY, width: bounds.width, height: dividerThickness)
      }
    let expandedInset = max(customDividerHitThickness - dividerThickness, 0) / 2
    let hitRect =
      if isVertical {
        drawnDividerRect.insetBy(dx: -expandedInset, dy: 0)
      } else {
        drawnDividerRect.insetBy(dx: 0, dy: -expandedInset)
      }

    return bounds.intersection(hitRect)
  }
}

final class LCResizableSplitContainerView<Leading: View, Trailing: View>: NSView, NSSplitViewDelegate {
  private let splitView = LCInvisibleDividerSplitView()
  private let leadingHostingView: NSHostingView<Leading>
  private let trailingHostingView: NSHostingView<Trailing>

  private var configuration: LCResizableSplitContainerConfiguration
  private var onFixedPaneWidthChange: (CGFloat) -> Void
  private var isApplyingProgrammaticResize = false
  private var preferredFixedPaneWidth: CGFloat
  private var lastPublishedFixedPaneWidth: CGFloat?

  init(
    leading: Leading,
    trailing: Trailing,
    configuration: LCResizableSplitContainerConfiguration,
    onFixedPaneWidthChange: @escaping (CGFloat) -> Void
  ) {
    self.leadingHostingView = NSHostingView(rootView: leading)
    self.trailingHostingView = NSHostingView(rootView: trailing)
    self.configuration = configuration
    self.onFixedPaneWidthChange = onFixedPaneWidthChange
    self.preferredFixedPaneWidth = configuration.fixedPaneWidth
    self.lastPublishedFixedPaneWidth = configuration.fixedPaneWidth
    super.init(frame: .zero)
    commonInit()
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layout() {
    super.layout()

    guard !splitView.isDraggingDivider else {
      return
    }

    applyPreferredFixedPaneWidth()
  }

  func update(
    leading: Leading,
    trailing: Trailing,
    configuration: LCResizableSplitContainerConfiguration,
    onFixedPaneWidthChange: @escaping (CGFloat) -> Void
  ) {
    let previousConfiguration = self.configuration
    leadingHostingView.rootView = leading
    trailingHostingView.rootView = trailing
    self.onFixedPaneWidthChange = onFixedPaneWidthChange
    self.configuration = configuration
    splitView.customDividerThickness = configuration.dividerThickness
    splitView.customDividerHitThickness = max(
      configuration.dividerHitThickness,
      configuration.dividerThickness
    )
    applyHoldingPriorities()

    if configuration.fixedPaneWidth != previousConfiguration.fixedPaneWidth {
      preferredFixedPaneWidth = configuration.fixedPaneWidth
      lastPublishedFixedPaneWidth = configuration.fixedPaneWidth
    }

    guard !splitView.isDraggingDivider else {
      return
    }

    applyPreferredFixedPaneWidth()
  }

  private func commonInit() {
    wantsLayer = true

    splitView.translatesAutoresizingMaskIntoConstraints = false
    splitView.isVertical = true
    splitView.delegate = self
    splitView.dividerStyle = .thin
    splitView.customDividerThickness = configuration.dividerThickness
    splitView.customDividerHitThickness = max(
      configuration.dividerHitThickness,
      configuration.dividerThickness
    )
    splitView.onDividerDragEnded = { [weak self] in
      self?.commitCurrentFixedPaneWidth()
    }

    splitView.addArrangedSubview(leadingHostingView)
    splitView.addArrangedSubview(trailingHostingView)
    applyHoldingPriorities()

    addSubview(splitView)

    NSLayoutConstraint.activate([
      splitView.leadingAnchor.constraint(equalTo: leadingAnchor),
      splitView.trailingAnchor.constraint(equalTo: trailingAnchor),
      splitView.topAnchor.constraint(equalTo: topAnchor),
      splitView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])
  }

  private func applyPreferredFixedPaneWidth() {
    applyFixedPaneWidth(preferredFixedPaneWidth)
  }

  private func applyHoldingPriorities() {
    switch configuration.fixedPaneEdge {
    case .leading:
      splitView.setHoldingPriority(.defaultHigh, forSubviewAt: 0)
      splitView.setHoldingPriority(.defaultLow, forSubviewAt: 1)
    case .trailing:
      splitView.setHoldingPriority(.defaultLow, forSubviewAt: 0)
      splitView.setHoldingPriority(.defaultHigh, forSubviewAt: 1)
    }
  }

  private func applyFixedPaneWidth(_ requestedWidth: CGFloat) {
    guard splitView.arrangedSubviews.count == 2, splitView.bounds.width > 0 else {
      return
    }

    let clampedWidth = lcClampedFixedPaneWidth(
      requestedWidth,
      totalWidth: splitView.bounds.width,
      minimumFixedPaneWidth: configuration.minimumFixedPaneWidth,
      maximumFixedPaneWidth: configuration.maximumFixedPaneWidth,
      minimumFlexiblePaneWidth: configuration.minimumFlexiblePaneWidth,
      dividerThickness: configuration.dividerThickness
    )
    let dividerPosition = lcSplitDividerPosition(
      totalWidth: splitView.bounds.width,
      fixedPaneWidth: clampedWidth,
      fixedPaneEdge: configuration.fixedPaneEdge,
      dividerThickness: configuration.dividerThickness
    )
    let currentDividerPosition = splitView.arrangedSubviews[0].frame.width

    if abs(currentDividerPosition - dividerPosition) > 0.5 {
      isApplyingProgrammaticResize = true
      splitView.setPosition(dividerPosition, ofDividerAt: 0)
      splitView.adjustSubviews()
      isApplyingProgrammaticResize = false
    }
  }

  private func currentFixedPaneWidth() -> CGFloat? {
    guard splitView.arrangedSubviews.count == 2, splitView.bounds.width > 0 else {
      return nil
    }

    return lcClampedFixedPaneWidth(
      lcFixedPaneWidth(
        totalWidth: splitView.bounds.width,
        dividerPosition: splitView.arrangedSubviews[0].frame.width,
        fixedPaneEdge: configuration.fixedPaneEdge,
        dividerThickness: configuration.dividerThickness
      ),
      totalWidth: splitView.bounds.width,
      minimumFixedPaneWidth: configuration.minimumFixedPaneWidth,
      maximumFixedPaneWidth: configuration.maximumFixedPaneWidth,
      minimumFlexiblePaneWidth: configuration.minimumFlexiblePaneWidth,
      dividerThickness: configuration.dividerThickness
    )
  }

  private func commitCurrentFixedPaneWidth() {
    guard let currentWidth = currentFixedPaneWidth() else {
      return
    }

    preferredFixedPaneWidth = currentWidth

    guard lastPublishedFixedPaneWidth != currentWidth else {
      return
    }

    lastPublishedFixedPaneWidth = currentWidth
    onFixedPaneWidthChange(currentWidth)
  }

  func splitView(_ splitView: NSSplitView, constrainSplitPosition proposedPosition: CGFloat, ofSubviewAt dividerIndex: Int) -> CGFloat {
    let proposedFixedPaneWidth = lcFixedPaneWidth(
      totalWidth: splitView.bounds.width,
      dividerPosition: proposedPosition,
      fixedPaneEdge: configuration.fixedPaneEdge,
      dividerThickness: configuration.dividerThickness
    )
    let clampedWidth = lcClampedFixedPaneWidth(
      proposedFixedPaneWidth,
      totalWidth: splitView.bounds.width,
      minimumFixedPaneWidth: configuration.minimumFixedPaneWidth,
      maximumFixedPaneWidth: configuration.maximumFixedPaneWidth,
      minimumFlexiblePaneWidth: configuration.minimumFlexiblePaneWidth,
      dividerThickness: configuration.dividerThickness
    )

    return lcSplitDividerPosition(
      totalWidth: splitView.bounds.width,
      fixedPaneWidth: clampedWidth,
      fixedPaneEdge: configuration.fixedPaneEdge,
      dividerThickness: configuration.dividerThickness
    )
  }

  func splitView(
    _ splitView: NSSplitView,
    effectiveRect proposedEffectiveRect: NSRect,
    forDrawnRect drawnRect: NSRect,
    ofDividerAt dividerIndex: Int
  ) -> NSRect {
    guard let splitView = splitView as? LCInvisibleDividerSplitView else {
      return proposedEffectiveRect
    }

    return splitView.dividerHitRect(forDividerAt: dividerIndex)
  }
}
