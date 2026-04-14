import SwiftUI

enum LCBadgeVariant {
  case filled
  case subtle
  case outline
}

enum LCBadgeSize {
  case small
  case medium
}

struct LCBadge: View {
  @Environment(\.appTheme) private var theme

  let label: String
  var color: Color?
  var variant: LCBadgeVariant = .subtle
  var size: LCBadgeSize = .small

  var body: some View {
    Text(label)
      .font(.lc(size: fontSize, weight: fontWeight, design: .monospaced))
      .foregroundStyle(foregroundColor)
      .padding(.horizontal, horizontalPadding)
      .padding(.vertical, verticalPadding)
      .background(
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .fill(backgroundColor)
      )
      .overlay(
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
          .strokeBorder(borderColor)
      )
  }

  private var resolvedColor: Color {
    color ?? theme.mutedColor
  }

  private var fontSize: CGFloat {
    switch size {
    case .small: 10
    case .medium: 11
    }
  }

  private var fontWeight: Font.Weight {
    switch variant {
    case .filled: .semibold
    case .subtle: .semibold
    case .outline: .medium
    }
  }

  private var horizontalPadding: CGFloat {
    switch size {
    case .small: 6
    case .medium: 8
    }
  }

  private var verticalPadding: CGFloat {
    switch size {
    case .small: 2
    case .medium: 3
    }
  }

  private var cornerRadius: CGFloat {
    switch size {
    case .small: 4
    case .medium: 5
    }
  }

  private var foregroundColor: Color {
    switch variant {
    case .filled: theme.shellBackground
    case .subtle: resolvedColor
    case .outline: resolvedColor
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .filled: resolvedColor
    case .subtle: resolvedColor.opacity(0.12)
    case .outline: Color.clear
    }
  }

  private var borderColor: Color {
    switch variant {
    case .filled: Color.clear
    case .subtle: Color.clear
    case .outline: resolvedColor.opacity(0.3)
    }
  }
}
