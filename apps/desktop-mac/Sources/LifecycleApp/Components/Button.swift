import SwiftUI

enum LCButtonVariant {
  case primary
  case secondary
  case ghost
  case chrome
  case surface
}

enum LCButtonSize {
  case small
  case medium
}

enum LCButtonLayout {
  case standard
  case icon
}

struct LCButtonPalette: Equatable {
  let foregroundHex: String
  let foregroundOpacity: Double
  let backgroundHex: String?
  let backgroundOpacity: Double
  let borderHex: String?
  let borderOpacity: Double
  let controlOpacity: Double
}

extension AppTheme {
  func buttonPalette(
    for variant: LCButtonVariant,
    isEnabled: Bool,
    isHovering: Bool,
    isActive: Bool
  ) -> LCButtonPalette {
    switch variant {
    case .primary:
      if isDarkAppearance {
        return LCButtonPalette(
          foregroundHex: background,
          foregroundOpacity: 1,
          backgroundHex: foreground,
          backgroundOpacity: 1,
          borderHex: nil,
          borderOpacity: 0,
          controlOpacity: isEnabled ? 1 : 0.5
        )
      }

      return LCButtonPalette(
        foregroundHex: foreground,
        foregroundOpacity: 1,
        backgroundHex: isHovering || isActive ? glass : card,
        backgroundOpacity: 1,
        borderHex: border,
        borderOpacity: isEnabled ? ((isHovering || isActive) ? 0.78 : 0.62) : 0.45,
        controlOpacity: isEnabled ? 1 : 0.5
      )
    case .secondary:
      return LCButtonPalette(
        foregroundHex: foreground,
        foregroundOpacity: 1,
        backgroundHex: nil,
        backgroundOpacity: 0,
        borderHex: border,
        borderOpacity: 1,
        controlOpacity: isEnabled ? 1 : 0.5
      )
    case .ghost:
      return LCButtonPalette(
        foregroundHex: mutedForeground,
        foregroundOpacity: 1,
        backgroundHex: nil,
        backgroundOpacity: 0,
        borderHex: nil,
        borderOpacity: 0,
        controlOpacity: isEnabled ? 1 : 0.5
      )
    case .surface:
      return LCButtonPalette(
        foregroundHex: foreground,
        foregroundOpacity: 1,
        backgroundHex: isEnabled ? ((isHovering || isActive) ? surfaceHover : surface) : surface,
        backgroundOpacity: isEnabled ? 1 : 0.9,
        borderHex: border,
        borderOpacity: isEnabled ? (isActive ? 0.88 : (isHovering ? 0.8 : 0.62)) : 0.45,
        controlOpacity: isEnabled ? 1 : 0.82
      )
    case .chrome:
      return LCButtonPalette(
        foregroundHex: foreground,
        foregroundOpacity: 1,
        backgroundHex: card,
        backgroundOpacity: isEnabled ? ((isHovering || isActive) ? 0.98 : 0.9) : 0.55,
        borderHex: border,
        borderOpacity: isEnabled ? (isActive ? 0.88 : (isHovering ? 0.8 : 0.62)) : 0.45,
        controlOpacity: isEnabled ? 1 : 0.82
      )
    }
  }
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

  private var palette: LCButtonPalette {
    theme.buttonPalette(
      for: variant,
      isEnabled: controlEnabled,
      isHovering: isHovering,
      isActive: isActive
    )
  }

  @ViewBuilder
  private var renderedLabel: some View {
    let baseLabel: AnyView = if stylesLabelInternally {
      AnyView(
        content
          .font(.lc(size: fontSize, weight: fontWeight))
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
    case .primary, .chrome, .surface: .semibold
    case .secondary, .ghost: .medium
    }
  }

  private var horizontalPadding: CGFloat {
    switch variant {
    case .chrome, .surface:
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
    case .chrome, .surface:
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
    case .chrome, .surface:
      return 7
    case .primary, .secondary, .ghost:
      return 8
    }
  }

  private var foregroundColor: Color {
    Color(nsColor: NSColor(themeHex: palette.foregroundHex))
      .opacity(palette.foregroundOpacity)
  }

  private var backgroundColor: Color {
    guard let backgroundHex = palette.backgroundHex else {
      return .clear
    }

    return Color(nsColor: NSColor(themeHex: backgroundHex))
      .opacity(palette.backgroundOpacity)
  }

  private var borderColor: Color {
    guard let borderHex = palette.borderHex else {
      return .clear
    }

    return Color(nsColor: NSColor(themeHex: borderHex))
      .opacity(palette.borderOpacity)
  }

  private var shadowColor: Color {
    guard controlEnabled else {
      return .clear
    }

    switch variant {
    case .chrome:
      if isHovering || isActive {
        return theme.cardShadowColor.opacity(0.92)
      }

      return theme.cardShadowColor.opacity(0.72)
    case .surface, .primary, .secondary, .ghost:
      return .clear
    }
  }

  private var shadowRadius: CGFloat {
    guard controlEnabled else {
      return 0
    }

    switch variant {
    case .chrome:
      return (isHovering || isActive) ? 2.25 : 1.25
    case .surface, .primary, .secondary, .ghost:
      return 0
    }
  }

  private var shadowYOffset: CGFloat {
    guard controlEnabled else {
      return 0
    }

    switch variant {
    case .chrome:
      return (isHovering || isActive) ? 1.25 : 0.75
    case .surface, .primary, .secondary, .ghost:
      return 0
    }
  }

  private var controlOpacity: Double {
    palette.controlOpacity
  }
}
