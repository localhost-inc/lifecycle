import SwiftUI
import LifecyclePresentation

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
    guard let terminalBinding = TerminalSurfaceBinding(binding: record.binding) else { return nil }

    let terminalRecord = context.terminalsByID[terminalBinding.terminalID]
    let title = terminalRecord?.title ?? record.title

    let content: AnySurfaceContent
    if let connection = context.connectionBySurfaceID[record.id],
       let backendLabel = context.backendLabel,
       let persistent = context.persistent,
       let command = bridgeTerminalCommandText(connection)
    {
      let resolved = ResolvedTerminalSurface(
        terminalID: terminalHostID(for: record.id),
        workingDirectory: context.workingDirectory,
        command: command,
        backendLabel: backendLabel,
        persistent: persistent,
        binding: terminalBinding,
        terminal: terminalRecord
      )

      content = AnySurfaceContent(id: record.id) { renderState in
        GhosttyTerminalSurfaceView(
          surface: resolved,
          themeConfigPath: context.themeConfigPath,
          backgroundHexColor: context.terminalBackgroundHexColor,
          darkAppearance: context.terminalDarkAppearance,
          isFocused: renderState.isFocused,
          isVisible: renderState.isVisible
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(nsColor: NSColor(themeHex: context.terminalBackgroundHexColor)))
      }
    } else {
      content = AnySurfaceContent(id: record.id) { _ in
        TerminalSurfacePendingView(
          title: title,
          terminalID: terminalBinding.terminalID,
          backendLabel: context.backendLabel,
          launchError: terminalLaunchError(
            backendLabel: context.backendLabel,
            connection: context.connectionBySurfaceID[record.id]
          )
        )
      }
    }

    let tab = SurfaceTabPresentation(
      title: title,
      subtitle: terminalRecord?.id ?? terminalBinding.terminalID,
      icon: "terminal"
    )

    return ResolvedSurface(
      content: content,
      tab: tab,
      isClosable: true
    )
  }
}

private struct TerminalSurfacePendingView: View {
  @Environment(\.appTheme) private var theme

  let title: String
  let terminalID: String
  let backendLabel: String?
  let launchError: String?

  var body: some View {
    VStack(spacing: 14) {
      if let launchError, !launchError.isEmpty {
        Image(systemName: "exclamationmark.triangle.fill")
          .font(.system(size: 22, weight: .semibold))
          .foregroundStyle(theme.errorColor)
      } else {
        ProgressView()
          .controlSize(.regular)
          .tint(theme.primaryTextColor)
      }

      VStack(spacing: 6) {
        Text(title)
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)

        Text(launchError ?? "Connecting terminal \(terminalID)...")
          .font(.system(size: 12, weight: .medium, design: .monospaced))
          .foregroundStyle(launchError == nil ? theme.mutedColor : theme.errorColor)
          .multilineTextAlignment(.center)

        if let backendLabel, !backendLabel.isEmpty {
          Text(backendLabel)
            .font(.system(size: 11, weight: .medium, design: .monospaced))
            .foregroundStyle(theme.mutedColor.opacity(0.72))
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(24)
    .background(theme.surfaceBackground)
  }
}

private func terminalLaunchError(
  backendLabel: String?,
  connection: BridgeTerminalConnection?
) -> String? {
  if let launchError = connection?.launchError?.trimmingCharacters(in: .whitespacesAndNewlines),
     !launchError.isEmpty
  {
    return launchError
  }

  if backendLabel == nil {
    return "Resolving terminal runtime..."
  }

  return nil
}
