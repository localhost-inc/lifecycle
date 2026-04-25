import AppKit
import XCTest
import LifecyclePresentation

@testable import Lifecycle

final class WorkspaceSpatialCanvasTests: XCTestCase {
  func testCanvasSpatialViewportZoomingKeepsAnchorStable() {
    let viewport = CanvasSpatialViewportState(
      scale: 1,
      translation: CGSize(width: 40, height: 24)
    )
    let anchor = CGPoint(x: 220, y: 140)
    let worldAnchor = CGPoint(
      x: (anchor.x - viewport.translation.width) / viewport.scale,
      y: (anchor.y - viewport.translation.height) / viewport.scale
    )

    let zoomed = canvasSpatialViewportZooming(
      viewport,
      by: 1.35,
      around: anchor
    )

    let resolvedAnchor = CGPoint(
      x: (worldAnchor.x * zoomed.scale) + zoomed.translation.width,
      y: (worldAnchor.y * zoomed.scale) + zoomed.translation.height
    )

    XCTAssertEqual(resolvedAnchor.x, anchor.x, accuracy: 0.001)
    XCTAssertEqual(resolvedAnchor.y, anchor.y, accuracy: 0.001)
  }

  func testCanvasSpatialViewportZoomingClampsToSupportedScaleRange() {
    let zoomedOut = canvasSpatialViewportZooming(
      CanvasSpatialViewportState(scale: 0.5, translation: .zero),
      by: 0.1,
      around: .zero
    )
    let zoomedIn = canvasSpatialViewportZooming(
      CanvasSpatialViewportState(scale: 1.5, translation: .zero),
      by: 2,
      around: .zero
    )

    XCTAssertEqual(zoomedOut.scale, 0.45, accuracy: 0.001)
    XCTAssertEqual(zoomedIn.scale, 1.6, accuracy: 0.001)
  }

  func testCanvasSpatialViewportPanningOffsetsTranslation() {
    let viewport = CanvasSpatialViewportState(
      scale: 1.2,
      translation: CGSize(width: 32, height: -18)
    )

    let panned = canvasSpatialViewportPanning(
      viewport,
      by: CGSize(width: -40, height: 24)
    )

    XCTAssertEqual(panned.scale, viewport.scale, accuracy: 0.001)
    XCTAssertEqual(panned.translation.width, -8, accuracy: 0.001)
    XCTAssertEqual(panned.translation.height, 6, accuracy: 0.001)
  }

  func testCanvasSpatialShouldHandleScrollAsZoomRequiresCommandModifier() {
    XCTAssertTrue(canvasSpatialShouldHandleScrollAsZoom(modifiers: [.command]))
    XCTAssertFalse(canvasSpatialShouldHandleScrollAsZoom(modifiers: []))
    XCTAssertFalse(canvasSpatialShouldHandleScrollAsZoom(modifiers: [.shift]))
  }

  func testCanvasSpatialDragStripHitHeightKeepsMinimumPointerTarget() {
    XCTAssertEqual(canvasSpatialDragStripHitHeight(forScale: 0.45), 48, accuracy: 0.001)
    XCTAssertEqual(canvasSpatialDragStripHitHeight(forScale: 1), 48, accuracy: 0.001)
    XCTAssertEqual(canvasSpatialDragStripHitHeight(forScale: 1.6), 64, accuracy: 0.001)
  }

  func testCanvasSpatialResizeHandleHitSizeKeepsMinimumPointerTarget() {
    XCTAssertEqual(canvasSpatialResizeHandleHitSize(forScale: 0.45), 36, accuracy: 0.001)
    XCTAssertEqual(canvasSpatialResizeHandleHitSize(forScale: 1), 36, accuracy: 0.001)
    XCTAssertEqual(canvasSpatialResizeHandleHitSize(forScale: 1.6), 38.4, accuracy: 0.001)
  }

  func testCanvasSpatialDraftOffsetTracksLiveFrameMovement() {
    let persistedFrame = CanvasSpatialFrame(x: 120, y: 80, width: 900, height: 600, zIndex: 1)
    let displayFrame = CanvasSpatialFrame(x: 156, y: 104, width: 900, height: 600, zIndex: 1)

    let offset = canvasSpatialDraftOffset(
      from: persistedFrame,
      to: displayFrame,
      scale: 0.5
    )

    XCTAssertEqual(offset.width, 18, accuracy: 0.001)
    XCTAssertEqual(offset.height, 12, accuracy: 0.001)
  }

  func testCanvasSpatialSurfaceChromeVisibleWhenHoveredOrActive() {
    XCTAssertTrue(canvasSpatialSurfaceChromeVisible(isHovering: true, isActive: false))
    XCTAssertTrue(canvasSpatialSurfaceChromeVisible(isHovering: false, isActive: true))
    XCTAssertFalse(canvasSpatialSurfaceChromeVisible(isHovering: false, isActive: false))
  }

  func testCanvasSpatialGrabCursorModePrefersClosedWhileDragging() {
    XCTAssertEqual(canvasSpatialGrabCursorMode(isHovering: false, isActive: false), .none)
    XCTAssertEqual(canvasSpatialGrabCursorMode(isHovering: true, isActive: false), .open)
    XCTAssertEqual(canvasSpatialGrabCursorMode(isHovering: true, isActive: true), .closed)
    XCTAssertEqual(canvasSpatialGrabCursorMode(isHovering: false, isActive: true), .closed)
  }
}
