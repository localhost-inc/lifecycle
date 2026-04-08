import XCTest

@testable import LifecycleApp

final class ProviderAuthSettingsTests: XCTestCase {
  func testProviderAccountStatusTextPrefersAuthenticatedEmail() {
    XCTAssertEqual(
      providerAccountStatusText(
        for: BridgeProviderAuthStatus(
          state: .authenticated,
          email: "user@example.com",
          organization: "plus"
        )
      ),
      "Connected as user@example.com"
    )
  }

  func testProviderAccountStatusTextFallsBackToAuthenticationOutput() {
    XCTAssertEqual(
      providerAccountStatusText(
        for: .authenticating(output: ["Opening browser for Claude authentication..."])
      ),
      "Opening browser for Claude authentication..."
    )
  }

  func testProviderAccountActionVisibilityMatchesStatus() {
    XCTAssertTrue(providerAccountShouldShowAction(for: BridgeProviderAuthStatus(state: .unauthenticated)))
    XCTAssertTrue(providerAccountShouldShowAction(for: .error("No local credentials.")))
    XCTAssertFalse(providerAccountShouldShowAction(for: .checking))
    XCTAssertFalse(
      providerAccountShouldShowAction(
        for: BridgeProviderAuthStatus(
          state: .authenticated,
          email: nil,
          organization: "plus"
        )
      )
    )
  }

  func testProviderAccountActionLabelUsesRetryForErrors() {
    XCTAssertEqual(providerAccountActionLabel(for: .error("boom")), "Retry")
    XCTAssertEqual(
      providerAccountActionLabel(for: BridgeProviderAuthStatus(state: .unauthenticated)),
      "Sign In"
    )
  }
}
