import XCTest
import LifecyclePresentation

@testable import LifecycleApp

final class WorkspaceChromeTests: XCTestCase {
  func testWorkspaceShellIdentityUsesLocalUserAndShortHostName() {
    XCTAssertEqual(
      workspaceShellIdentityLabel(
        hostKind: "local",
        localUserName: "kyle",
        localHostName: "mbp.local"
      ),
      "kyle@mbp"
    )
  }

  func testWorkspaceShellIdentityFallsBackToHostKindForRemoteShells() {
    XCTAssertEqual(
      workspaceShellIdentityLabel(
        hostKind: "cloud",
        localUserName: "kyle",
        localHostName: "mbp.local"
      ),
      "cloud shell"
    )
  }

  func testWorkspaceStatusBarLayoutModeTracksSpatialCanvas() {
    XCTAssertEqual(
      workspaceStatusBarLayoutMode(
        for: .spatial(
          CanvasSpatialLayout(framesByGroupID: [:])
        )
      ),
      .spatial
    )
  }

  func testCanvasTiledSplitLayoutMetricsKeepTiledGroupsFlush() {
    let metrics = canvasTiledSplitLayoutMetrics(ratio: 0.5, totalLength: 1000)

    XCTAssertEqual(metrics.ratio, 0.5, accuracy: 0.001)
    XCTAssertEqual(metrics.firstLength, 500, accuracy: 0.001)
    XCTAssertEqual(metrics.secondLength, 500, accuracy: 0.001)
    XCTAssertEqual(metrics.firstLength + metrics.secondLength, 1000, accuracy: 0.001)
    XCTAssertEqual(metrics.dividerOffset, 495, accuracy: 0.001)
  }

  func testCanvasTiledSplitLayoutMetricsClampRatioWithoutCreatingGap() {
    let metrics = canvasTiledSplitLayoutMetrics(ratio: 0.2, totalLength: 700)

    XCTAssertEqual(metrics.ratio, 240 / 700, accuracy: 0.001)
    XCTAssertEqual(metrics.firstLength, 240, accuracy: 0.001)
    XCTAssertEqual(metrics.secondLength, 460, accuracy: 0.001)
    XCTAssertEqual(metrics.firstLength + metrics.secondLength, 700, accuracy: 0.001)
  }
}
