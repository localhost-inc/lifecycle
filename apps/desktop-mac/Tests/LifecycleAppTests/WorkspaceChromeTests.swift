import XCTest
import SwiftUI
import LifecyclePresentation

@testable import LifecycleApp

final class WorkspaceChromeTests: XCTestCase {
  func testSplitFixedPaneWidthBoundsRespectFlexiblePaneMinimum() {
    let bounds = lcFixedPaneWidthBounds(
      totalWidth: 1180,
      minimumFixedPaneWidth: minimumAppSidebarWidth,
      maximumFixedPaneWidth: maximumAppSidebarWidth,
      minimumFlexiblePaneWidth: minimumWorkspaceShellContentWidth,
      dividerThickness: appSidebarDividerThickness
    )

    XCTAssertEqual(bounds.lowerBound, minimumAppSidebarWidth)
    XCTAssertEqual(bounds.upperBound, 259)
  }

  func testSplitDividerPositionRoundTripsTrailingFixedPaneWidth() {
    let dividerPosition = lcSplitDividerPosition(
      totalWidth: 1200,
      fixedPaneWidth: 320,
      fixedPaneEdge: .trailing,
      dividerThickness: workspaceExtensionSidebarDividerThickness
    )

    XCTAssertEqual(
      lcFixedPaneWidth(
        totalWidth: 1200,
        dividerPosition: dividerPosition,
        fixedPaneEdge: .trailing,
        dividerThickness: workspaceExtensionSidebarDividerThickness
      ),
      320
    )
  }

  @MainActor
  func testAppSidebarWidthDefaultsToReducedBaseWidth() {
    let model = AppModel()

    XCTAssertEqual(
      model.appSidebarWidth(availableWidth: 1280),
      defaultAppSidebarWidth
    )
  }

  @MainActor
  func testAppSidebarWidthClampsToAvailableShellSpace() {
    let model = AppModel()
    let availableWidth: CGFloat = 1180

    model.setAppSidebarWidth(400, availableWidth: availableWidth)

    XCTAssertEqual(
      model.appSidebarWidth(availableWidth: availableWidth),
      clampedAppSidebarWidth(400, availableWidth: availableWidth)
    )
    XCTAssertEqual(
      model.appSidebarWidth(availableWidth: availableWidth),
      259
    )
  }

  @MainActor
  func testAppSidebarWidthCanBeUpdatedWithinClampRange() {
    let model = AppModel()

    model.setAppSidebarWidth(300, availableWidth: 1400)
    XCTAssertEqual(model.appSidebarWidth(availableWidth: 1400), 300)

    model.setAppSidebarWidth(240, availableWidth: 1400)
    XCTAssertEqual(model.appSidebarWidth(availableWidth: 1400), 240)
  }

  @MainActor
  func testAppSidebarPreferredWidthSurvivesTightWindowClamp() {
    let model = AppModel()

    model.setAppSidebarWidth(340, availableWidth: 1400)

    XCTAssertEqual(model.appSidebarWidth(availableWidth: 1100), 220)
    XCTAssertEqual(model.appSidebarWidth(availableWidth: 1400), 340)
  }

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

  func testWorkspaceStackHeaderActionStateShowsStartWhenServicesAreStopped() {
    let action = workspaceStackHeaderActionState(
      summary: stackSummary(serviceStatuses: ["stopped"]),
      isMutating: false
    )

    XCTAssertEqual(action?.kind, .start)
    XCTAssertEqual(action?.label, "Start")
    XCTAssertEqual(action?.icon, "play.fill")
    XCTAssertEqual(action?.isEnabled, true)
  }

  func testWorkspaceStackHeaderActionStateShowsStopWhenAnyServiceIsReady() {
    let action = workspaceStackHeaderActionState(
      summary: stackSummary(serviceStatuses: ["ready", "stopped"]),
      isMutating: false
    )

    XCTAssertEqual(action?.kind, .stop)
    XCTAssertEqual(action?.label, "Stop Stack")
    XCTAssertEqual(action?.icon, "stop.fill")
    XCTAssertEqual(action?.isEnabled, true)
  }

  func testWorkspaceStackHeaderActionStateShowsStoppingWhenServicePhaseIsStopping() {
    let action = workspaceStackHeaderActionState(
      summary: stackSummary(serviceStatuses: ["ready"]),
      isMutating: false,
      hasStoppingServices: true
    )

    XCTAssertEqual(action?.kind, .stopping)
    XCTAssertEqual(action?.label, "Stopping…")
    XCTAssertEqual(action?.isEnabled, false)
  }

  func testWorkspaceStackHeaderActionStateHidesWhenStackIsMissing() {
    let action = workspaceStackHeaderActionState(
      summary: BridgeWorkspaceStackSummary(
        workspaceID: "workspace-1",
        state: "missing",
        errors: [],
        nodes: []
      ),
      isMutating: false
    )

    XCTAssertNil(action)
  }

  func testApplyStackServiceLifecycleEventMarksServiceStartingWithoutReload() {
    let update = applyStackServiceLifecycleEvent(
      .starting(service: "service-0"),
      summary: stackSummary(serviceStatuses: ["stopped"]),
      phases: [:]
    )

    XCTAssertEqual(update.summary?.nodes.first?.status, "starting")
    XCTAssertTrue(update.phases.isEmpty)
    XCTAssertFalse(update.shouldReload)
  }

  func testApplyStackServiceLifecycleEventTracksStoppingPhaseUntilStopped() {
    let stopping = applyStackServiceLifecycleEvent(
      .stopping(service: "service-0"),
      summary: stackSummary(serviceStatuses: ["ready"]),
      phases: [:]
    )

    XCTAssertEqual(stopping.summary?.nodes.first?.status, "ready")
    XCTAssertEqual(stopping.phases["service-0"], .stopping)
    XCTAssertFalse(stopping.shouldReload)

    let stopped = applyStackServiceLifecycleEvent(
      .stopped(service: "service-0"),
      summary: stopping.summary,
      phases: stopping.phases
    )

    XCTAssertEqual(stopped.summary?.nodes.first?.status, "stopped")
    XCTAssertNil(stopped.phases["service-0"])
    XCTAssertTrue(stopped.shouldReload)
  }

  private func stackSummary(serviceStatuses: [String]) -> BridgeWorkspaceStackSummary {
    BridgeWorkspaceStackSummary(
      workspaceID: "workspace-1",
      state: "ready",
      errors: [],
      nodes: serviceStatuses.enumerated().map { index, status in
        BridgeStackNode(
          workspaceID: "workspace-1",
          name: "service-\(index)",
          kind: "process",
          dependsOn: [],
          status: status,
          statusReason: nil,
          assignedPort: nil,
          previewURL: nil,
          createdAt: nil,
          updatedAt: nil,
          runOn: nil,
          command: nil,
          writeFilesCount: nil
        )
      }
    )
  }
}
