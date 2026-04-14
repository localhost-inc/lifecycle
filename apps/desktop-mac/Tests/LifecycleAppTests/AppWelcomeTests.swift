import XCTest

@testable import LifecycleApp

final class AppWelcomeTests: XCTestCase {
  func testAppWelcomeRequiredDependenciesReadyRequiresAllRequiredTools() {
    let requirements = appWelcomeDependencyRequirements()
    let results = requirements.map { requirement in
      AppWelcomeDependencyResult(
        requirement: requirement,
        state: requirement.id == "gh" ? .missing(nil) : .installed("ok")
      )
    }

    XCTAssertFalse(appWelcomeRequiredDependenciesReady(results))
  }

  func testAppWelcomeRequiredDependenciesReadyAllowsMissingOptionalTools() {
    let results = appWelcomeDependencyRequirements().map { requirement in
      AppWelcomeDependencyResult(
        requirement: requirement,
        state: requirement.isRequired ? .installed("ok") : .missing(nil)
      )
    }

    XCTAssertTrue(appWelcomeRequiredDependenciesReady(results))
  }

  func testAppWelcomeMissingDependenciesReturnsOnlyFailures() {
    let results = appWelcomeDependencyRequirements().map { requirement in
      AppWelcomeDependencyResult(
        requirement: requirement,
        state: requirement.id == "gh" || requirement.id == "docker"
          ? .missing(nil)
          : .installed("ok")
      )
    }

    XCTAssertEqual(appWelcomeMissingDependencies(results).map(\.id), ["gh", "docker"])
  }

  func testAppWelcomeDependencyVersionSummaryUsesFirstNonEmptyLine() {
    XCTAssertEqual(
      appWelcomeDependencyVersionSummary(
        ProcessOutput(
          stdout: "",
          stderr: "gh version 2.70.0 (2026-01-01)\nhttps://github.com/cli/cli/releases/tag/v2.70.0",
          exitCode: 0
        )
      ),
      "gh version 2.70.0 (2026-01-01)"
    )
  }

  func testResolveAppWelcomeDependenciesMarksInstalledAndMissing() async {
    let requirements = [
      AppWelcomeDependencyRequirement(
        id: "git",
        title: "Git",
        summary: "",
        installHint: "",
        program: "git",
        args: ["--version"],
        isRequired: true
      ),
      AppWelcomeDependencyRequirement(
        id: "gh",
        title: "GitHub CLI",
        summary: "",
        installHint: "",
        program: "gh",
        args: ["--version"],
        isRequired: true
      ),
    ]

    let results = await resolveAppWelcomeDependencies(requirements: requirements) { program, _ in
      switch program {
      case "git":
        return ProcessOutput(stdout: "git version 2.49.0\n", stderr: "", exitCode: 0)
      case "gh":
        return ProcessOutput(stdout: "", stderr: "env: gh: No such file or directory\n", exitCode: 127)
      default:
        XCTFail("Unexpected program \(program)")
        return ProcessOutput(stdout: "", stderr: "", exitCode: 1)
      }
    }

    XCTAssertEqual(results.count, 2)
    XCTAssertEqual(results[0].id, "git")
    XCTAssertEqual(results[1].id, "gh")

    if case let .installed(version) = results[0].state {
      XCTAssertEqual(version, "git version 2.49.0")
    } else {
      XCTFail("Expected git to be installed.")
    }

    if case let .missing(details) = results[1].state {
      XCTAssertEqual(details, "env: gh: No such file or directory")
    } else {
      XCTFail("Expected gh to be missing.")
    }
  }

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

  func testShowsAppWelcomeWhenForcedEvenIfRepositoriesExist() {
    XCTAssertTrue(
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
        isRecoveringBridge: false,
        forceShow: true
      )
    )
  }

  func testDoesNotShowWelcomeWhileRecoveringBridgeEvenWhenForced() {
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
        isRecoveringBridge: true,
        forceShow: true
      )
    )
  }
}
