import SwiftUI

struct LCTabBar<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    HStack(spacing: 4) {
      content()
    }
  }
}

struct LCTabItem: View {
  @Environment(\.appTheme) private var theme
  let label: String
  let isActive: Bool
  let namespace: Namespace.ID
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(label)
        .font(.system(size: 12, weight: isActive ? .semibold : .medium))
        .foregroundStyle(isActive ? theme.primaryTextColor : theme.mutedColor)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background {
          if isActive {
            Capsule(style: .continuous)
              .fill(theme.surfaceRaised)
              .matchedGeometryEffect(id: "tab-pill", in: namespace)
          }
        }
        .overlay {
          Capsule(style: .continuous)
            .strokeBorder(isActive ? theme.borderColor : Color.clear)
        }
    }
    .buttonStyle(.plain)
  }
}
