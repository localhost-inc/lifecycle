import XCTest

@testable import LifecycleApp

final class TypewriterTextTests: XCTestCase {
  func testTypewriterVisibleCharacterCountHonorsStartDelay() {
    let startDate = Date(timeIntervalSinceReferenceDate: 100)

    XCTAssertEqual(
      typewriterVisibleCharacterCount(
        totalCharacters: 8,
        startDate: startDate,
        currentDate: startDate.addingTimeInterval(0.19),
        characterDelay: 0.1,
        startDelay: 0.2
      ),
      0
    )
  }

  func testTypewriterVisibleCharacterCountStartsWithFirstCharacter() {
    let startDate = Date(timeIntervalSinceReferenceDate: 100)

    XCTAssertEqual(
      typewriterVisibleCharacterCount(
        totalCharacters: 8,
        startDate: startDate,
        currentDate: startDate,
        characterDelay: 0.1,
        startDelay: 0
      ),
      1
    )
  }

  func testTypewriterVisibleCharacterCountCapsAtFullLength() {
    let startDate = Date(timeIntervalSinceReferenceDate: 100)

    XCTAssertEqual(
      typewriterVisibleCharacterCount(
        totalCharacters: 5,
        startDate: startDate,
        currentDate: startDate.addingTimeInterval(10),
        characterDelay: 0.08,
        startDelay: 0
      ),
      5
    )
  }

  func testTypewriterDisplayedTextPreservesExtendedGraphemeClusters() {
    XCTAssertEqual(
      typewriterDisplayedText("A👩‍💻B", visibleCharacterCount: 2),
      "A👩‍💻"
    )
  }

  func testTypewriterRenderStateHidesCursorOnceTypingCompletes() {
    let startDate = Date(timeIntervalSinceReferenceDate: 100)

    let state = typewriterRenderState(
      text: "Lifecycle",
      startDate: startDate,
      currentDate: startDate.addingTimeInterval(2),
      characterDelay: 0.05,
      startDelay: 0,
      cursor: "▌",
      showsCursor: true,
      revealsImmediately: false
    )

    XCTAssertEqual(state.visibleText, "Lifecycle")
    XCTAssertFalse(state.showsCursor)
  }
}
