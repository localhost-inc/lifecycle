import SwiftUI

enum LCButtonVariant {
  case primary
  case secondary
  case ghost
}

enum LCButtonSize {
  case small
  case medium
}

struct LCButton: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.isEnabled) private var isEnabled

  let label: String
  var variant: LCButtonVariant = .secondary
  var size: LCButtonSize = .medium
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: fontSize, weight: fontWeight))
        .foregroundStyle(foregroundColor)
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
        .background(
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .fill(backgroundColor)
        )
        .overlay(
          RoundedRectangle(cornerRadius: 8, style: .continuous)
            .strokeBorder(borderColor)
        )
    }
    .buttonStyle(.plain)
    .opacity(isEnabled ? 1 : 0.5)
  }

  private var fontSize: CGFloat {
    switch size {
    case .small: 11
    case .medium: 12
    }
  }

  private var fontWeight: Font.Weight {
    switch variant {
    case .primary: .semibold
    case .secondary, .ghost: .medium
    }
  }

  private var horizontalPadding: CGFloat {
    switch size {
    case .small: 10
    case .medium: 14
    }
  }

  private var verticalPadding: CGFloat {
    switch size {
    case .small: 4
    case .medium: 6
    }
  }

  private var foregroundColor: Color {
    switch variant {
    case .primary: theme.shellBackground
    case .secondary: theme.primaryTextColor
    case .ghost: theme.mutedColor
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .primary: theme.primaryTextColor
    case .secondary: Color.clear
    case .ghost: Color.clear
    }
  }

  private var borderColor: Color {
    switch variant {
    case .primary: Color.clear
    case .secondary: theme.borderColor
    case .ghost: Color.clear
    }
  }
}
