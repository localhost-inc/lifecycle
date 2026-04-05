import LifecycleGhosttyHost
import SwiftUI

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
    view.terminalID = surface.terminalID
    view.workingDirectory = surface.workingDirectory
    view.command = surface.command
    view.backgroundHexColor = backgroundHexColor
    view.themeConfigPath = themeConfigPath
    view.darkAppearance = darkAppearance
    view.focusedTerminal = isFocused && isVisible
    view.hiddenTerminal = !isVisible
    view.pointerPassthrough = !isVisible
    view.terminalFontSize = 13
    view.syncTerminal()
  }
}
