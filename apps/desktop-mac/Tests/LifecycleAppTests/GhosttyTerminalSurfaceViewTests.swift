import XCTest

@testable import LifecycleApp

final class GhosttyTerminalSurfaceViewTests: XCTestCase {
  func testGhosttyTerminalSurfaceConfigurationChangedOnlyWhenFieldsDiffer() {
    let configuration = GhosttyTerminalSurfaceConfiguration(
      terminalID: "terminal:surface:workspace-1:@1",
      workingDirectory: "/tmp/workspace",
      command: "exec tmux attach",
      backgroundHexColor: "#181614",
      themeConfigPath: "/tmp/theme",
      darkAppearance: true,
      focusedTerminal: true,
      hiddenTerminal: false,
      pointerPassthrough: false,
      terminalFontSize: 13
    )

    XCTAssertFalse(
      ghosttyTerminalSurfaceConfigurationChanged(
        current: configuration,
        next: configuration
      )
    )

    XCTAssertTrue(
      ghosttyTerminalSurfaceConfigurationChanged(
        current: configuration,
        next: GhosttyTerminalSurfaceConfiguration(
          terminalID: configuration.terminalID,
          workingDirectory: configuration.workingDirectory,
          command: configuration.command,
          backgroundHexColor: configuration.backgroundHexColor,
          themeConfigPath: configuration.themeConfigPath,
          darkAppearance: configuration.darkAppearance,
          focusedTerminal: false,
          hiddenTerminal: true,
          pointerPassthrough: true,
          terminalFontSize: configuration.terminalFontSize
        )
      )
    )
  }
}
