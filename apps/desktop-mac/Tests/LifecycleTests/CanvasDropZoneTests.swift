import XCTest
import SwiftUI

@testable import Lifecycle
@testable import LifecyclePresentation

final class CanvasDropZoneTests: XCTestCase {
  func testEnabledCanvasDropEdgesAllowsAllEdgesForCrossGroupDrop() {
    let sourceSurfaceID = "surface:workspace-1:@1"
    let targetSurfaceID = "surface:workspace-1:@2"

    let edges = enabledCanvasDropEdges(
      groupsByID: [
        "group:source": CanvasGroup(
          id: "group:source",
          surfaceOrder: [sourceSurfaceID],
          activeSurfaceID: sourceSurfaceID
        ),
        "group:target": CanvasGroup(
          id: "group:target",
          surfaceOrder: [targetSurfaceID],
          activeSurfaceID: targetSurfaceID
        ),
      ],
      targetGroupID: "group:target",
      draggingSurfaceID: sourceSurfaceID
    )

    XCTAssertEqual(edges, Set([.left, .right, .top, .bottom, .center]))
  }

  func testEnabledCanvasDropEdgesRemovesNoOpEdgesForSelfDrops() {
    let surfaceID = "surface:workspace-1:@1"
    let multiSurfaceEdges = enabledCanvasDropEdges(
      groupsByID: [
        "group:one": CanvasGroup(
          id: "group:one",
          surfaceOrder: [surfaceID, "surface:workspace-1:@2"],
          activeSurfaceID: surfaceID
        )
      ],
      targetGroupID: "group:one",
      draggingSurfaceID: surfaceID
    )

    XCTAssertEqual(multiSurfaceEdges, Set([.left, .right, .top, .bottom]))

    let singleSurfaceEdges = enabledCanvasDropEdges(
      groupsByID: [
        "group:one": CanvasGroup(
          id: "group:one",
          surfaceOrder: [surfaceID],
          activeSurfaceID: surfaceID
        )
      ],
      targetGroupID: "group:one",
      draggingSurfaceID: surfaceID
    )

    XCTAssertTrue(singleSurfaceEdges.isEmpty)
  }

  func testCanvasDropZoneDescriptorsUseSharedTiledGeometry() {
    let descriptors = canvasDropZoneDescriptors(
      size: CGSize(width: 640, height: 420),
      enabledEdges: Set([.left, .right, .top, .bottom, .center])
    )
    let framesByEdge = Dictionary(uniqueKeysWithValues: descriptors.map { ($0.edge, $0.frame) })

    XCTAssertEqual(descriptors.count, 5)
    XCTAssertEqual(framesByEdge[.left]?.width, framesByEdge[.right]?.width)
    XCTAssertEqual(framesByEdge[.top]?.height, framesByEdge[.bottom]?.height)
    XCTAssertEqual(framesByEdge[.left]?.maxX, framesByEdge[.top]?.minX)
    XCTAssertEqual(framesByEdge[.top]?.maxY, framesByEdge[.center]?.minY)
    XCTAssertEqual(framesByEdge[.center]?.maxX, framesByEdge[.right]?.minX)
    XCTAssertEqual(framesByEdge[.center]?.maxY, framesByEdge[.bottom]?.minY)
  }

  func testCanvasDropZoneDescriptorsRespectEnabledEdges() {
    let descriptors = canvasDropZoneDescriptors(
      size: CGSize(width: 520, height: 360),
      enabledEdges: Set([.left, .center])
    )

    XCTAssertEqual(descriptors.map(\.edge), [.left, .center])
  }

  func testCanvasDropEdgeReturnsRightAndBottomFromVisibleBoxes() throws {
    let descriptors = canvasDropZoneDescriptors(
      size: CGSize(width: 640, height: 420),
      enabledEdges: Set([.left, .right, .top, .bottom, .center])
    )
    let framesByEdge = Dictionary(uniqueKeysWithValues: descriptors.map { ($0.edge, $0.frame) })
    let rightFrame = try XCTUnwrap(framesByEdge[.right])
    let bottomFrame = try XCTUnwrap(framesByEdge[.bottom])

    XCTAssertEqual(
      canvasDropEdge(
        at: CGPoint(x: rightFrame.midX, y: rightFrame.midY),
        in: descriptors
      ),
      .right
    )
    XCTAssertEqual(
      canvasDropEdge(
        at: CGPoint(x: bottomFrame.midX, y: bottomFrame.midY),
        in: descriptors
      ),
      .bottom
    )
  }
}
