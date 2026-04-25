import SwiftUI

enum WorkspaceExtensionEmptyStateTone: Equatable {
  case neutral
  case warning
  case error
}

enum WorkspaceExtensionEmptyStateGlyphStyle: Equatable {
  case manifestMissing
  case stackUnconfigured
  case invalid
}

struct WorkspaceExtensionEmptyStateAsciiFrame: Equatable {
  let lines: [String]
}

struct WorkspaceExtensionEmptyStateAsciiAnimation: Equatable {
  let frameDuration: TimeInterval
  let stillFrameIndex: Int
  let frames: [WorkspaceExtensionEmptyStateAsciiFrame]
}

func workspaceExtensionEmptyStateGlyphStyle(
  symbolName: String,
  tone: WorkspaceExtensionEmptyStateTone
) -> WorkspaceExtensionEmptyStateGlyphStyle {
  switch symbolName {
  case "shippingbox.circle.fill":
    return .manifestMissing
  case "shippingbox.circle":
    return .stackUnconfigured
  case "exclamationmark.triangle.fill":
    return .invalid
  default:
    switch tone {
    case .warning:
      return .manifestMissing
    case .error:
      return .invalid
    case .neutral:
      return .stackUnconfigured
    }
  }
}

func workspaceExtensionEmptyStateAsciiAnimation(
  style: WorkspaceExtensionEmptyStateGlyphStyle
) -> WorkspaceExtensionEmptyStateAsciiAnimation {
  switch style {
  case .manifestMissing:
    return WorkspaceExtensionEmptyStateAsciiAnimation(
      frameDuration: 0.18,
      stillFrameIndex: 0,
      frames: [
        .init(lines: ["  .--. ", " /_  / ", "| {} | ", "| ?? | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| [] | ", "| ._ | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| <> | ", "| .. | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| {} | ", "| _  | ", "`----' "]),
      ]
    )
  case .stackUnconfigured:
    return WorkspaceExtensionEmptyStateAsciiAnimation(
      frameDuration: 0.2,
      stillFrameIndex: 0,
      frames: [
        .init(lines: [" .--.  ", "|_[]_| ", "| -- | ", "| -- | ", "`----' "]),
        .init(lines: [" .--.  ", "|_[]_| ", "| .. | ", "| -- | ", "`----' "]),
        .init(lines: [" .--.  ", "|_[]_| ", "| -- | ", "| .. | ", "`----' "]),
        .init(lines: [" .--.  ", "|_[]_| ", "| __ | ", "| -- | ", "`----' "]),
      ]
    )
  case .invalid:
    return WorkspaceExtensionEmptyStateAsciiAnimation(
      frameDuration: 0.16,
      stillFrameIndex: 0,
      frames: [
        .init(lines: ["  .--. ", " /_  / ", "| !! | ", "| xx | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| !< | ", "| xx | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| >< | ", "| !! | ", "`----' "]),
        .init(lines: ["  .--. ", " /_  / ", "| xx | ", "| !! | ", "`----' "]),
      ]
    )
  }
}

func workspaceExtensionEmptyStateAsciiFrame(
  style: WorkspaceExtensionEmptyStateGlyphStyle,
  step: Int,
  reduceMotion: Bool
) -> WorkspaceExtensionEmptyStateAsciiFrame {
  let animation = workspaceExtensionEmptyStateAsciiAnimation(style: style)
  let index = reduceMotion ? animation.stillFrameIndex : abs(step) % animation.frames.count
  return animation.frames[index]
}

struct WorkspaceExtensionEmptyStateView: View {
  @Environment(\.appTheme) private var theme

  let symbolName: String
  let title: String
  let description: String
  var tone: WorkspaceExtensionEmptyStateTone = .neutral
  var details: [String] = []

  var body: some View {
    VStack(spacing: 12) {
      WorkspaceExtensionEmptyStateGlyphView(
        symbolName: symbolName,
        tone: tone,
        accentColor: accentColor
      )

      VStack(spacing: 5) {
        Text(title)
          .font(.lc(size: 15, weight: .semibold))
          .foregroundStyle(theme.primaryTextColor)
          .multilineTextAlignment(.center)

        Text(description)
          .font(.lc(size: 12, weight: .medium))
          .foregroundStyle(theme.mutedColor.opacity(0.9))
          .multilineTextAlignment(.center)
          .frame(maxWidth: 250)
          .fixedSize(horizontal: false, vertical: true)
      }

      if !details.isEmpty {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(Array(details.enumerated()), id: \.offset) { _, detail in
            Text(detail)
              .font(.lc(size: 11, weight: .medium, design: .monospaced))
              .foregroundStyle(theme.primaryTextColor.opacity(0.84))
              .textSelection(.enabled)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        .frame(maxWidth: 290, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(theme.surfaceRaised.opacity(0.52))
        .overlay {
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .stroke(theme.borderColor.opacity(0.5), lineWidth: 1)
        }
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 18)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var accentColor: Color {
    switch tone {
    case .neutral:
      theme.accentColor
    case .warning:
      theme.warningColor
    case .error:
      theme.errorColor
    }
  }
}

private struct WorkspaceExtensionEmptyStateGlyphView: View {
  @Environment(\.accessibilityReduceMotion) private var accessibilityReduceMotion

  let symbolName: String
  let tone: WorkspaceExtensionEmptyStateTone
  let accentColor: Color

  var body: some View {
    let style = workspaceExtensionEmptyStateGlyphStyle(symbolName: symbolName, tone: tone)
    let animation = workspaceExtensionEmptyStateAsciiAnimation(style: style)

    TimelineView(.periodic(from: .now, by: animation.frameDuration)) { context in
      let frame = workspaceExtensionEmptyStateAsciiFrame(
        style: style,
        step: glyphStep(for: context.date, frameDuration: animation.frameDuration),
        reduceMotion: accessibilityReduceMotion
      )

      ZStack {
        asciiFrame(frame, opacityMultiplier: 0.18)
          .blur(radius: 0.45)
          .offset(y: 0.35)

        asciiFrame(frame, opacityMultiplier: 1)
      }
      .offset(y: 0.6)
    }
    .frame(width: 30, height: 30)
    .clipped()
    .accessibilityHidden(true)
  }

  private func glyphStep(for date: Date, frameDuration: TimeInterval) -> Int {
    Int(floor(date.timeIntervalSinceReferenceDate / frameDuration))
  }

  private func asciiFrame(
    _ frame: WorkspaceExtensionEmptyStateAsciiFrame,
    opacityMultiplier: Double
  ) -> some View {
    VStack(alignment: .leading, spacing: -2.3) {
      ForEach(Array(frame.lines.enumerated()), id: \.offset) { index, line in
        Text(verbatim: line)
          .font(.lc(size: 5.9, weight: .bold, design: .monospaced))
          .foregroundStyle(accentColor.opacity(lineOpacity(at: index) * opacityMultiplier))
          .tracking(-0.25)
          .lineLimit(1)
      }
    }
    .fixedSize()
  }

  private func lineOpacity(at index: Int) -> Double {
    switch index {
    case 0:
      0.58
    case 1, 2:
      0.98
    case 3:
      0.84
    default:
      0.7
    }
  }
}
