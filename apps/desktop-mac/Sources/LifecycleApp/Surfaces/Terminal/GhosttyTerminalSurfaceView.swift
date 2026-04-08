import LifecycleGhosttyHost
import SwiftUI

struct GhosttyTerminalSurfaceConfiguration: Equatable {
  let terminalID: String
  let workingDirectory: String?
  let command: String?
  let backgroundHexColor: String
  let themeConfigPath: String
  let darkAppearance: Bool
  let focusedTerminal: Bool
  let hiddenTerminal: Bool
  let pointerPassthrough: Bool
  let terminalFontSize: CGFloat
}

func ghosttyTerminalSurfaceConfigurationChanged(
  current: GhosttyTerminalSurfaceConfiguration,
  next: GhosttyTerminalSurfaceConfiguration
) -> Bool {
  current != next
}

struct GhosttyTerminalSurfaceView: NSViewRepresentable {
  let surface: ResolvedTerminalSurface
  let themeConfigPath: String
  let backgroundHexColor: String
  let darkAppearance: Bool
  let isFocused: Bool
  let isVisible: Bool

  func makeNSView(context: Context) -> LifecycleGhosttyTerminalHostView {
    let view = LifecycleGhosttyTerminalHostView(terminalID: surface.terminalID)
    configure(view)
    return view
  }

  func updateNSView(_ nsView: LifecycleGhosttyTerminalHostView, context: Context) {
    configure(nsView)
  }

  private func configure(_ view: LifecycleGhosttyTerminalHostView) {
    let nextConfiguration = GhosttyTerminalSurfaceConfiguration(
      terminalID: surface.terminalID,
      workingDirectory: surface.workingDirectory,
      command: surface.command,
      backgroundHexColor: backgroundHexColor,
      themeConfigPath: themeConfigPath,
      darkAppearance: darkAppearance,
      focusedTerminal: isFocused && isVisible,
      hiddenTerminal: !isVisible,
      pointerPassthrough: !isVisible,
      terminalFontSize: 13
    )
    let currentConfiguration = GhosttyTerminalSurfaceConfiguration(
      terminalID: view.terminalID,
      workingDirectory: view.workingDirectory,
      command: view.command,
      backgroundHexColor: view.backgroundHexColor,
      themeConfigPath: view.themeConfigPath,
      darkAppearance: view.darkAppearance,
      focusedTerminal: view.focusedTerminal,
      hiddenTerminal: view.hiddenTerminal,
      pointerPassthrough: view.pointerPassthrough,
      terminalFontSize: view.terminalFontSize
    )

    view.terminalID = nextConfiguration.terminalID
    view.workingDirectory = nextConfiguration.workingDirectory
    view.command = nextConfiguration.command
    view.backgroundHexColor = nextConfiguration.backgroundHexColor
    view.themeConfigPath = nextConfiguration.themeConfigPath
    view.darkAppearance = nextConfiguration.darkAppearance
    view.focusedTerminal = nextConfiguration.focusedTerminal
    view.hiddenTerminal = nextConfiguration.hiddenTerminal
    view.pointerPassthrough = nextConfiguration.pointerPassthrough
    view.terminalFontSize = nextConfiguration.terminalFontSize

    if ghosttyTerminalSurfaceConfigurationChanged(
      current: currentConfiguration,
      next: nextConfiguration
    ) {
      view.syncTerminal()
    }
  }
}
