import SwiftUI

// MARK: - Terminal Surface Binding

struct TerminalSurfaceBinding: Hashable {
  let workspaceID: String
  let terminalID: String

  init(workspaceID: String, terminalID: String) {
    self.workspaceID = workspaceID
    self.terminalID = terminalID
  }

  init?(binding: SurfaceBinding) {
    guard let workspaceID = binding.string(for: "workspaceID"),
          let terminalID = binding.string(for: "terminalID")
    else { return nil }
    self.workspaceID = workspaceID
    self.terminalID = terminalID
  }

  var surfaceBinding: SurfaceBinding {
    SurfaceBinding(params: [
      "workspaceID": workspaceID,
      "terminalID": terminalID,
    ])
  }
}

// MARK: - Resolved Terminal Surface

struct ResolvedTerminalSurface: Hashable {
  let terminalID: String
  let workingDirectory: String
  let command: String
  let backendLabel: String
  let persistent: Bool
  let binding: TerminalSurfaceBinding
  let terminal: BridgeTerminalRecord?
}

// MARK: - Terminal Surface Definition

struct TerminalSurfaceDefinition: SurfaceDefinition {
  let kind = SurfaceKind.terminal

  func resolve(
    record: CanvasSurfaceRecord,
    context: SurfaceResolutionContext
  ) -> ResolvedSurface? {
    guard let terminalBinding = TerminalSurfaceBinding(binding: record.binding),
          let connection = context.connectionBySurfaceID[record.id],
          let command = bridgeTerminalCommandText(connection)
    else { return nil }

    let terminalRecord = context.terminalsByID[terminalBinding.terminalID]
    let title = terminalRecord?.title ?? record.title
    let resolved = ResolvedTerminalSurface(
      terminalID: terminalHostID(for: record.id),
      workingDirectory: context.workingDirectory,
      command: command,
      backendLabel: context.backendLabel,
      persistent: context.persistent,
      binding: terminalBinding,
      terminal: terminalRecord
    )

    let content = AnySurfaceContent(id: record.id) { isFocused in
      GhosttyTerminalSurfaceView(
        surface: resolved,
        themeConfigPath: context.themeConfigPath,
        backgroundHexColor: "#181614",
        isFocused: isFocused
      )
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(Color.black)
    }

    let tab = SurfaceTabPresentation(
      title: title,
      subtitle: terminalRecord?.id ?? terminalBinding.terminalID,
      icon: "terminal"
    )

    return ResolvedSurface(
      content: content,
      tab: tab,
      isClosable: (terminalRecord?.closable ?? false)
    )
  }
}
