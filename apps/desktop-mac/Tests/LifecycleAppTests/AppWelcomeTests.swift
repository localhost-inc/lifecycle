import XCTest

@testable import LifecycleApp

final class AppWelcomeTests: XCTestCase {
  func testShowsAppWelcomeOnlyWhenRepositoryListIsEmptyAndBridgeIsIdle() {
    XCTAssertTrue(
      shouldShowAppWelcomeView(
        repositories: [],
        isLoading: false,
        isRecoveringBridge: false
      )
    )
  }

  func testDoesNotShowWelcomeWhileLoadingBridge() {
    XCTAssertFalse(
      shouldShowAppWelcomeView(
        repositories: [],
        isLoading: true,
        isRecoveringBridge: false
      )
    )
  }

  func testDoesNotShowWelcomeOnceRepositoriesExist() {
    XCTAssertFalse(
      shouldShowAppWelcomeView(
        repositories: [
          BridgeRepository(
            id: "repo_1",
            name: "lifecycle",
            source: "local",
            path: "/tmp/lifecycle",
            workspaces: []
          )
        ],
        isLoading: false,
        isRecoveringBridge: false
      )
    )
  }
}
