import SwiftUI

enum LCButtonVariant {
  case primary
  case secondary
  case ghost
  case chrome
}

enum LCButtonSize {
  case small
  case medium
}

enum LCButtonLayout {
  case standard
  case icon
}

struct LCButton: View {
  @Environment(\.appTheme) private var theme
  @Environment(\.isEnabled) private var environmentEnabled

  let variant: LCButtonVariant
  let size: LCButtonSize
  let layout: LCButtonLayout
  let isActive: Bool
  let isEnabled: Bool
  let action: () -> Void

  private let content: AnyView
  private let stylesLabelInternally: Bool

  @State private var isHovering = false

  init(
    label: String,
    variant: LCButtonVariant = .secondary,
    size: LCButtonSize = .medium,
    layout: LCButtonLayout = .standard,
    isActive: Bool = false,
    isEnabled: Bool = true,
    action: @escaping () -> Void
  ) {
    self.variant = variant
    self.size = size
    self.layout = layout
    self.isActive = isActive
    self.isEnabled = isEnabled
    self.action = action
    self.content = AnyView(Text(label))
    self.stylesLabelInternally = true
  }

  init<Label: View>(
    variant: LCButtonVariant = .secondary,
    size: LCButtonSize = .medium,
    layout: LCButtonLayout = .standard,
    isActive: Bool = false,
    isEnabled: Bool = true,
    action: @escaping () -> Void,
    @ViewBuilder label: () -> Label
  ) {
    self.variant = variant
    self.size = size
    self.layout = layout
    self.isActive = isActive
    self.isEnabled = isEnabled
    self.action = action
    self.content = AnyView(label())
    self.stylesLabelInternally = false
  }

  var body: some View {
    Button(action: action) {
      renderedLabel
        .background(
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(backgroundColor)
        )
        .overlay(
          RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .strokeBorder(borderColor)
        )
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .disabled(!controlEnabled)
    .shadow(
      color: shadowColor,
      radius: shadowRadius,
      x: 0,
      y: shadowYOffset
    )
    .opacity(controlOpacity)
    .onHover { hovering in
      isHovering = hovering && controlEnabled
    }
    .animation(.easeOut(duration: 0.16), value: isHovering)
    .animation(.easeOut(duration: 0.16), value: isActive)
  }

  private var controlEnabled: Bool {
    environmentEnabled && isEnabled
  }

  @ViewBuilder
  private var renderedLabel: some View {
    let baseLabel: AnyView = if stylesLabelInternally {
      AnyView(
        content
          .font(.system(size: fontSize, weight: fontWeight))
          .foregroundStyle(foregroundColor)
      )
    } else {
      content
    }

    switch layout {
    case .standard:
      baseLabel
        .padding(.horizontal, horizontalPadding)
        .padding(.vertical, verticalPadding)
    case .icon:
      baseLabel
        .frame(width: 28, height: 28)
    }
  }

  private var fontSize: CGFloat {
    switch size {
    case .small: 11
    case .medium: 12
    }
  }

  private var fontWeight: Font.Weight {
    switch variant {
    case .primary, .chrome: .semibold
    case .secondary, .ghost: .medium
    }
  }

  private var horizontalPadding: CGFloat {
    switch variant {
    case .chrome:
      return 10
    case .primary, .secondary, .ghost:
      switch size {
      case .small:
        return 10
      case .medium:
        return 14
      }
    }
  }

  private var verticalPadding: CGFloat {
    switch variant {
    case .chrome:
      return 6
    case .primary, .secondary, .ghost:
      switch size {
      case .small:
        return 4
      case .medium:
        return 6
      }
    }
  }

  private var cornerRadius: CGFloat {
    switch variant {
    case .chrome:
      return 7
    case .primary, .secondary, .ghost:
      return 8
    }
  }

  private var foregroundColor: Color {
    switch variant {
    case .primary: theme.shellBackground
    case .secondary: theme.primaryTextColor
    case .ghost: theme.mutedColor
    case .chrome: theme.primaryTextColor
    }
  }

  private var backgroundColor: Color {
    switch variant {
    case .primary:
      return theme.primaryTextColor
    case .secondary, .ghost:
      return .clear
    case .chrome:
      if !controlEnabled {
        return theme.surfaceRaised.opacity(0.55)
      }

      if isHovering || isActive {
        return theme.panelBackground.opacity(0.98)
      }

      return theme.panelBackground.opacity(0.9)
    }
  }

  private var borderColor: Color {
    switch variant {
    case .primary, .ghost:
      return .clear
    case .secondary:
      return theme.borderColor
    case .chrome:
      if !controlEnabled {
        return theme.borderColor.opacity(0.45)
      }

      if isActive {
        return theme.borderColor.opacity(0.88)
      }

      return theme.borderColor.opacity(isHovering ? 0.8 : 0.62)
    }
  }

  private var shadowColor: Color {
    guard variant == .chrome, controlEnabled else {
      return .clear
    }

    if isHovering || isActive {
      return theme.cardShadowColor.opacity(0.92)
    }

    return theme.cardShadowColor.opacity(0.72)
  }

  private var shadowRadius: CGFloat {
    guard variant == .chrome, controlEnabled else {
      return 0
    }

    return (isHovering || isActive) ? 2.25 : 1.25
  }

  private var shadowYOffset: CGFloat {
    guard variant == .chrome, controlEnabled else {
      return 0
    }

    return (isHovering || isActive) ? 1.25 : 0.75
  }

  private var controlOpacity: Double {
    switch variant {
    case .chrome:
      return controlEnabled ? 1 : 0.82
    case .primary, .secondary, .ghost:
      return controlEnabled ? 1 : 0.5
    }
  }
}
