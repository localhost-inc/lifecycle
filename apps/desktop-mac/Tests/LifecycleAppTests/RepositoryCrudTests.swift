import XCTest

@testable import LifecycleApp

final class RepositoryCrudTests: XCTestCase {
  func testRepositoryNameUsesLastPathComponent() {
    XCTAssertEqual(repositoryName(from: "/tmp/work/lifecycle"), "lifecycle")
    XCTAssertEqual(repositoryName(from: "/tmp/work/lifecycle/"), "lifecycle")
  }

  func testPreferredRootWorkspaceNameFallsBackWhenBranchIsMissingOrDetached() {
    XCTAssertEqual(
      preferredRootWorkspaceName(branchName: nil, repositoryName: "lifecycle"),
      "lifecycle"
    )
    XCTAssertEqual(
      preferredRootWorkspaceName(branchName: "HEAD", repositoryName: "lifecycle"),
      "lifecycle"
    )
  }

  func testPreferredRootWorkspaceNameUsesResolvedBranch() {
    XCTAssertEqual(
      preferredRootWorkspaceName(branchName: "feat/native-shell", repositoryName: "lifecycle"),
      "feat/native-shell"
    )
  }

  func testPreferredRepositoryWorkspacePrefersRootWorkspacePath() {
    let repository = BridgeRepository(
      id: "repo_1",
      name: "lifecycle",
      source: "local",
      path: "/tmp/lifecycle",
      workspaces: [
        BridgeWorkspaceSummary(
          id: "workspace_worktree",
          name: "feat/native-shell",
          host: "local",
          status: "active",
          ref: "feat/native-shell",
          path: "/tmp/lifecycle/.lifecycle/worktrees/native-shell"
        ),
        BridgeWorkspaceSummary(
          id: "workspace_root",
          name: "main",
          host: "local",
          status: "active",
          ref: "main",
          path: "/tmp/lifecycle"
        ),
      ]
    )

    XCTAssertEqual(preferredRepositoryWorkspace(repository)?.id, "workspace_root")
  }

  func testIsRootWorkspaceSummaryUsesRepositoryPath() {
    let repository = BridgeRepository(
      id: "repo_1",
      name: "lifecycle",
      source: "local",
      path: "/tmp/lifecycle",
      workspaces: []
    )
    let rootWorkspace = BridgeWorkspaceSummary(
      id: "workspace_root",
      name: "main",
      host: "local",
      status: "active",
      ref: "main",
      path: "/tmp/lifecycle"
    )
    let worktreeWorkspace = BridgeWorkspaceSummary(
      id: "workspace_worktree",
      name: "feature-x",
      host: "local",
      status: "active",
      ref: "feature-x",
      path: "/tmp/.lifecycle/worktrees/local/lifecycle/feature-x"
    )

    XCTAssertTrue(isRootWorkspaceSummary(rootWorkspace, in: repository))
    XCTAssertFalse(isRootWorkspaceSummary(worktreeWorkspace, in: repository))
  }

  func testSlugifyWorkspaceNameNormalizesForBranchNames() {
    XCTAssertEqual(slugifyWorkspaceName("  Feature / Polish Pass  "), "feature-polish-pass")
  }

  func testWorkspaceBranchNameUsesSluggedNameAndShortID() {
    XCTAssertEqual(
      workspaceBranchName(workspaceName: "Feature Polish", workspaceID: "abc12345-6789"),
      "lifecycle/feature-polish-abc12345"
    )
  }
}
