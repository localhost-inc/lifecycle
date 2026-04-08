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
}
