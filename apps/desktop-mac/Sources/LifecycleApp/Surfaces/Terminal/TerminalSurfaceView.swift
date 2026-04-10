import LifecycleTerminalHost
import SwiftUI

struct TerminalSurfaceConfiguration: Equatable {
  let workingDirectory: String
  let command: String
  let backgroundHexColor: String
  let themeConfigPath: String
  let darkAppearance: Bool
  let focusedTerminal: Bool
  let hiddenTerminal: Bool
  let pointerPassthrough: Bool
  let terminalFontSize: CGFloat

  var hostConfiguration: LifecycleTerminalHostConfiguration {
    LifecycleTerminalHostConfiguration(
      workingDirectory: workingDirectory,
      command: command,
      backgroundHexColor: backgroundHexColor,
      themeConfigPath: themeConfigPath,
      darkAppearance: darkAppearance,
      focusedTerminal: focusedTerminal,
      hiddenTerminal: hiddenTerminal,
      pointerPassthrough: pointerPassthrough,
      terminalFontSize: terminalFontSize
    )
  }
}

struct TerminalSurfaceView: NSViewRepresentable {
  let surface: ResolvedTerminalSurface
  let themeConfigPath: String
  let backgroundHexColor: String
  let darkAppearance: Bool
  let isFocused: Bool
  let isVisible: Bool

  func makeNSView(context: Context) -> LifecycleTerminalHostView {
    let view = LifecycleTerminalHostView(terminalID: surface.terminalID)
    configure(view)
    return view
  }

  func updateNSView(_ nsView: LifecycleTerminalHostView, context: Context) {
    configure(nsView)
  }

  private func configure(_ view: LifecycleTerminalHostView) {
    let configuration = TerminalSurfaceConfiguration(
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
    view.applyHostConfiguration(configuration.hostConfiguration)
  }
}
