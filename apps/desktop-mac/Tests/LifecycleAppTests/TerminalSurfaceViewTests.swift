import XCTest

@testable import LifecycleApp

final class TerminalSurfaceViewTests: XCTestCase {
  func testTerminalSurfacePresentationFontSizeTracksScale() {
    XCTAssertEqual(terminalSurfacePresentationFontSize(for: 0.45), 6, accuracy: 0.001)
    XCTAssertEqual(terminalSurfacePresentationFontSize(for: 1), 13, accuracy: 0.001)
    XCTAssertEqual(terminalSurfacePresentationFontSize(for: 1.6), 20.8, accuracy: 0.001)
    XCTAssertEqual(terminalSurfacePresentationFontSize(for: 3), 24, accuracy: 0.001)
  }

  func testTerminalSurfaceConfigurationBuildsHostConfiguration() {
    let configuration = TerminalSurfaceConfiguration(
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
    let hostConfiguration = configuration.hostConfiguration

    XCTAssertEqual(hostConfiguration.workingDirectory, configuration.workingDirectory)
    XCTAssertEqual(hostConfiguration.command, configuration.command)
    XCTAssertEqual(hostConfiguration.backgroundHexColor, configuration.backgroundHexColor)
    XCTAssertEqual(hostConfiguration.themeConfigPath, configuration.themeConfigPath)
    XCTAssertEqual(hostConfiguration.darkAppearance, configuration.darkAppearance)
    XCTAssertEqual(hostConfiguration.focusedTerminal, configuration.focusedTerminal)
    XCTAssertEqual(hostConfiguration.hiddenTerminal, configuration.hiddenTerminal)
    XCTAssertEqual(hostConfiguration.pointerPassthrough, configuration.pointerPassthrough)
    XCTAssertEqual(hostConfiguration.terminalFontSize, configuration.terminalFontSize)
  }

  func testTerminalHostConfigurationEqualityTracksVisibleState() {
    let current = TerminalSurfaceConfiguration(
      workingDirectory: "/tmp/workspace",
      command: "exec tmux attach",
      backgroundHexColor: "#181614",
      themeConfigPath: "/tmp/theme",
      darkAppearance: true,
      focusedTerminal: true,
      hiddenTerminal: false,
      pointerPassthrough: false,
      terminalFontSize: 13
    ).hostConfiguration
    let next = TerminalSurfaceConfiguration(
      workingDirectory: "/tmp/workspace",
      command: "exec tmux attach",
      backgroundHexColor: "#181614",
      themeConfigPath: "/tmp/theme",
      darkAppearance: true,
      focusedTerminal: false,
      hiddenTerminal: true,
      pointerPassthrough: true,
      terminalFontSize: 13
    ).hostConfiguration

    XCTAssertNotEqual(current, next)
  }
}
