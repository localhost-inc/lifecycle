import XCTest

@testable import LifecycleApp

final class HoverCursorTests: XCTestCase {
  func testHoverCursorTransitionPushesOnlyWhenEnteringEnabledControl() {
    XCTAssertEqual(
      hoverCursorTransition(
        isHovering: false,
        nextHovering: true,
        isEnabled: true
      ),
      LCHoverCursorTransition(isHovering: true, action: .push)
    )

    XCTAssertEqual(
      hoverCursorTransition(
        isHovering: true,
        nextHovering: true,
        isEnabled: true
      ),
      LCHoverCursorTransition(isHovering: true, action: .none)
    )
  }

  func testHoverCursorTransitionPopsWhenHoverEndsOrControlDisables() {
    XCTAssertEqual(
      hoverCursorTransition(
        isHovering: true,
        nextHovering: false,
        isEnabled: true
      ),
      LCHoverCursorTransition(isHovering: false, action: .pop)
    )

    XCTAssertEqual(
      hoverCursorTransition(
        isHovering: true,
        nextHovering: true,
        isEnabled: false
      ),
      LCHoverCursorTransition(isHovering: false, action: .pop)
    )

    XCTAssertEqual(
      hoverCursorResetTransition(isHovering: false),
      LCHoverCursorTransition(isHovering: false, action: .none)
    )
  }
}
