import LifecycleGhosttyHost
import SwiftUI

struct GhosttyTerminalSurfaceView: NSViewRepresentable {
  let surface: ResolvedTerminalSurface
  let themeConfigPath: String
  let backgroundHexColor: String
  let isFocused: Bool

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
    view.darkAppearance = true
    view.focusedTerminal = isFocused
    view.hiddenTerminal = false
    view.pointerPassthrough = false
    view.terminalFontSize = 13
    view.syncTerminal()
  }
}
