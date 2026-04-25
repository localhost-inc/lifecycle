import XCTest

@testable import Lifecycle

final class SidebarIdentityTests: XCTestCase {
  func testResolveSidebarOrganizationIdentityUsesActiveOrganization() {
    let authState = BridgeAuthState(
      authenticated: true,
      userId: "user_123",
      email: "kyle@example.com",
      displayName: "Kyle",
      activeOrgId: "org_123",
      activeOrgSlug: "acme",
      gitProfile: nil
    )
    let organizations = [
      BridgeOrganization(id: "org_123", name: "Acme", slug: "acme", role: "owner"),
      BridgeOrganization(id: "org_456", name: "Other", slug: "other", role: "member"),
    ]

    XCTAssertEqual(
      resolveAppSidebarOrganizationIdentity(authState: authState, organizations: organizations),
      AppSidebarOrganizationIdentity(
        name: "Acme",
        slug: "acme",
        avatarLabel: "Acme",
        avatarSymbolName: nil,
        canOpenPicker: true
      )
    )
  }

  func testResolveSidebarOrganizationIdentityUsesSignedOutPlaceholder() {
    let authState = BridgeAuthState(
      authenticated: false,
      userId: nil,
      email: nil,
      displayName: nil,
      activeOrgId: nil,
      activeOrgSlug: nil,
      gitProfile: nil
    )

    XCTAssertEqual(
      resolveAppSidebarOrganizationIdentity(authState: authState, organizations: []),
      AppSidebarOrganizationIdentity(
        name: "Personal",
        slug: "Sign in",
        avatarLabel: "Personal",
        avatarSymbolName: "person.fill",
        canOpenPicker: false
      )
    )
  }

  func testResolveSidebarUserIdentityUsesSignedInAuthRecord() {
    let authState = BridgeAuthState(
      authenticated: true,
      userId: "user_123",
      email: "kyle@example.com",
      displayName: "Kyle",
      activeOrgId: "org_123",
      activeOrgSlug: "acme",
      gitProfile: BridgeGitProfile(
        name: "Kyle GitHub",
        email: "kyle@users.noreply.github.com",
        login: "kyle",
        avatarUrl: "https://example.com/avatar.png"
      )
    )

    XCTAssertEqual(
      resolveAppSidebarUserIdentity(authState: authState),
      AppSidebarUserIdentity(
        primaryText: "Kyle",
        secondaryText: "kyle@example.com",
        avatarLabel: "Kyle",
        avatarSymbolName: nil,
        avatarUrl: nil
      )
    )
  }

  func testResolveSidebarUserIdentityInfersSignedOutStateFromGitProfile() {
    let authState = BridgeAuthState(
      authenticated: false,
      userId: nil,
      email: nil,
      displayName: nil,
      activeOrgId: nil,
      activeOrgSlug: nil,
      gitProfile: BridgeGitProfile(
        name: "Kyle",
        email: "kyle@users.noreply.github.com",
        login: "kyle",
        avatarUrl: "https://example.com/avatar.png"
      )
    )

    XCTAssertEqual(
      resolveAppSidebarUserIdentity(authState: authState),
      AppSidebarUserIdentity(
        primaryText: "Kyle",
        secondaryText: "@kyle",
        avatarLabel: "Kyle",
        avatarSymbolName: nil,
        avatarUrl: "https://example.com/avatar.png"
      )
    )
  }

  func testResolveSidebarUserIdentityFallsBackToSignedOutPlaceholder() {
    XCTAssertEqual(
      resolveAppSidebarUserIdentity(authState: nil),
      AppSidebarUserIdentity(
        primaryText: "Sign in",
        secondaryText: nil,
        avatarLabel: "Sign in",
        avatarSymbolName: "person.fill",
        avatarUrl: nil
      )
    )
  }
}
