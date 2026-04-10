import SwiftUI

enum LifecycleLogoSize {
  case small
  case medium

  var dimensions: CGSize {
    switch self {
    case .small:
      CGSize(width: 34, height: 18)
    case .medium:
      CGSize(width: 44, height: 24)
    }
  }

  var fallbackFont: Font {
    switch self {
    case .small:
      .system(size: 11, weight: .semibold, design: .monospaced)
    case .medium:
      .system(size: 12, weight: .semibold, design: .monospaced)
    }
  }
}

struct LifecycleLogo: View {
  @Environment(\.appTheme) private var theme

  var size: LifecycleLogoSize = .medium
  var foregroundOpacity: Double = 0.72

  var body: some View {
    Group {
      if let logo = AppResources.lifecycleLogoImage {
        Image(nsImage: logo)
          .renderingMode(.template)
          .interpolation(.high)
          .resizable()
          .scaledToFit()
          .accessibilityLabel("Lifecycle")
      } else {
        Text("lifecycle")
          .font(size.fallbackFont)
          .lineLimit(1)
      }
    }
    .frame(
      width: size.dimensions.width,
      height: size.dimensions.height,
      alignment: .leading
    )
    .foregroundStyle(theme.sidebarMutedForegroundColor.opacity(foregroundOpacity))
  }
}
