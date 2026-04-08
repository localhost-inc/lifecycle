import XCTest

@testable import LifecycleApp

final class ScrollSpyTests: XCTestCase {
  private enum DemoSection: String, CaseIterable {
    case appearance
    case terminal
    case providers
    case connection
  }

  func testScrollSpyDefaultsToFallbackWhenOffsetsAreUnavailable() {
    XCTAssertEqual(
      lcScrollSpyActiveSelection(
        sections: DemoSection.allCases,
        sectionOffsets: [:],
        viewportHeight: 540,
        fallbackSelection: .appearance
      ),
      .appearance
    )
  }

  func testScrollSpyAdvancesWhenNextSectionCrossesFocusBand() {
    XCTAssertEqual(
      lcScrollSpyActiveSelection(
        sections: DemoSection.allCases,
        sectionOffsets: [
          .appearance: -220,
          .terminal: 80,
          .providers: 420,
          .connection: 760,
        ],
        viewportHeight: 520,
        contentBottomOffset: 940,
        fallbackSelection: .appearance
      ),
      .terminal
    )
  }

  func testScrollSpyUsesLastSectionNearScrollBottom() {
    XCTAssertEqual(
      lcScrollSpyActiveSelection(
        sections: DemoSection.allCases,
        sectionOffsets: [
          .appearance: -540,
          .terminal: -260,
          .providers: -40,
          .connection: 220,
        ],
        viewportHeight: 480,
        contentBottomOffset: 460,
        fallbackSelection: .appearance
      ),
      .connection
    )
  }
}
